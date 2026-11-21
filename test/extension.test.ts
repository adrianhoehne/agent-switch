import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  NormalizedBuildSystemPromptOptions,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it } from "vitest";

import agentSwitch from "../src/extension";
import type { ThinkingLevel } from "../src/agents";
import { MAIN_LABEL, STATE_CUSTOM_TYPE } from "../src/state";

/**
 * `ENV_AGENT_DIR` from pi's config module is not part of its public entry point, so
 * the name is spelled out here. Pointing it at the fixture keeps the cycle
 * independent of whatever agent files the machine happens to carry in
 * `~/.pi/agent/agents` — without it every assertion below would depend on the
 * operator's home directory.
 */
const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";

const PI_ROLE_PROMPT = "pi's own role prompt";
const REVIEWER_PROMPT = "You review code.";

interface ExtensionFixture {
  /** Stands in for the project working directory of the session. */
  readonly cwd: string;
  /**
   * Writes one project agent file and returns its absolute path. `frontmatter`
   * adds the fields under test (`model`, `thinking`) next to the generated `name`.
   */
  writeAgent(name: string, body: string, frontmatter?: Record<string, string>): string;
  remove(): void;
}

let fixture: ExtensionFixture;

beforeEach(() => {
  fixture = createFixture();
});

afterEach(() => {
  fixture.remove();
});

/**
 * One `mkdtemp` root per case: `<root>/agent-home` (the global tier, kept empty so
 * nothing from the real machine leaks in) and `<root>/project-root` (the session's
 * `cwd`, where `.pi/agents` is the highest-precedence tier).
 */
