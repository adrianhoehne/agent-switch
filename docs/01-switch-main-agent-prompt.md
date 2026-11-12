---
description: Cycles the main agent's system prompt through the agent definition files on ctrl+shift+a, effective on the next message, keeping project context and conversation history intact.
status: active
---

# 01 — Cycle the main agent's system prompt mid-conversation

Implemented on 2026-11-12. All thirteen acceptance criteria are met; the live
session check is recorded in `## Log`.

## Goal

The main agent of a pi session changes the system prompt it answers with, without
restarting the session. `ctrl+shift+a` cycles through `Main` — pi's own prompt — and
the agent definitions found on the machine; the footer names the active one. From
the next message on, the request carries that agent's prompt body as its role
prompt. Project context (this file, the skill catalogue, the working directory)
stays in the request, and the conversation is never rewritten.

## Behaviour, as decided against the opencode reference

| Point | Decision |
|---|---|
| Trigger | `ctrl+shift+a` cycles forward, wrapping. No picker dialog. |
| Cycle list | `Main` first, then all loaded agents sorted case-insensitively by name, `enabled: false` skipped |
| Footer | `ctx.ui.setStatus("agent", …)` shows `Main` or the agent name. The working row stays pi's own (`⠋ Working…`). |
| Prompt swap | `prompt_mode: replace` sets `systemPromptOptions.customPrompt`; `append` sets `appendSystemPrompt`. Both leave `project_context`, `skills`, `cwd`, `selectedTools` and extension sections untouched. |
| Effect time | the next message, through `before_agent_start` |
| Session | pi records the changed prompt as a system delta; the extension additionally writes a `custom` entry for the footer label. No chat message is added. |
| History | never rewritten |

## Non-goals

- **Not** adopting `model`, `thinking` or `tools` from the agent file. The operator
  asked for the system prompt only; adopting the rest is a separate increment.
- **No** slash command and no picker dialog. One shortcut, one direction.
- **No** editing or creating agent files.
- **No** spawning subagents — this changes the prompt of the *main* agent.
- **No** custom footer. The built-in footer keeps its layout; only one status
  segment is added.
- **No** package tier. Agents that an installed pi package declares are **not**
  read in this increment: `source: "package"` and the `packageDirs` seam exist in
  the type, nothing produces them. No installed package on this machine declares
  an agent today, so the cycle loses nothing. Deferred by the operator on
  2026-11-12; see `## Open questions`.

## Files and interfaces

| File | Content |
|---|---|
| `package.json` | `"pi": { "extensions": ["./src/extension.ts"] }`, scripts `test` and `typecheck`, dev dependencies |
| `tsconfig.json` | `strict: true`, Node ESM module settings, `noEmit: true` |
| `vitest.config.ts` | test include, no globals |
| `src/extension.ts` | factory: shortcut, `before_agent_start`, `session_start`, footer status |
| `src/agents.ts` | discovery and parsing over the three directories read in this increment |
| `src/prompt.ts` | `applyAgentToPromptOptions(options, agent)` — pure, mutates only the two named fields |
| `src/state.ts` | cycle position, the `agent-switch-state` session entry, label formatting |
| `test/agents.test.ts` | discovery order, filtering, parsing |
| `test/prompt.test.ts` | the two prompt modes |
| `test/state.test.ts` | cycle order, wrapping, label lookup |
| `test/extension.test.ts` | registration, event behaviour against a stub API |

```ts
export interface AgentDefinition {
  name: string;                       // frontmatter `name`, else the file name
  description: string;                // frontmatter `description`, else the name
  prompt: string;                     // file body, trimmed
  promptMode: "replace" | "append";   // frontmatter `prompt_mode`, default "replace"
  enabled: boolean;                   // frontmatter `enabled`, default true
  sourcePath: string;                 // absolute path of the .md file
  source: "project" | "workspace" | "global" | "package";  // "package": declared, not produced here
}

export function loadAgents(
  cwd: string,
  agentDir: string,
  options?: { packageDirs?: string[]; onSkip?: (path: string, reason: string) => void },
): AgentDefinition[];

/** Mutates only `customPrompt` (replace) or `appendSystemPrompt` (append). `null` is `Main`. */
export function applyAgentToPromptOptions(
  options: NormalizedBuildSystemPromptOptions,
  agent: AgentDefinition | null,
): void;
```

Rules fixed here:

