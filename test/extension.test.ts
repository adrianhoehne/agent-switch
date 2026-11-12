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
  /** Writes one project agent file and returns its absolute path. */
  writeAgent(name: string, body: string): string;
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
    writeAgent(name, body) {
      const path = join(projectAgents, `${name}.md`);
      writeFileSync(path, `---\nname: ${name}\n---\n\n${body}\n`, "utf8");
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

interface StubApi {
  readonly api: ExtensionAPI;
  readonly handlers: Map<string, RecordedHandler>;
  readonly shortcuts: RecordedShortcut[];
  readonly entries: RecordedEntry[];
}

/**
 * The three members this extension uses, recording every call in plain arrays.
 *
 * The cast is unavoidable and belongs here alone: `ExtensionAPI` declares dozens of
 * members (model access, tool registration, rendering) that a stub would have to
 * spell out only to throw. Nothing outside this factory casts anything.
 */
function createStubApi(): StubApi {
  const handlers = new Map<string, RecordedHandler>();
  const shortcuts: RecordedShortcut[] = [];
  const entries: RecordedEntry[] = [];

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
  };

  return { api: api as unknown as ExtensionAPI, handlers, shortcuts, entries };
}

interface RecordedStatus {
  readonly key: string;
  readonly text: string | undefined;
}

interface RecordedNotification {
  readonly message: string;
  readonly type: string | undefined;
}

interface StubContext {
  readonly context: ExtensionContext;
  readonly statuses: RecordedStatus[];
  readonly notifications: RecordedNotification[];
}

/**
 * A session context carrying only what the extension reads: the working directory,
 * the two UI calls and the session history. Same reason for the cast as above — the
 * real context also owns the model, the abort signal and a dozen more members.
 */
function createStubContext(options: {
  readonly cwd: string;
  readonly entries?: readonly SessionEntry[];
}): StubContext {
  const statuses: RecordedStatus[] = [];
  const notifications: RecordedNotification[] = [];
  const entries = options.entries ?? [];

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
  };

  return { context: context as unknown as ExtensionContext, statuses, notifications };
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

function startSession(stub: StubApi, context: StubContext): void {
  requireHandler(stub, "session_start")({ type: "session_start", reason: "startup" }, context.context);
}

function pressShortcut(stub: StubApi, context: StubContext): void {
  const shortcut = stub.shortcuts[0];
  if (shortcut === undefined) {
    throw new Error("The extension registered no shortcut.");
  }
  shortcut.handler(context.context);
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

  // THEN exactly one shortcut exists, on the literal key pi matches verbatim,
  expect(stub.shortcuts).toHaveLength(1);
  expect(stub.shortcuts[0].key).toBe("shift+tab");
  expect(stub.shortcuts[0].description).toBeTruthy();
});

it("press before session_start is a no-op", () => {
  // GIVEN the extension wired against a stub API whose session has not started, so
  // no cycle has been built yet,
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({ cwd: fixture.cwd });

  // WHEN the shortcut is pressed,
  // THEN it does not throw: a keyboard handler that crashes pi mid-keypress is
  // worse than one that waits for the session to arrive,
  expect(() => pressShortcut(stub, session)).not.toThrow();

  // AND it leaves no trace — no entry recording a selection nobody made, and no
  // footer text naming a stop that does not exist:
  expect(stub.entries).toEqual([]);
  expect(session.statuses).toEqual([]);
});

it("second session_start does not duplicate the cycle", () => {
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
  startSession(stub, session);

  // WHEN a third agent appears and the session starts a second time — a resume
  // fires `session_start` again, and the fixture changed in between,
  fixture.writeAgent("mike", REVIEWER_PROMPT);
  startSession(stub, session);

  // AND the shortcut is pressed three times,
  pressShortcut(stub, session);
  pressShortcut(stub, session);
  pressShortcut(stub, session);

  // THEN the presses walk the rebuilt cycle exactly once: `alpha`, `mike`, `zulu`.
  // A cycle that had been appended to instead of rebuilt would read
  // `Main, alpha, zulu, Main, alpha, mike, zulu`, so the walk would already diverge
  // on the second press (`zulu`, then `Main`) and never reach `mike` in the middle.
  // Read from the recorded entries, not from `session.statuses`: the statuses also
  // hold the two footer writes the two `session_start` calls made.
  expect(stub.entries.map((entry) => entry.data.name)).toEqual(["alpha", "mike", "zulu"]);
});