function createFixture(): ExtensionFixture {
  const root = mkdtempSync(join(tmpdir(), "agent-switch-extension-"));
  const cwd = join(root, "project-root");
  const agentDir = join(root, "agent-home");
  const projectAgents = join(cwd, ".pi", "agents");
  mkdirSync(projectAgents, { recursive: true });
  mkdirSync(join(agentDir, "agents"), { recursive: true });

  const previousAgentDir = process.env[ENV_AGENT_DIR];
  process.env[ENV_AGENT_DIR] = agentDir;

  return {
    cwd,
    writeAgent(name, body, frontmatter = {}) {
      const path = join(projectAgents, `${name}.md`);
      // `name` first so a case cannot accidentally shadow the file's identity; the
      // optional fields follow in insertion order, which is the order the operator
      // reads.
      const header = Object.entries({ name, ...frontmatter })
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
      writeFileSync(path, `---\n${header}\n---\n\n${body}\n`, "utf8");
      return path;
    },
    remove() {
      restoreEnvironmentVariable(ENV_AGENT_DIR, previousAgentDir);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** `undefined` means "was not set before this case", which `delete` is the way back from. */
function restoreEnvironmentVariable(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}

/** What the extension registered, as far as the stub could see it. */
type RecordedHandler = (event: unknown, ctx: ExtensionContext) => unknown;
interface RecordedShortcut {
  readonly key: string;
  readonly description: string | undefined;
  readonly handler: (ctx: ExtensionContext) => Promise<void> | void;
}

interface RecordedEntry {
  readonly customType: string;
  readonly data: { name: string };
}

/** A stand-in for pi's `Model`, reduced to the two fields every comparison reads. */
interface StubModel {
  readonly provider: string;
  readonly id: string;
}

/**
 * The models the fixture session may switch to: its starting model plus the two an
 * agent file below names. `getAvailable()` returns exactly this, so a reference
 * outside it really does fail to resolve.
 */
const STARTING_MODEL: StubModel = { provider: "anthropic", id: "claude-opus-4" };
const AVAILABLE_MODELS: readonly StubModel[] = [
  STARTING_MODEL,
  { provider: "anthropic", id: "claude-sonnet-4" },
  { provider: "acme", id: "zulu-1" },
];

/** The level the fixture session starts on. Deliberately not `high`. */
const STARTING_THINKING: ThinkingLevel = "low";

/**
 * The session state the two stubs share.
 *
 * It is mutable on purpose: after a real `setModel` pi really is on the new model,
 * so a snapshot taken on a later press would record the agent's model. A stub with
 * a fixed model could not expose that bug.
 */
interface StubSession {
  model: StubModel | undefined;
  thinkingLevel: ThinkingLevel;
}

function createStubSession(
  options: { model?: StubModel | null; thinkingLevel?: ThinkingLevel } = {},
): StubSession {
  return {
    // `null` is a session that reached the handler before a model was resolved;
    // omitted means the ordinary starting model.
    model: options.model === undefined ? STARTING_MODEL : (options.model ?? undefined),
    thinkingLevel: options.thinkingLevel ?? STARTING_THINKING,
  };
}

interface StubApiOptions {
  /** Shared with the context, so a `setModel` is visible to the next press. */
  readonly session?: StubSession;
  /** What `setModel` answers: pi refuses a switch without throwing. Default `true`. */
  readonly acceptModel?: boolean;
  /** `setModel` throws for a model without usable credentials; simulate that. */
  readonly setModelThrows?: boolean;
}

interface StubApi {
  readonly api: ExtensionAPI;
  readonly handlers: Map<string, RecordedHandler>;
  readonly shortcuts: RecordedShortcut[];
  readonly entries: RecordedEntry[];
  /** The state `setModel` and `getThinkingLevel` read and write. */
  readonly session: StubSession;
  /**
   * Every intercepted setter call, in the order it happened, as `setter value`:
   * `setModel anthropic/claude-sonnet-4`, `setThinkingLevel high`.
   *
   * One interleaved log rather than one array per setter: the model is set before
   * the level (pi clamps the level against the model), and two arrays can only show
   * that each setter ran, never in which order. Refused and thrown `setModel` calls
   * are logged too — the attempt is the evidence.
   */
  readonly calls: string[];
}

/**
 * The members this extension uses from the API, recording every call in plain
 * arrays.
 *
 * The cast is unavoidable and belongs here alone: `ExtensionAPI` declares dozens of
 * members (tool registration, rendering, commands) that a stub would have to spell
 * out only to throw. Nothing outside this factory casts anything.
 */
function createStubApi(options: StubApiOptions = {}): StubApi {
  const handlers = new Map<string, RecordedHandler>();
  const shortcuts: RecordedShortcut[] = [];
  const entries: RecordedEntry[] = [];
  const calls: string[] = [];
  const session = options.session ?? createStubSession();

  const api = {
    on(event: string, handler: RecordedHandler): () => void {
      handlers.set(event, handler);
      return () => {
        handlers.delete(event);
      };
    },
    registerShortcut(
      key: string,
      options: {
        description?: string;
        handler: (ctx: ExtensionContext) => Promise<void> | void;
      },
    ): void {
      shortcuts.push({ key, description: options.description, handler: options.handler });
    },
    appendEntry(customType: string, data: { name: string }): void {
      entries.push({ customType, data });
    },
    async setModel(model: StubModel): Promise<boolean> {
      calls.push(`setModel ${model.provider}/${model.id}`);
      if (options.setModelThrows === true) {
        throw new Error("No API key for this model.");
      }
      if (options.acceptModel === false) {
        return false;
      }
      session.model = model;
      return true;
    },
    setThinkingLevel(level: ThinkingLevel): void {
      calls.push(`setThinkingLevel ${level}`);
      session.thinkingLevel = level;
    },
    getThinkingLevel(): ThinkingLevel {
      return session.thinkingLevel;
    },
  };

  return {
    api: api as unknown as ExtensionAPI,
    handlers,
    shortcuts,
    entries,
    session,
    calls,
  };
}

interface RecordedStatus {
  readonly key: string;
  readonly text: string | undefined;
}

interface RecordedNotification {
  readonly message: string;
  readonly type: string | undefined;
}

interface StubContextOptions {
  readonly cwd: string;
  readonly entries?: readonly SessionEntry[];
  /** Shared with the API stub, so a press sees the model the last press set. */
  readonly session?: StubSession;
  /** `false` is a streaming response: the state the idle guard rejects. */
  readonly idle?: boolean;
}

interface StubContext {
  readonly context: ExtensionContext;
  readonly statuses: RecordedStatus[];
  readonly notifications: RecordedNotification[];
}

/**
 * A session context carrying only what the extension reads: the working directory,
 * the two UI calls, the session history, the current model and the idle flag. Same
 * reason for the cast as above — the real context also owns the abort signal and a
 * dozen more members.
 */
function createStubContext(options: StubContextOptions): StubContext {
  const statuses: RecordedStatus[] = [];
  const notifications: RecordedNotification[] = [];
  const entries = options.entries ?? [];
  const session = options.session ?? createStubSession();
  const idle = options.idle ?? true;

  const context = {
    cwd: options.cwd,
    ui: {
      setStatus(key: string, text: string | undefined): void {
        statuses.push({ key, text });
      },
      notify(message: string, type?: "info" | "warning" | "error"): void {
        notifications.push({ message, type });
      },
    },
    sessionManager: {
      getEntries: () => [...entries],
    },
    // A getter, not a fixed value: the extension reads `ctx.model` to take the
    // snapshot, and pi really has moved on after a `setModel`.
    get model(): StubModel | undefined {
      return session.model;
    },
    modelRegistry: {
      getAvailable: () => [...AVAILABLE_MODELS],
      find: (provider: string, modelId: string) =>
        AVAILABLE_MODELS.find((model) => model.provider === provider && model.id === modelId),
    },
    isIdle: () => idle,
  };

  return { context: context as unknown as ExtensionContext, statuses, notifications };
}

interface StubPairOptions {
  readonly entries?: readonly SessionEntry[];
  /** `null` is a session that reached the handler before a model was resolved. */
  readonly model?: StubModel | null;
  readonly thinkingLevel?: ThinkingLevel;
  readonly idle?: boolean;
  readonly acceptModel?: boolean;
  readonly setModelThrows?: boolean;
}

/**
 * One API stub and one context stub over one shared session state, which is what a
 * multi-press case needs: the second press has to see what the first one set.
 */
function createStubPair(
  options: StubPairOptions = {},
): { readonly stub: StubApi; readonly session: StubContext } {
  const state = createStubSession({ model: options.model, thinkingLevel: options.thinkingLevel });
  const stub = createStubApi({
    session: state,
    acceptModel: options.acceptModel,
    setModelThrows: options.setModelThrows,
  });
  const session = createStubContext({
    cwd: fixture.cwd,
    entries: options.entries,
    session: state,
    idle: options.idle,
  });
  return { stub, session };
}

/** A complete normalized options object, so `strict` checks all twelve fields. */
function createPromptOptions(): NormalizedBuildSystemPromptOptions {
  return {
    customPrompt: PI_ROLE_PROMPT,
    forceSystemPrompt: "",
    selectedTools: ["read", "bash"],
    hiddenTools: [],
    toolSnippets: { read: "Read a file" },
    toolGuidelines: {},
    promptGuidelines: [],
    appendSystemPrompt: "",
    sections: { project_context: "<project_context># Project rules</project_context>" },
    cwd: "/work/project",
    contextFiles: [{ path: "/work/project/AGENTS.md", content: "# AGENTS.md" }],
    skills: [],
  };
}

/** The entry a previous session left behind: a label, and nothing else of interest. */
function createStateEntry(name: string): SessionEntry {
  return {
    type: "custom",
    customType: STATE_CUSTOM_TYPE,
    data: { name },
    id: "state-entry-from-a-previous-session",
    parentId: null,
    timestamp: "2026-11-12T10:00:00.000Z",
  };
}

/**
 * A missing handler is a wiring failure, not an assertion detail, so it fails the
 * case with a sentence that names the event that was never registered.
 */
function requireHandler(stub: StubApi, event: string): RecordedHandler {
  const handler = stub.handlers.get(event);
  if (handler === undefined) {
    throw new Error(`The extension registered no "${event}" handler.`);
  }
  return handler;
}

/**
 * Returns the handler's promise: a resume applies the restored selection before it
 * resolves, so a case that asserts what the resume changed has to await it.
 */
function startSession(stub: StubApi, context: StubContext): Promise<unknown> {
  return Promise.resolve(
    requireHandler(stub, "session_start")(
      { type: "session_start", reason: "startup" },
      context.context,
    ),
  );
}

/**
 * Presses the shortcut registered under `key`.
 *
 * The key is a parameter, not "whichever shortcut came first": with two keys
 * registered, the positional read would silently depend on registration order and a
 * case could pass while pressing a key it never named. A missing registration is a
 * wiring failure here, exactly as in `requireHandler`.
 */
function pressShortcut(stub: StubApi, context: StubContext, key: string): Promise<void> {
  const shortcut = stub.shortcuts.find((registered) => registered.key === key);
  if (shortcut === undefined) {
    throw new Error(`The extension registered no "${key}" shortcut.`);
  }
  // Returns the handler's promise: the press applies the agent before it resolves,
  // so a case that asserts what the press changed has to await it.
  return Promise.resolve(shortcut.handler(context.context));
}

/** Returns whatever the handler returned — `undefined` is part of the contract. */
function startAgentRun(
  stub: StubApi,
  context: StubContext,
  options: NormalizedBuildSystemPromptOptions,
): unknown {
  return requireHandler(stub, "before_agent_start")(
    {
      type: "before_agent_start",
      messageType: "user",
      prompt: "Please review this.",
      systemPrompt: PI_ROLE_PROMPT,
      systemPromptOptions: options,
    },
    context.context,
  );
}

it("shortcut is registered", () => {
  // GIVEN the extension wired against a stub API,
  const stub = createStubApi();
  agentSwitch(stub.api);

  // THEN two shortcuts exist, on the literal keys pi matches verbatim, in this order,
  expect(stub.shortcuts.map((shortcut) => shortcut.key)).toEqual(["shift+tab", "f2"]);

  // AND both carry one and the same description, because it is one action:
  const [primary, secondary] = stub.shortcuts;
  expect(primary.description).toBeTruthy();
  expect(secondary.description).toBe(primary.description);
});

it("both keys share one handler", () => {
  // GIVEN the extension wired against a stub API,
  const stub = createStubApi();
  agentSwitch(stub.api);

  // WHEN both registrations are read,
  const [primary, secondary] = stub.shortcuts;

  // THEN they reference the same function — not two wrappers that happen to do the
  // same thing. Reference identity is the point: a per-registration arrow would
  // compile and leave a later fix in one key unable to reach the other.
  expect(primary.handler).toBe(secondary.handler);
});

it("press before session_start is a no-op", async () => {
  // GIVEN the extension wired against a stub API whose session has not started, so
  // no cycle has been built yet,
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({ cwd: fixture.cwd });

  // WHEN the shortcut is pressed,
  // THEN it does not throw — and does not reject, now that the handler is async: a
  // keyboard handler that crashes pi mid-keypress is worse than one that waits for
  // the session to arrive,
  await expect(pressShortcut(stub, session, "shift+tab")).resolves.toBeUndefined();

  // AND it leaves no trace — no entry recording a selection nobody made, and no
  // footer text naming a stop that does not exist:
  expect(stub.entries).toEqual([]);
  expect(session.statuses).toEqual([]);
});

it("second session_start does not duplicate the cycle", async () => {
  // GIVEN two project agents and a session that has started, so the cycle is
  // `Main, alpha, zulu`,
  fixture.writeAgent("alpha", REVIEWER_PROMPT);
  fixture.writeAgent("zulu", REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  // No stored entries on purpose: without them the cycle starts on `Main`, so the
  // three presses below prove the whole walk instead of continuing from a label a
  // previous session restored.
  const session = createStubContext({ cwd: fixture.cwd });
  await startSession(stub, session);

  // WHEN a third agent appears and the session starts a second time — a resume
  // fires `session_start` again, and the fixture changed in between,
  fixture.writeAgent("mike", REVIEWER_PROMPT);
  await startSession(stub, session);

  // AND the shortcut is pressed three times,
  await pressShortcut(stub, session, "shift+tab");
  await pressShortcut(stub, session, "shift+tab");
  await pressShortcut(stub, session, "shift+tab");

  // THEN the presses walk the rebuilt cycle exactly once: `alpha`, `mike`, `zulu`.
  // A cycle that had been appended to instead of rebuilt would read
  // `Main, alpha, zulu, Main, alpha, mike, zulu`, so the walk would already diverge
  // on the second press (`zulu`, then `Main`) and never reach `mike` in the middle.
  // Read from the recorded entries, not from `session.statuses`: the statuses also
  // hold the two footer writes the two `session_start` calls made.
  expect(stub.entries.map((entry) => entry.data.name)).toEqual(["alpha", "mike", "zulu"]);
});

it("skipped file surfaces a warning", async () => {
  // GIVEN an agent file whose frontmatter claims the label the reset position
  // already owns, so `readAgentFile` holds it back instead of loading it,
  const skippedPath = fixture.writeAgent(MAIN_LABEL.toLowerCase(), REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  // No stored entries on purpose: `restoreSelection` adds a warning of its own when
  // a recorded label is gone, and this case must see the skip warning alone.
  const session = createStubContext({ cwd: fixture.cwd });

  // WHEN the session starts and discovery runs,
  await startSession(stub, session);

  // THEN exactly one warning reaches the operator, naming the file and the reason,
  // because an agent silently missing from the cycle looks like a broken extension:
  expect(session.notifications).toEqual([
    expect.objectContaining({ type: "warning", message: expect.stringContaining(skippedPath) }),
  ]);
  expect(session.notifications).toEqual([
    expect.objectContaining({ type: "warning", message: expect.stringContaining("reserved") }),
  ]);
});

it("before_agent_start applies the current agent", async () => {
  // GIVEN one project agent and a session that has started on it,
  fixture.writeAgent("reviewer", REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({ cwd: fixture.cwd });
  await startSession(stub, session);
  await pressShortcut(stub, session, "shift+tab");

  // WHEN the next message is about to be composed,
  const options = createPromptOptions();
  const result = startAgentRun(stub, session, options);

  // THEN the agent's body is the role prompt, every other option survived — that is
  // what keeps `AGENTS.md` in the request — and the handler returned nothing, so pi
  // composes the rest of its prompt itself:
  expect(options).toEqual({ ...createPromptOptions(), customPrompt: REVIEWER_PROMPT });
  expect(result).toBeUndefined();
});

it("footer shows the current name", async () => {
  // GIVEN one project agent and a started session,
  fixture.writeAgent("reviewer", REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({ cwd: fixture.cwd });

  // WHEN the session starts,
  await startSession(stub, session);

  // THEN the footer segment already names the reset position, under the key the
  // built-in footer renders,
  expect(session.statuses).toEqual([{ key: "agent", text: MAIN_LABEL }]);

  // AND one press replaces the text with the agent's name, same key:
  await pressShortcut(stub, session, "shift+tab");
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: "reviewer" });
});

it("selection is persisted", async () => {
  // GIVEN one project agent and a started session,
  fixture.writeAgent("reviewer", REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({ cwd: fixture.cwd });
  await startSession(stub, session);

  // WHEN the shortcut selects it,
  await pressShortcut(stub, session, "shift+tab");

  // THEN the choice is written as this extension's `custom` entry, so a resume can
  // find it again:
  expect(stub.entries).toEqual([{ customType: STATE_CUSTOM_TYPE, data: { name: "reviewer" } }]);
});

it("restore last selection", async () => {
  // GIVEN a session whose history carries a previously selected agent, and an agent
  // file that still exists,
  fixture.writeAgent("reviewer", REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({
    cwd: fixture.cwd,
    entries: [createStateEntry("reviewer")],
  });

  // WHEN the session starts,
  await startSession(stub, session);

  // THEN the footer returns to that agent rather than to `Main`, without a warning:
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: "reviewer" });
  expect(session.notifications).toEqual([]);
});

it("missing agent falls back to Main", async () => {
  // GIVEN a session that selected an agent whose file is gone,
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({
    cwd: fixture.cwd,
    entries: [createStateEntry("deleted-agent")],
  });

  // WHEN the session starts,
  // THEN the resume survives — and does not reject, now that the handler is async:
  // the non-promise form of this assertion would go vacuous the moment it returns one
  await expect(startSession(stub, session)).resolves.toBeUndefined();

  // AND the footer names the reset position while a warning says what disappeared:
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: MAIN_LABEL });
  expect(session.notifications).toEqual([
    expect.objectContaining({ type: "warning", message: expect.stringContaining("deleted-agent") }),
  ]);
});

it("cycle applies the agent's model and level", async () => {
  // GIVEN one project agent naming a model and a level, and a started session,
  fixture.writeAgent("architect", REVIEWER_PROMPT, {
    model: "anthropic/claude-sonnet-4",
    thinking: "high",
  });
  const { stub, session } = createStubPair();
  agentSwitch(stub.api);
  await startSession(stub, session);

  // WHEN the shortcut selects it,
  await pressShortcut(stub, session, "shift+tab");

  // THEN the handler wires the decision half: the model goes first, then the level
  // pi clamps against that model — and the footer already names the new agent:
  expect(stub.calls).toEqual(["setModel anthropic/claude-sonnet-4", "setThinkingLevel high"]);
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: "architect" });
});

it("f2 press cycles the agent", async () => {
  // GIVEN one project agent naming a model and a level, and a started session,
  fixture.writeAgent("architect", REVIEWER_PROMPT, {
    model: "anthropic/claude-sonnet-4",
    thinking: "high",
  });
  const { stub, session } = createStubPair();
  agentSwitch(stub.api);
  await startSession(stub, session);

  // WHEN the second key selects it,
  await pressShortcut(stub, session, "f2");

  // THEN it does exactly what a `shift+tab` press does — one recorded selection, the
  // footer label, the model and the level. The facts repeat the `shift+tab` cases on
  // purpose: the new information is which key id reaches that effect.
  expect(stub.entries).toEqual([{ customType: STATE_CUSTOM_TYPE, data: { name: "architect" } }]);
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: "architect" });
  expect(stub.calls).toEqual(["setModel anthropic/claude-sonnet-4", "setThinkingLevel high"]);
});