- **Precedence** (later wins, as `pi-subagents` does it): global
  `~/.pi/agent/agents/*.md` → workspace `<cwd>/.agents/agents/*.md` → project
  `<cwd>/.pi/agents/*.md`. Discovery is **name-keyed**: a later tier replaces an
  earlier entry with the same name, it does not add a second one. Upstream loads the
  package tier **first**, i.e. as the lowest priority; this increment names it in
  the type only and reads no package directory (`## Non-goals`).
- **Sort ties keep discovery order**: two names that differ only in case are two
  entries, and the case-insensitive sort must not reorder them.
- **Files that are skipped**, each with an `onSkip` reason that the extension turns
  into a `ctx.ui.notify` warning: unparseable frontmatter (`parseFrontmatter`
  throws), an empty prompt body (pi ignores a falsy `customPrompt`, so the footer
  would lie), a name that is `Main` in any casing (the label is the identity, and
  `Main` is the reset position), a symlink, a non-regular file, and a file above
  1 MiB. The
  upstream ceiling is 1 MiB for *package* resources only; applying it to local files
  as well is a deliberate stricter choice here, because the body goes straight into
  the system prompt.
- **Frontmatter is `Record<string, unknown>`**, so a narrowing helper is required
  under `strict`; a wrong type is treated like a missing field and the default
  applies.
- **An unreadable directory** counts as empty — no throw, no crash.
- **A broken file** is skipped and named in a warning; it never breaks the cycle.
- **`prompt_mode: append`** appends `\n\n` plus the body to any existing
  `appendSystemPrompt`, it does not overwrite it.
- **Only the two named option fields** are written. `contextFiles`, `cwd`,
  `skills`, `selectedTools` and custom sections are read, never modified — that is
  what keeps `AGENTS.md` in the prompt.

## Acceptance criteria

| # | Criterion | Command / evidence |
|---|---|---|
| 1 | Type check passes with `strict` on | `npm run typecheck` exits 0 |
| 2 | The suite passes | `npm test` exits 0, output names the cases from `## Testing` |
| 3 | On `Main` the handler changes nothing | case `main leaves the options untouched` asserts a deep-equal snapshot |
| 4 | `replace` sets `customPrompt` to the body and leaves `contextFiles`, `cwd`, `skills`, `selectedTools` identical | case `replace sets the role prompt only` |
| 5 | `append` extends `appendSystemPrompt` instead of replacing it | case `append extends the addendum` |
| 6 | Cycle order is `Main`, then agents sorted case-insensitively by name, wrapping | cases `cycle starts at Main`, `cycle sorts agents by name`, `cycle wraps to Main` |
| 7 | `enabled: false` agents are not in the cycle | case `disabled agent is skipped` |
| 8 | Discovery is name-keyed: a project agent replaces a global one of the same name, one entry remains | cases `project agent overrides global`, `duplicate name: later tier wins` |
| 9 | The shortcut is registered on `ctrl+shift+a` | case `shortcut is registered` |
| 10 | After a cycle the footer status carries `Main` or the agent name | case `footer shows the current name` |
| 11 | The choice is written as a `custom` entry with `customType: "agent-switch-state"` and restored on `session_start` | cases `selection is persisted`, `restore last selection` |
| 12 | A selection whose agent file disappeared falls back to `Main` with a warning | case `missing agent falls back to Main` |
| 13 | Live session: cycle to `ranger-1`, send a message — the footer reads `ranger-1`, the project rules still apply, no new chat message appears, a tool call still works | operator confirms in `pi --extension ./src/extension.ts`; evidence: footer text, an `AGENTS.md`-derived answer, unchanged transcript |

Criterion 13 is the only one a test cannot decide. Pi's `<tools>` *text* section
disappears under `replace` (the tool definitions are sent separately), so "a tool
call still works" is part of the manual check.

## Testing