it("skipped file surfaces a warning", () => {
  // GIVEN an agent file whose frontmatter claims the label the reset position
  // already owns, so `readAgentFile` holds it back instead of loading it,
  const skippedPath = fixture.writeAgent(MAIN_LABEL.toLowerCase(), REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  // No stored entries on purpose: `restoreSelection` adds a warning of its own when
  // a recorded label is gone, and this case must see the skip warning alone.
  const session = createStubContext({ cwd: fixture.cwd });

  // WHEN the session starts and discovery runs,
  startSession(stub, session);

  // THEN exactly one warning reaches the operator, naming the file and the reason,
  // because an agent silently missing from the cycle looks like a broken extension:
  expect(session.notifications).toEqual([
    expect.objectContaining({ type: "warning", message: expect.stringContaining(skippedPath) }),
  ]);
  expect(session.notifications).toEqual([
    expect.objectContaining({ type: "warning", message: expect.stringContaining("reserved") }),
  ]);
});

it("before_agent_start applies the current agent", () => {
  // GIVEN one project agent and a session that has started on it,
  fixture.writeAgent("reviewer", REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({ cwd: fixture.cwd });
  startSession(stub, session);
  pressShortcut(stub, session);

  // WHEN the next message is about to be composed,
  const options = createPromptOptions();
  const result = startAgentRun(stub, session, options);

  // THEN the agent's body is the role prompt, every other option survived — that is
  // what keeps `AGENTS.md` in the request — and the handler returned nothing, so pi
  // composes the rest of its prompt itself:
  expect(options).toEqual({ ...createPromptOptions(), customPrompt: REVIEWER_PROMPT });
  expect(result).toBeUndefined();
});

it("footer shows the current name", () => {
  // GIVEN one project agent and a started session,
  fixture.writeAgent("reviewer", REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({ cwd: fixture.cwd });

  // WHEN the session starts,
  startSession(stub, session);

  // THEN the footer segment already names the reset position, under the key the
  // built-in footer renders,
  expect(session.statuses).toEqual([{ key: "agent", text: MAIN_LABEL }]);

  // AND one press replaces the text with the agent's name, same key:
  pressShortcut(stub, session);
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: "reviewer" });
});

it("selection is persisted", () => {
  // GIVEN one project agent and a started session,
  fixture.writeAgent("reviewer", REVIEWER_PROMPT);
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({ cwd: fixture.cwd });
  startSession(stub, session);

  // WHEN the shortcut selects it,
  pressShortcut(stub, session);

  // THEN the choice is written as this extension's `custom` entry, so a resume can
  // find it again:
  expect(stub.entries).toEqual([{ customType: STATE_CUSTOM_TYPE, data: { name: "reviewer" } }]);
});

it("restore last selection", () => {
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
  startSession(stub, session);

  // THEN the footer returns to that agent rather than to `Main`, without a warning:
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: "reviewer" });
  expect(session.notifications).toEqual([]);
});

it("missing agent falls back to Main", () => {
  // GIVEN a session that selected an agent whose file is gone,
  const stub = createStubApi();
  agentSwitch(stub.api);
  const session = createStubContext({
    cwd: fixture.cwd,
    entries: [createStateEntry("deleted-agent")],
  });

  // WHEN the session starts,
  // THEN the resume survives,
  expect(() => startSession(stub, session)).not.toThrow();

  // AND the footer names the reset position while a warning says what disappeared:
  expect(session.statuses.at(-1)).toEqual({ key: "agent", text: MAIN_LABEL });
  expect(session.notifications).toEqual([
    expect.objectContaining({ type: "warning", message: expect.stringContaining("deleted-agent") }),
  ]);
});