it("Main restores the snapshot", async () => {
  // GIVEN a session that starts on its own model and level, one agent that names a
  // different model and level, and a started session,
  fixture.writeAgent("architect", REVIEWER_PROMPT, {
    model: "anthropic/claude-sonnet-4",
    thinking: "high",
  });
  const { stub, session } = createStubPair();
  agentSwitch(stub.api);
  await startSession(stub, session);

  // WHEN the cycle leaves `Main` and comes back to it,
  await pressShortcut(stub, session, "shift+tab");
  await pressShortcut(stub, session, "shift+tab");

  // THEN `Main` puts the starting model and level back: they were captured before
  // the agent's values were applied, which is why the starting model is second and
  // not first:
  // The interleaved log is what proves the order inside the restore itself: model
  // before level, on the way out and on the way back.
  expect(stub.calls).toEqual([
    "setModel anthropic/claude-sonnet-4",
    "setThinkingLevel high",
    "setModel anthropic/claude-opus-4",
    "setThinkingLevel low",
  ]);
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: MAIN_LABEL });
  expect(session.notifications).toEqual([]);
});

it("agents do not re-snapshot", async () => {
  // GIVEN two agents that each name a model and a level, so the session's state
  // moves twice before it returns to `Main`,
  fixture.writeAgent("alpha", REVIEWER_PROMPT, {
    model: "anthropic/claude-sonnet-4",
    thinking: "high",
  });
  fixture.writeAgent("zulu", REVIEWER_PROMPT, { model: "acme/zulu-1", thinking: "max" });
  const { stub, session } = createStubPair();
  agentSwitch(stub.api);
  await startSession(stub, session);

  // WHEN the cycle walks `Main, alpha, zulu` and then back to `Main`,
  await pressShortcut(stub, session, "shift+tab");
  await pressShortcut(stub, session, "shift+tab");
  await pressShortcut(stub, session, "shift+tab");

  // THEN the third promise is the snapshot taken on the first press, not the state
  // `alpha` left behind: moving between two agents does not move the target
  // `Main` returns to. A fixture with a fixed model could not show this, which is
  // why the stubs share a mutable session state.
  expect(stub.calls).toEqual([
    "setModel anthropic/claude-sonnet-4",
    "setThinkingLevel high",
    "setModel acme/zulu-1",
    "setThinkingLevel max",
    "setModel anthropic/claude-opus-4",
    "setThinkingLevel low",
  ]);
});

