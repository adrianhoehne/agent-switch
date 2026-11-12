import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

import type { AgentDefinition } from "./agents";
import { loadAgents } from "./agents";
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
 * Literal key id, not `Key.ctrlShift("a")`: `Key` lives in `@earendil-works/pi-tui`
 * and is not re-exported by `@earendil-works/pi-coding-agent`, so building the id
 * would add a direct dependency for a string pi matches verbatim anyway.
 */
const SHORTCUT_KEY = "ctrl+shift+a";

/** Footer status slot. One segment next to pi's own; no custom footer. */
const STATUS_KEY = "agent";

/** One cycle press moves one step: recorded in the session, shown in the footer. */
const SHORTCUT_DESCRIPTION = "Switch the main agent's system prompt";

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
  pi.on("session_start", (_event, ctx) => {
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
  });

  pi.registerShortcut(SHORTCUT_KEY, {
    description: SHORTCUT_DESCRIPTION,
    handler: (ctx) => {
      // An empty cycle means no `session_start` has run yet (a fresh session, a
      // reload in progress): there is no stop to advance to, so the press does
      // nothing — no entry for a selection nobody made, no footer write naming a
      // stop that does not exist, and no throw into pi mid-keypress.
      if (cycle.length === 0) {
        return;
      }
      currentLabel = nextLabel(cycle, currentLabel);
      pi.appendEntry(STATE_CUSTOM_TYPE, { name: currentLabel });
      setLabel(ctx);
    },
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