| File | Case | What it proves |
|---|---|---|
| `test/prompt.test.ts` | `main leaves the options untouched` | no selection means no intervention |
| | `replace sets the role prompt only` | `customPrompt` is the body, harness fields survive |
| | `append extends the addendum` | an existing `appendSystemPrompt` is not lost |
| | `body is trimmed` | trailing newlines do not reach the request |
| | `append does not accumulate across runs` | one apply adds exactly one `\n\n` |
| `test/agents.test.ts` | `parses name, description and prompt mode` | frontmatter becomes the interface |
| | `name falls back to the file name` | a file without `name:` is still cycleable |
| | `project agent overrides global` | precedence is real |
| | `duplicate name: later tier wins` | the later tier replaces, it does not append |
| | `workspace agent is read` | `.agents/agents` is not forgotten |
| | `disabled agent is skipped` | `enabled: false` means not offered |
| | `broken file is skipped` | one bad file does not stop the cycle |
| | `empty body is skipped` | an empty `customPrompt` would silently keep pi's prompt |
| | `agent named Main is skipped` | the label `Main` stays the reset position |
| | `oversized file is skipped` | the 1 MiB ceiling holds |
| | `non-regular file is skipped` | a directory or fifo named `*.md` is not read |
| | `symlinked file is skipped` | a link cannot point the prompt at content outside |
| | `unreadable directory counts as empty` | a permission error is not a crash |
| `test/state.test.ts` | `cycle starts at Main` / `cycle wraps to Main` | order and wrap-around |
| | `cycle sorts agents by name` | the sort half of criterion 6 |
| | `cycle uses agent names` | the label is the agent name, not the path |
| | `unknown label resolves to Main` | a stale label cannot freeze the cycle |
| `test/extension.test.ts` | `shortcut is registered` | exactly `ctrl+shift+a` |
| | `before_agent_start applies the current agent` | the registered handler really reaches `applyAgentToPromptOptions` |
| | `footer shows the current name` | `setStatus` receives `Main` or the name |
| | `selection is persisted` | the entry carries `customType: "agent-switch-state"` |
| | `restore last selection` | resume brings the label back |
| | `missing agent falls back to Main` | a deleted file does not throw on resume |

## Risks and alternatives

- **`replace` removes pi's role text**, including the `<tools>` and `<rules>`
  sections. Tool definitions are sent separately, so the agent can still act — but
  it no longer reads pi's tool guidance. This is the requested behaviour and the
  same trade-off opencode makes.
- **Project context survives by construction:** `project_context`, `skills` and
  `cwd` are built outside the `customPrompt` branch. A test locks this down rather
  than the comment in the code.
- **The prompt change is recorded as a system delta in the session.** That is how
  a resumed session keeps the right prompt without the extension reconstructing
  anything. It is not rendered as a chat message; the live check confirms that.
- **Order of extension handlers.** Another extension may also write
  `appendSystemPrompt`; we append to what is there instead of overwriting, so
  handler order does not silently drop someone's text.
- **Rejected alternative: returning `systemPrompt` from `before_agent_start`.**
  That forces the whole prompt and loses `project_context`, `skills` and every
  extension section. It was the first version of this spec; the operator chose the
  opencode-like behaviour instead.
- **Rejected alternative: a picker dialog.** opencode offers both; the operator
  asked for cycling only, so the increment stays small.
- **Rejected alternative: deep-importing `@tintinweb/pi-subagents/dist/custom-agents.js`.**
  That package has no `exports` field; the import would break on any internal
  rename. `parseFrontmatter` comes from `@earendil-works/pi-coding-agent`.
- **Shortcut conflicts.** pi refuses extension shortcuts that collide with
  reserved built-ins and warns on the others. `ctrl+shift+a` is in neither list
  today; that is re-checked at load time, because `pi-subagents` may claim it later.
- **Agent bodies are repo-controlled text that becomes the system prompt.**
  `.pi/agents/*.md` is not behind pi's project-trust gate (that gate lists
  `settings.json`, `mcp.json`, `extensions`, `skills`, `prompts`, `themes` and
  `SYSTEM.md`, not `agents`). A cloned repository can therefore ship an agent whose
  body redefines the instructions. That is the feature, and the control is the
  operator pressing the key while the footer names the active agent — no trust gate
  is added in this increment, deliberately.

## Touch boundary

- Everything inside `/home/adrian/agent-switch`.
- **Not** `~/.pi/agent/**` and not `~/.agents/**` — agent files are read, never
  written; settings and keybindings are not edited.
- **Not** generated folders: `node_modules/`, `coverage/`, `dist/`.
- `package-lock.json` is generated by `npm install` — committed, never edited by
  hand.

## Additional dependencies

| Package | Version | Licence | Why |
|---|---|---|---|
| `@earendil-works/pi-coding-agent` | 1.3.0 | MIT | extension types, `parseFrontmatter`, `getAgentDir` |
| `vitest` | 5.1.0 | MIT | test runner |
| `typescript` | 6.0.3 | Apache-2.0 | type check, no emit |
| `@types/node` | 22.20.5 | MIT | `fs` and `path` types |