it("press while streaming changes nothing", async () => {
  // GIVEN a started session whose response is still streaming,
  fixture.writeAgent("architect", REVIEWER_PROMPT, {
    model: "anthropic/claude-sonnet-4",
    thinking: "high",
  });
  const { stub, session } = createStubPair({ idle: false });
  agentSwitch(stub.api);
  await startSession(stub, session);

  // WHEN the shortcut is pressed mid-run,
  await pressShortcut(stub, session, "shift+tab");

  // THEN nothing changes: no entry for a selection nobody made, the footer keeps
  // the one text `session_start` wrote, no model and no level move, and one warning
  // says why — a swap mid-run would let a response and its tool continuation run on
  // two different models:
  expect(stub.entries).toEqual([]);
  expect(session.statuses).toEqual([{ key: "agent", text: MAIN_LABEL }]);
  expect(stub.calls).toEqual([]);
  expect(session.notifications).toEqual([
    {
      message: "A response is still streaming — the agent is switched once it is idle.",
      type: "warning",
    },
  ]);
});

it("Main restore that throws warns instead of crashing", async () => {
  // GIVEN an agent naming neither field, and a session whose starting model has
  // lost its credentials by the time the cycle comes back to `Main` — `pi.setModel`
  // throws for that instead of answering `false`,
  fixture.writeAgent("plain", REVIEWER_PROMPT);
  const { stub, session } = createStubPair({ setModelThrows: true });
  agentSwitch(stub.api);
  await startSession(stub, session);

  // WHEN the cycle leaves `Main` — no `setModel` on that press, so the throw below
  // belongs to the restore alone — and comes back to it,
  await pressShortcut(stub, session, "shift+tab");
  await expect(pressShortcut(stub, session, "shift+tab")).resolves.toBeUndefined();

  // THEN the throw becomes a warning naming the model instead of an exception out
  // of a keypress, and the level is restored anyway (the two fields fall back
  // independently, exactly as in `applySelection`):
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: MAIN_LABEL });
  expect(session.notifications).toHaveLength(1);
  expect(session.notifications[0]).toEqual({
    type: "warning",
    message: expect.stringContaining("anthropic/claude-opus-4"),
  });
  expect(stub.calls).toEqual([
    "setModel anthropic/claude-opus-4",
    "setThinkingLevel low",
  ]);
});

