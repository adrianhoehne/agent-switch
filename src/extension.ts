import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

import type { AgentDefinition, ThinkingLevel } from "./agents";
import { loadAgents } from "./agents";
import { applySelection } from "./apply";
import type { SelectionDeps } from "./apply";
import { applyAgentToPromptOptions } from "./prompt";
import type { CycleEntry } from "./state";
import {
  MAIN_LABEL,
  STATE_CUSTOM_TYPE,
  buildCycleList,
  findEntry,
  lastSelectedLabel,
  nextLabel,
} from "./state";

/**
 * Two keys, one action.
 *
 * `shift+tab` is the key this extension started with: it arrives as `ESC[Z` on
 * every terminal and stays distinguishable even where the shift modifier is not
 * reported separately — that gap is what made a `ctrl+shift+…` id unreliable
 * (plain xterm, tmux with `extended-keys off`, most macOS terminals). It is not
 * free: pi's built-in `app.thinking.cycle` owns it, and pi drops an extension
 * shortcut that collides with a reserved built-in, so `<agent-dir>/keybindings.json`
 * must carry `{ "app.thinking.cycle": [] }` — the empty list is how pi disables an
 * action's bindings. The trade is accepted: `/thinking [level]` still sets the
 * level.
 *
 * `f2` is the second key and needs no configuration at all: no pi default binding
 * uses a function key, so nothing has to be released for it, and where a terminal
 * sends `f2` it arrives as a fixed escape sequence. That is the combination that
 * keeps the cycle reachable for an operator who does not want to give `shift+tab`
 * away.
 *
 * Literal key ids, not ones built with `Key`: `Key` lives in
 * `@earendil-works/pi-tui` and is not re-exported by
 * `@earendil-works/pi-coding-agent`, so building them would add a direct
 * dependency for strings pi matches verbatim anyway.
 */
const SHORTCUT_KEYS = ["shift+tab", "f2"] as const;
const [SHORTCUT_KEY, SECOND_SHORTCUT_KEY] = SHORTCUT_KEYS;

/** Footer status slot. One segment next to pi's own; no custom footer. */
const STATUS_KEY = "agent";

/** One cycle press moves one step: recorded in the session, shown in the footer. */
const SHORTCUT_DESCRIPTION = "Switch the main agent's system prompt";

/**
 * The model type this context hands out, spelled from the context itself: `Model`
 * lives in `@earendil-works/pi-ai`, which is not a dependency of this extension.
 */
type AvailableModel = ReturnType<ExtensionContext["modelRegistry"]["getAvailable"]>[number];

/**
 * The session's starting state, captured once and restored by `Main`.
 *
 * `model` is `Model | undefined` because `ctx.model` is: a session can reach the
 * handler before a model is resolved, and a snapshot that pretends otherwise would
 * only move the problem into a cast.
 */
interface MainState {
  readonly model: ExtensionContext["model"];
  readonly thinking: ThinkingLevel;
}

/**
 * The selection a resume should continue with, and the label that had to be
 * abandoned because its agent file is gone.
 *
 * Both fields are needed: `label` alone would hide the case that deserves a
 * warning, and the warning is the only thing telling the operator why the footer
 * no longer shows the agent they left the session on.
 */
interface RestoredSelection {
  readonly label: string;
  readonly missingLabel: string | null;
}

/**
 * Build the cycle from the agent files pi would find for this session.
 *
 * Every skipped file is surfaced as a warning: an agent silently missing from the
 * cycle looks like the extension is broken, and the reason (bad frontmatter, empty
 * body, reserved name, too large) is the hint that fixes it.
 */
function loadCycle(ctx: ExtensionContext): CycleEntry[] {
  const discovered = loadAgents(ctx.cwd, getAgentDir(), {
    onSkip: (path, reason) => ctx.ui.notify(`Agent file skipped: ${path} — ${reason}`, "warning"),
  });
  return buildCycleList(discovered);
}

/**
 * The label a resumed session continues with. A stored label that no longer
 * resolves means the agent file was deleted between sessions; the reset position is
 * the only safe answer, and the caller warns about it.
 */