`pi-tui` is not needed as a direct dependency: the shortcut is registered with the
literal key id `"ctrl+shift+a"`, not with `Key.ctrlShift("a")` — `Key` lives in
`pi-tui` and is not re-exported by `@earendil-works/pi-coding-agent`. Its types are
still resolved transitively, because `KeyId` in pi's type declarations is imported
from `@earendil-works/pi-tui`; that works as long as `pi-coding-agent` is
installed, and a direct `pi-tui` dependency would only be needed if the extension
imported from it. `pi-ai` is not needed: the extension does not touch models.
Exact versions live in `package-lock.json`; `npm install` is the only setup step.

## Open questions

None. Both follow-ups are recorded under `## Known gaps`; neither is a decision
waiting for someone.

## Known gaps

Recorded during implementation and review, 2026-11-12. None blocks the
increment; each is a follow-up with its reason.

| Gap | Why it is open |
|---|---|
| A shortcut press with an empty cycle appends `{ name: "Main" }`, a selection event that did not happen | review note; the guard `if (cycle.length === 0) return` is not in the code |
| `restoreSelection` warns "no longer available" for an agent that exists but is `enabled: false` | the file is available, it is simply not offered; wording |
| No case proves that a second `session_start` does not duplicate the cycle | correct by construction (`cycle = loadCycle(ctx)`), unproven by a test |
| `lastSelectedLabel` reads `getEntries()` (whole session) rather than `getBranch()` | a branched session can restore a label from an abandoned branch (spec review round 1) |
| `lstatSync` and the later `readFileSync` are not atomic | a file swapped to a symlink between the two calls would still be read; closing it needs `openSync` + `fstat` |
| The tie case discriminates only under full-ICU Node | a `small-icu` build returns `0` for both comparators and the lock disappears silently |
| **Package tier not implemented** | the operator decided on 2026-11-12 to defer it: it needs pi's package manifest reader, the project-trust decision and a size ceiling, and no installed package declares an agent today. `source: "package"` and the `packageDirs` seam are in place for it |
| **`model`, `thinking` and `tools` of the agent file are not adopted** | the operator asked for the system prompt only; opencode ties the model to the agent and switches it along — that is "part 2", a separate spec |

## Dev plan

Prerequisite per stage: `npm install` writes `package-lock.json` (committed, never
edited by hand — `## Touch boundary`). No stage depends on a later one.

1. **Package skeleton and agent discovery** — create `package.json` (`"type": "module"`,
   `"private": true`, `"pi": { "extensions": ["./src/extension.ts"] }`, scripts
   `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, devDependencies
   `typescript@6.0.3`, `vitest@5.1.0`, `@types/node@22.20.5`,
   `@earendil-works/pi-coding-agent@1.3.0`; that package also in `peerDependencies`
   as `"*"` and **not** in `dependencies`, per `docs/packages.md` → "Declare
   dependencies"), `tsconfig.json` (`strict: true`, `noEmit: true`,
   `module: "preserve"`, `moduleResolution: "bundler"`, `types: ["node"]`,
   `include: ["src", "test", "*.config.ts"]`, relative imports written
   extensionless), `vitest.config.ts` (`test.include: ["test/**/*.test.ts"]`,
   `globals: false`). Then `src/agents.ts`: `AgentDefinition` (exact shape from
   `## Files and interfaces`), precedence order global → workspace → project (later
   replaces an earlier entry of the same name, as `@tintinweb/pi-subagents`
   `src/custom-agents.ts:81-96` does), `readAgentFile(path, source)` using
   `parseFrontmatter` from `@earendil-works/pi-coding-agent`,
   `loadAgents(cwd: string, agentDir: string, options?: { packageDirs?: string[]; onSkip?: (path: string, reason: string) => void })`
   — the third argument is additive so the spec's two-argument call stays valid;
   without `packageDirs` no package tier is read, and the type keeps that variant
   without a producer (`## Non-goals`). Every skip from `## Files and interfaces`
   goes through `onSkip`: unparseable frontmatter, empty body, name `Main` in any
   casing, non-regular file, file above `1_048_576` bytes. `name` falls back to the
   file name, `description` to the name,
   `promptMode` to `"replace"`, `enabled` to `true` (`@tintinweb/pi-subagents`
   `src/custom-agents.ts:80-200`), `prompt: body.trim()`. `test/agents.test.ts`
   with a `mkdtemp` fixture per case.
   Proof: `npm run typecheck` exits 0; `npm test` exits 0 and lists
   `parses name, description and prompt mode`, `name falls back to the file name`,
   `project agent overrides global`, `duplicate name: later tier wins`,
   `workspace agent is read`, `disabled agent is skipped`, `broken file is skipped`,
   `empty body is skipped`, `agent named Main is skipped`,
   `oversized file is skipped`, `non-regular file is skipped`,
   `unreadable directory counts as empty`. (`npm test` fails on an empty suite, so
   this stage must not ship without its test file.)