it("snapshot without a model still restores the level", async () => {
  // GIVEN a session that reached the first press before a model was resolved, and
  // an agent that names a level,
  fixture.writeAgent("architect", REVIEWER_PROMPT, { thinking: "high" });
  const { stub, session } = createStubPair({ model: null });
  agentSwitch(stub.api);
  await startSession(stub, session);

  // WHEN the cycle leaves `Main` and comes back to it,
  await pressShortcut(stub, session, "shift+tab");
  await pressShortcut(stub, session, "shift+tab");

  // THEN the restore skips the model silently — there is nothing to put back, and
  // absence is not a failure — and still restores the level:
  expect(stub.calls).toEqual(["setThinkingLevel high", "setThinkingLevel low"]);
  expect(session.notifications).toEqual([]);
});

it("resume applies the selection again", async () => {
  // GIVEN a session history that recorded an agent which names a model and a level,
  // and the agent file that history points at is still there,
  fixture.writeAgent("architect", REVIEWER_PROMPT, {
    model: "anthropic/claude-sonnet-4",
    thinking: "high",
  });
  const { stub, session } = createStubPair({ entries: [createStateEntry("architect")] });
  agentSwitch(stub.api);

  // WHEN the session starts again with that history,
  await startSession(stub, session);

  // THEN the restored selection is applied, model before level — a resumed label
  // that only reached the footer would leave the session on the wrong model, and a
  // level without its model would be clamped against the old one:
  expect(stub.calls).toEqual([
    "setModel anthropic/claude-sonnet-4",
    "setThinkingLevel high",
  ]);
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: "architect" });
  expect(session.notifications).toEqual([]);

  // AND a later press back to `Main` applies nothing, because a resumed session has
  // no snapshot — the in-memory limit, pinned here so it cannot regress into a
  // silent restore of the agent's model:
  await pressShortcut(stub, session, "shift+tab");
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: MAIN_LABEL });
  expect(stub.calls).toEqual([
    "setModel anthropic/claude-sonnet-4",
    "setThinkingLevel high",
  ]);
  expect(session.notifications).toEqual([]);
});