function restoreSelection(
  cycle: readonly CycleEntry[],
  entries: readonly SessionEntry[],
): RestoredSelection {
  const storedLabel = lastSelectedLabel(entries);
  if (storedLabel === null) {
    return { label: MAIN_LABEL, missingLabel: null };
  }

  const entry = findEntry(cycle, storedLabel);
  if (entry === undefined) {
    return { label: MAIN_LABEL, missingLabel: storedLabel };
  }
  return { label: entry.label, missingLabel: null };
}

/**
 * Put the session's starting state back, as far as pi allows.
 *
 * A snapshot without a model is a session that reached the first press before a
 * model was resolved: the level is still worth restoring, and staying quiet about
 * the model is honest — there is nothing to put back.
 *
 * `Main` fails the same way an agent can: `setModel` throws for a model whose
 * credentials are gone, and a snapshot can outlive its key. `false` and a throw are
 * one outcome here — warn, keep the current model, still restore the level.
 *
 * The snapshot's `Model` is passed through, never resolved back through a
 * reference string: that round trip would cost a `getAvailable()` call and warn
 * spuriously on a scoped model list.
 */
async function restoreMain(
  snapshot: MainState | null,
  deps: SelectionDeps<AvailableModel>,
): Promise<void> {
  if (snapshot === null) {
    // No snapshot is normal, not a failure: the key may never have left `Main`, or
    // the session was resumed and the snapshot is deliberately not persisted. A
    // warning here would report a limit as a fault.
    return;
  }

  const model = snapshot.model;
  if (model !== undefined) {
    await restoreSnapshotModel(model, deps);
  }
  // No `try`, unlike `applySelection`: pi clamps a level it cannot honour instead
  // of refusing it, so there is no refusal for this call to report.
  deps.setThinkingLevel(snapshot.thinking);
}

/** The model half of a `Main` restore: `false` and a throw are the same outcome. */
async function restoreSnapshotModel(
  model: AvailableModel,
  deps: SelectionDeps<AvailableModel>,
): Promise<void> {
  const reference = `${model.provider}/${model.id}`;
  try {
    if (await deps.setModel(model)) {
      return;
    }
  } catch (error) {
    deps.warn(
      `The model "${reference}" the session started with could not be restored (${describeError(error)}) — keeping the current model.`,
    );
    return;
  }
  deps.warn(
    `The model "${reference}" the session started with was refused — keeping the current model.`,
  );
}

/**
 * Wire the shortcut, the footer status and the prompt swap of one pi session.
 *
 * The factory keeps three pieces of state in its closure: the cycle built at
 * `session_start`, the current label and — derived from both on every use — the
 * agent to apply. Nothing is loaded at factory time: pi calls the factory before a
 * session exists, so `session_start` is the only place `ctx.cwd` is known.
 */