2. **Prompt swap** — create `src/prompt.ts`:
   `applyAgentToPromptOptions(options: NormalizedBuildSystemPromptOptions, agent: AgentDefinition | null): void`,
   writing only `customPrompt` (replace) or
   `appendSystemPrompt = existing ? existing + "\n\n" + prompt : prompt` (append);
   `null` means `Main` and returns untouched. The `| null` widening is deliberate:
   it keeps the case `main leaves the options untouched` in `test/prompt.test.ts`,
   where `## Testing` places it, without a second entry point.
   `test/prompt.test.ts` builds a fixture options object holding all twelve
   normalized fields (`customPrompt`, `forceSystemPrompt`, `selectedTools`,
   `hiddenTools`, `toolSnippets`, `toolGuidelines`, `promptGuidelines`,
   `appendSystemPrompt`, `sections`, `cwd`, `contextFiles`, `skills`) — write the
   literal in full so `strict` checks every field — and deep-compares before/after.
   Proof: cases `main leaves the options untouched`, `replace sets the role prompt
   only`, `append extends the addendum`, `body is trimmed`, plus
   `append does not accumulate across runs`: two **separately normalized** fixture
   objects, each with a **non-empty** `appendSystemPrompt` so there is a separator to
   count, each applied once, each keeping exactly one `\n\n`. The case must not
   apply the function twice to one object — options are normalized per run, so
   mutation on a single object is expected to compound.

3. **Cycle list and persistence format** — create `src/state.ts`:
   `MAIN_LABEL = "Main"`, `STATE_CUSTOM_TYPE = "agent-switch-state"`,
   `CycleEntry = { label: string; agent: AgentDefinition | null }`,
   `buildCycleList(agents): CycleEntry[]` (`Main` first, then `enabled` agents
   sorted case-insensitively with `localeCompare(…, "en")`),
   `nextLabel(list, current): string` (wrap, unknown current → `Main`),
   `findEntry(list, label)`, `lastSelectedLabel(entries: readonly SessionEntry[]): string | null`
   (last `type === "custom" && customType === STATE_CUSTOM_TYPE` entry,
   `.data.name`, as `examples/extensions/preset.ts:433` persists it).
   `test/state.test.ts` uses plain agent fixtures.
   Proof: cases `cycle starts at Main`, `cycle wraps to Main`,
   `cycle sorts agents by name`, `cycle uses agent names`,
   `unknown label resolves to Main`; `npm run typecheck` still exits 0.

4. **Extension wiring** — create `src/extension.ts`, default export
   `agentSwitch(pi: ExtensionAPI): void`, closure state `let agents`, `let cycle`,
   `let currentLabel = MAIN_LABEL`, helper `setLabel(ctx)` →
   `ctx.ui.setStatus("agent", currentLabel)`. Register:
   `pi.on("session_start", …)` → `loadAgents(ctx.cwd, getAgentDir(), { onSkip: (p, r) => ctx.ui.notify(…) })`,
   rebuild `cycle`, restore via
   `lastSelectedLabel(ctx.sessionManager.getEntries())`, fall back to `Main` +
   `ctx.ui.notify(…, "warning")` when `findEntry` misses;
   `pi.registerShortcut("ctrl+shift+a", { description, handler })` (literal string
   — `KeyId` is a template-literal union, `Key.ctrlShift("a")` from
   `@earendil-works/pi-tui`, which `@earendil-works/pi-coding-agent` does not
   re-export) → `nextLabel`, `pi.appendEntry(STATE_CUSTOM_TYPE, { name: currentLabel })`,
   `setLabel`; `pi.on("before_agent_start", (event) => { applyAgentToPromptOptions(event.systemPromptOptions, findEntry(cycle, currentLabel)?.agent ?? null); })`
   returning `undefined`. `test/extension.test.ts` imports the factory and passes a
   stub `ExtensionAPI` (records `on`/`registerShortcut`/`appendEntry` in spies)
   plus a stub `ExtensionContext` cast via `as unknown as ExtensionContext`.
   Proof: cases `shortcut is registered`, `before_agent_start applies the current
   agent`, `footer shows the current name`, `selection is persisted`,
   `restore last selection`, `missing agent falls back to Main`; `npm test` exits 0.