export default function agentSwitch(pi: ExtensionAPI): void {
  let cycle: CycleEntry[] = [];
  let currentLabel = MAIN_LABEL;

  /**
   * The state `Main` restores. Captured once, on the first press that leaves
   * `Main`, and kept for the rest of the session: moving between two agents must
   * not move the target `Main` returns to.
   *
   * In memory only. A resumed session has no snapshot, so `Main` applies nothing
   * there — the documented limit of this increment, not a fault.
   */
  let mainSnapshot: MainState | null = null;

  /**
   * The pi-facing half of a selection. Built per call and never cached: `ctx`
   * differs between `session_start` and a keypress, and a cached one would write
   * into a context that is no longer the live session.
   */
  function selectionDeps(ctx: ExtensionContext): SelectionDeps<AvailableModel> {
    return {
      available: ctx.modelRegistry.getAvailable(),
      setModel: (model) => pi.setModel(model),
      setThinkingLevel: (level) => pi.setThinkingLevel(level),
      warn: (message) => ctx.ui.notify(message, "warning"),
    };
  }

  function setLabel(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, currentLabel);
  }

  function selectedAgent(): AgentDefinition | null {
    // A missing entry is the reset position, never a crash: the cycle can be
    // rebuilt without the label that is currently selected (`session_start` after a
    // reload), and `?? null` keeps that case on pi's own prompt.
    return findEntry(cycle, currentLabel)?.agent ?? null;
  }

  // Assigning a freshly built list rather than appending: `session_start` fires
  // again on resume and reload, and a second load must not double the cycle.
  pi.on("session_start", async (_event, ctx) => {
    cycle = loadCycle(ctx);
    const restored = restoreSelection(cycle, ctx.sessionManager.getEntries());
    currentLabel = restored.label;
    if (restored.missingLabel !== null) {
      ctx.ui.notify(
        `Agent "${restored.missingLabel}" is no longer available — staying on ${MAIN_LABEL}.`,
        "warning",
      );
    }
    setLabel(ctx);

    // The one place this extension applies a selection without a keypress: a resumed
    // session must continue on the agent it left off on, not merely show its name in
    // the footer. The failure rule is the keypress's: whatever cannot be applied is
    // warned about and the current model stays.
    //
    // This handler can never capture the snapshot, because it contains no capture
    // statement. It must not gain one: pi persists the session model in the
    // transcript, so `ctx.model` is already the resumed agent's model here, and a
    // snapshot taken now would record that as the session's starting state.
    if (currentLabel !== MAIN_LABEL) {
      await applySelection(selectedAgent(), selectionDeps(ctx));
    }
  });

  /**
   * One press, one step — the whole cycle, shared by both keys.
   *
   * Deliberately a single function registered twice: two copies would drift, and a
   * fix in one would then silently skip the other. It is registered by reference
   * for the same reason; an arrow wrapper per registration would compile and make
   * "both keys reach the same handler" a claim nobody can check.
   */
  async function cycleAgent(ctx: ExtensionContext): Promise<void> {
    // An empty cycle means no `session_start` has run yet (a fresh session, a
    // reload in progress): there is no stop to advance to, so the press does
    // nothing — no entry for a selection nobody made, no footer write naming a
    // stop that does not exist, and no throw into pi mid-keypress.
    if (cycle.length === 0) {
      return;
    }

    // A swap mid-run would let a response and its tool continuation run on two
    // different models. The press is rejected instead of queued: the operator
    // presses again once the run is over.
    if (!ctx.isIdle()) {
      ctx.ui.notify(
        "A response is still streaming — the agent is switched once it is idle.",
        "warning",
      );
      return;
    }

    // Read before the label moves: once `currentLabel` names the next stop, the
    // information "we are leaving Main" is gone.
    const previousLabel = currentLabel;
    currentLabel = nextLabel(cycle, currentLabel);
    if (previousLabel === MAIN_LABEL && mainSnapshot === null) {
      // The one and only capture site. In `session_start` it would be wrong: pi
      // persists the session model in the transcript, so a resumed session's
      // `ctx.model` is already the agent's model and the snapshot would record
      // that as the starting state.
      //
      // `pi.getThinkingLevel()`, not `ctx.thinkingLevel`: the context member is
      // optional and this snapshot needs a value.
      mainSnapshot = { model: ctx.model, thinking: pi.getThinkingLevel() };
    }

    pi.appendEntry(STATE_CUSTOM_TYPE, { name: currentLabel });
    setLabel(ctx);

    const deps = selectionDeps(ctx);
    const agent = selectedAgent();
    await (agent === null ? restoreMain(mainSnapshot, deps) : applySelection(agent, deps));
  }

  // Two statements, not a loop over `SHORTCUT_KEYS`: the pair is spelled out so
  // that reading the wiring takes no indirection.
  pi.registerShortcut(SHORTCUT_KEY, {
    description: SHORTCUT_DESCRIPTION,
    handler: cycleAgent,
  });
  pi.registerShortcut(SECOND_SHORTCUT_KEY, {
    description: SHORTCUT_DESCRIPTION,
    handler: cycleAgent,
  });

  pi.on("before_agent_start", (event) => {
    // The options object is mutated in place, exactly where pi reads it from. The
    // handler returns `undefined` on purpose: returning a `systemPrompt` would
    // replace the whole prompt and drop `AGENTS.md`, the skills and every extension
    // section for that run.
    applyAgentToPromptOptions(event.systemPromptOptions, selectedAgent());
    return undefined;
  });
}

/** A warning has to say what went wrong, and an unknown throw has no `message`. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