5. **Acceptance commands and the manual check** — the **orchestrator** (not the
   implementer) replaces the placeholder under `## Acceptance` in `AGENTS.md` with
   `npm run typecheck` and `npm test`, answering `## Open questions` → "Acceptance
   command". No code in this stage. The operator then runs criterion 13:
   `pi --extension ./src/extension.ts`, cycle to `ranger-1`, send one message,
   confirm the footer text, an `AGENTS.md`-derived answer, an unchanged transcript
   and one successful tool call.
   Proof: `grep -n "npm test" AGENTS.md` shows both commands inside `## Acceptance`;
   both commands exit 0 from a clean `npm install`; the operator's confirmation is
   the only evidence for criterion 13.

### What could go wrong

- **Criterion 13 is not decidable by a command.** It stays a manual operator check;
  the plan cannot turn it into a test (`## Acceptance criteria`, last line).
  Everything else in the table is a vitest case or an exit code.
- **`Key` is not exported by `@earendil-works/pi-coding-agent`**
  (`dist/index.d.ts` has no `Key`; `examples/extensions/preset.ts:46` imports it
  from `@earendil-works/pi-tui`). Registering the literal `"ctrl+shift+a"` keeps
  the dependency table right.
- **Runtime import weight in tests.**
  `import { parseFrontmatter } from "@earendil-works/pi-coding-agent"` resolves to
  `dist/index.js` (loads in plain Node 22, ~3 s cold, `parseFrontmatter` returns
  `{frontmatter, body}`). Do not mock it — the case `broken file is skipped` relies
  on real YAML throwing (`YAMLParseError`).
- **`parseFrontmatter` already trims the body** (`"---\nname: x\n---\n\nbody line\n\n\n"`
  → `"body line"`), so `body is trimmed` passes either way; it stays as a lock
  against a parser swap.
- **`append` compounding.** Options are normalized per run, so appending to
  `event.systemPromptOptions` does not accumulate. The added second case makes that
  assumption fail loudly if pi ever carries mutations across runs.
- **Restore source.** `lastSelectedLabel` reads `getEntries()` (whole session, the
  `preset.ts` pattern); `docs/extensions.md` → "State" advises `getBranch()` for
  branch-sensitive data. On a branched session the label can come from an abandoned
  branch. Recorded, not fixed here.
- **Shortcut collision.** `ctrl+shift+a` is free in pi 1.3.0's defaults
  (`docs/keybindings.md` names `ctrl+shift+n/t/f/g/up/down`); pi prints a collision
  warning at load. Only the criterion-13 run proves it today.

### Ordering and dependencies

Stages build strictly in order: 1 gives `AgentDefinition` and the test harness
every later stage imports; 2 and 3 are independent of each other but both depend
on 1 and touch no file of the other; 4 is the only place that wires them, so
criteria 3, 10, 11, 12 complete there while their state and prompt halves are
already proven in 2 and 3; 5 documents commands that can only be written once both
exist.

Two widened signatures — `applyAgentToPromptOptions` accepting `AgentDefinition |
null` and `loadAgents` taking an optional third `options` argument — are already
part of `## Files and interfaces`, so they are not deviations from it. No file
listed there is left out, and no file outside it is created.

**Stages 1–4 are implementer work. Stage 5 is orchestrator and operator work** and
must not be parked on `ranger-1`: the `AGENTS.md` edit belongs to the orchestrator,
the live session to the operator.

### What the next increment inherits

- **Package-tier discovery.** `source: "package"` exists in the type but nothing
  produces it: enumerating pi's package agent directories needs the package
  manifest reader (`packageAgentDirs` in `@tintinweb/pi-subagents`), which is not in
  `## Files and interfaces`. The `packageDirs` seam in `loadAgents` is the entry
  point.
- **Adopting `model`, `thinking`, `tools`** from the agent file, and switch-time
  model changes — explicitly a separate spec (`## Non-goals`, `## Open questions`).
- **Out of scope and untouched:** picker dialog, slash command,
  `display_name`/`color` in the footer, a custom footer, re-reading agent files
  mid-session, `getBranch()`-based restore.
- **Process leftovers for the orchestrator, not the implementer:**
  `docs/README.md` `Status` column and `status: active` plus the descriptive
  rewrite belong to step 7 of the loop; `AGENTS.md` `## Open questions` still
  claims the directory is not under version control although commit `c836057`
  exists — the orchestrator settles that, not the implementer;
  `docs/PROJECT-STATE.md` stays unrequested.

## Review

**2026-11-12 — spec review, round 1 — 🔧 Fix these and I'll sign off — blockers: yes (3).**

Blocking:

1. Stage 2 proof case `append does not compound across runs` ("applies twice to one
   object") cannot pass against the append formula on the line above — assert on two
   separately normalized option objects, or drop the case.
2. The package tier is both in and out of scope: "four directories", the discovery
   order and `source: "package"` versus "no package tier is read" and the
   operator's "all four sources" — declare the deferral in `## Files and
   interfaces`, `## Non-goals` and `## Open questions`, or implement it.
3. Criterion 6 claims name ordering its cited cases cannot prove, and the name-keyed
   merge criterion 8 depends on has no case — add `cycle sorts agents by name` and
   `duplicate name: later tier wins`, cite them.

Non-blocking: stale "two additive deviations" paragraph; `SourceConflict` defined
nowhere; `test/state.test.ts` advertised a "restore" case that lives elsewhere; no
case fires the `before_agent_start` handler although the file table claims "event
behaviour"; label-as-identity stalls the cycle for an agent named `Main`; empty
prompt body silently keeps pi's default prompt; no size or regular-file guard;
`parseFrontmatter` is `Record<string, unknown>` and throws; Goal said "tools" where
it meant "tool availability"; unreadable directory unspecified; `preset.ts:47`→46
and `:432`→433; `KeyId` resolves `pi-tui` transitively; stage-2 fixture needs the
full twelve-field normalized object; stage 5 is orchestrator and operator work, not
`ranger-1`; no `## Log` row for the step-2 criteria agreement. Security: agent
bodies are repo-controlled text behind no trust gate.

Round 1 outcome: all three blockers and every non-blocking note are addressed in
this document. The package tier is deferred explicitly, with the operator's
agreement on 2026-11-12, rather than implemented.

**2026-11-12 — spec review, round 2 — ✅ Ship it — blockers: no.**

Verified the round-1 fixes: B1 (two separately normalized fixtures, one apply each),
B2 (package tier deferred consistently in `## Non-goals`, `## Files and
interfaces`, precedence, `## Open questions`, `## Log`; no section still promises
it), B3 (`cycle sorts agents by name` and `duplicate name: later tier wins` exist
and criteria 6 and 8 cite them). Re-checked the anchors in the pi 1.3.0 install
tree: `preset.ts:46`/`:433`, `KeyId` accepts the literal `"ctrl+shift+a"`, `pi-tui`
is a real dependency of `pi-coding-agent`, the trust gate lists `settings.json`,
`mcp.json`, `extensions`, `skills`, `prompts`, `themes`, `SYSTEM.md`,
`APPEND_SYSTEM.md` and no `agents`, `parseFrontmatter` trims the body and throws on
bad YAML, `MAX_PACKAGE_RESOURCE_BYTES = 1_048_576`, the twelve normalized fields,
`notify(message, "warning")`.

Blocking: none. Non-blocking notes, all folded into this document: a `## Testing`
row for the append case; a non-empty seed in that case; a wrong claim about
`NormalizedBuildSystemPromptOptions` not being re-exported (it is, `dist/index.d.ts`);
"all four sources" reworded to past intent; the package tier ranks **first**
upstream, not above the others; two cases for non-regular file and unreadable
directory; the 1 MiB ceiling named as a stricter local choice; a tie-break for names
differing only in case.

Gate: open.

## Log

| Decision | Source | Date |
|---|---|---|
| `ctrl+shift+a` cycles; no picker | operator | 2026-11-12 |
| Cycle order `Main` first, then agent names; name in the footer | operator | 2026-11-12 |
| Prompt swap keeps project context (opencode behaviour) | operator | 2026-11-12 |
| A system delta in the session is acceptable | operator | 2026-11-12 |
| No chat message for the switch | operator | 2026-11-12 |
| Only the system prompt changes; model/thinking/tools are a later increment | operator | 2026-11-12 |
| The choice survives a session resume | operator | 2026-11-12 |
| All discovery sources intended; package tier deferred the same day | operator | 2026-11-12 |
| Rejected: forcing the whole prompt via `systemPrompt` | operator | 2026-11-12 |
| Goal and `## Acceptance criteria` (13 criteria, `npm run typecheck` + `npm test`) approved — step 2 of the loop | operator ("sieht gut aus") | 2026-11-12 |
| Package tier deferred explicitly; three discovery sources in this increment | operator | 2026-11-12 |
| Agent named `Main` is skipped, the label is the identity | spec review round 1 | 2026-11-12 |
| No project-trust gate on agent files; documented under `## Risks` | spec review round 1 | 2026-11-12 |
| B1 fixed: the append case asserts two separately normalized fixtures, not two applies on one object | spec review round 1 | 2026-11-12 |
| B2 fixed: package tier deferred in every section, with the operator's agreement | spec review round 1 + operator | 2026-11-12 |
| B3 fixed: `cycle sorts agents by name` and `duplicate name: later tier wins` added and cited | spec review round 1 | 2026-11-12 |
| Package tier ranks **first** (lowest) upstream — wording corrected | spec review round 2 | 2026-11-12 |
| 1 MiB ceiling applied to local files too, stricter than upstream | spec review round 2 | 2026-11-12 |
| Sort ties keep discovery order | spec review round 2 | 2026-11-12 |
| Spec approved — gate open | spec review round 2 | 2026-11-12 |
| Stage 1 committed: `.gitignore` added by the orchestrator (no behavioural effect); `skipLibCheck: true` and `target: es2023` in `tsconfig.json` accepted as necessary | code review round 1 + 2 | 2026-11-12 |
| `enabled: false` agents stay in the loader result; the cycle filters them (stage 3) | code review round 1, accepted | 2026-11-12 |
| Symlink rejection added beyond the original skip list | code review round 1 | 2026-11-12 |
| Stage 2 committed: criteria 3, 4, 5 asserted; three follow-ups logged (empty-body case, reference comparison, trim twice) | code review, `✅` | 2026-11-12 |
| Stage 3 comparator uses `localeCompare(…, "en", { sensitivity: "accent" })`, not the plan's plain `localeCompare(…, "en")` — the plain form reorders names differing only in case | code review round 1 + implementer | 2026-11-12 |
| Stage 3 committed: the tie case was rebuilt so it fails under the plain comparator (`Ranger` before `ranger` in discovery order) | code review round 2, `✅` | 2026-11-12 |
| `MAIN_LABEL` from `state.ts` is the single source for the reserved name; `agents.ts` derives from it | implementer, reviewed | 2026-11-12 |
| Stage 4 committed (wiring) and stage 5 (`AGENTS.md` acceptance block); both code reviews `✅` | code review | 2026-11-12 |
| Live check, `pi --extension ./src/extension.ts`: footer `Main`; four presses `Main → architect → grizzled-senior-dev → ranger-1 → Main`; answer came from `AGENTS.md` (roles and gates); a `read` tool call worked under `replace`; no chat entry for the switch | operator and orchestrator in tmux | 2026-11-12 |
| Resume check: `pi --session <file>` restores the footer to `architect`, and the agent still answers as the architect | operator and orchestrator in tmux | 2026-11-12 |
| Session record inspected: the system entry carries the agent body under `preamble` while `project_context`, `skills`, `cwd` and `mcp_servers` are unchanged; five `agent-switch-state` entries, no `custom_message` | orchestrator | 2026-11-12 |
| Spec set to `active`; the two follow-ups moved to `## Known gaps` | orchestrator | 2026-11-12 |
| `applyAgentToPromptOptions` takes `AgentDefinition \| null` for `Main`; `loadAgents` gains an optional `options` argument | architect, accepted by orchestrator | 2026-11-12 |
| The `AGENTS.md` acceptance block is edited by the orchestrator, not the implementer | orchestrator | 2026-11-12 |
| `Key` is not re-exported by `pi-coding-agent`; the shortcut uses the literal `"ctrl+shift+a"`, so `pi-tui` stays out | architect | 2026-11-12 |
