---
description: Cycles the main agent's system prompt through the agent definition files on ctrl+shift+a, effective on the next message, keeping project context and conversation history intact.
status: proposed
---

# 01 — Cycle the main agent's system prompt mid-conversation

## Goal

Today the main agent of a pi session keeps the system prompt it started with. A
person who wants the same transcript answered by a different agent has to start a
new session and lose the conversation. This increment adds a cycle on `ctrl+shift+a`:
`Main` (the untouched pi prompt), then each agent definition found on the machine.
The footer shows the current name. The next message is composed with that agent's
prompt body as the role prompt, while project context, tools and the conversation
stay as they are.

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

## Files and interfaces

| File | Content |
|---|---|
| `package.json` | `"pi": { "extensions": ["./src/extension.ts"] }`, scripts `test` and `typecheck`, dev dependencies |
| `tsconfig.json` | `strict: true`, Node ESM module settings, `noEmit: true` |
| `vitest.config.ts` | test include, no globals |
| `src/extension.ts` | factory: shortcut, `before_agent_start`, `session_start`, footer status |
| `src/agents.ts` | discovery and parsing over the four directories |
| `src/prompt.ts` | `applyAgentToPromptOptions(options, agent)` — pure, mutates only the two named fields |
| `src/state.ts` | cycle position, the `agent-switch-state` session entry, label formatting |
| `test/agents.test.ts` | discovery order, filtering, parsing |
| `test/prompt.test.ts` | the two prompt modes |
| `test/state.test.ts` | cycle order, wrapping, restore |
| `test/extension.test.ts` | registration, event behaviour against a stub API |

```ts
export interface AgentDefinition {
  name: string;                       // frontmatter `name`, else the file name
  description: string;                // frontmatter `description`, else the name
  prompt: string;                     // file body, trimmed
  promptMode: "replace" | "append";   // frontmatter `prompt_mode`, default "replace"
  enabled: boolean;                   // frontmatter `enabled`, default true
  sourcePath: string;                 // absolute path of the .md file
  source: "project" | "workspace" | "global" | "package";
}

export function loadAgents(cwd: string, agentDir: string): AgentDefinition[];

/** Mutates only `customPrompt` (replace) or `appendSystemPrompt` (append). */
export function applyAgentToPromptOptions(
  options: NormalizedBuildSystemPromptOptions,
  agent: AgentDefinition,
): void;
```

Rules fixed here:

- **Discovery order** (later wins, as `pi-subagents` does it): package → global
  `~/.pi/agent/agents/*.md` → workspace `<cwd>/.agents/agents/*.md` → project
  `<cwd>/.pi/agents/*.md`.
- **A broken file** is skipped and named in a `ctx.ui.notify` warning; it never
  breaks the cycle.
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
| 6 | Cycle order is `Main`, then agents by name, wrapping | cases `cycle starts at Main`, `cycle wraps to Main` |
| 7 | `enabled: false` agents are not in the cycle | case `disabled agent is skipped` |
| 8 | A project agent shadows a global one of the same name | case `project agent overrides global` |
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
| `test/agents.test.ts` | `parses name, description and prompt mode` | frontmatter becomes the interface |
| | `name falls back to the file name` | a file without `name:` is still cycleable |
| | `project agent overrides global` | precedence is real |
| | `workspace agent is read` | `.agents/agents` is not forgotten |
| | `disabled agent is skipped` | `enabled: false` means not offered |
| | `broken file is skipped` | one bad file does not stop the cycle |
| `test/state.test.ts` | `cycle starts at Main` / `cycle wraps to Main` | order and wrap-around |
| | `cycle uses agent names` | the label is the agent name, not the path |
| `test/extension.test.ts` | `shortcut is registered` | exactly `ctrl+shift+a` |
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
| `@earendil-works/pi-coding-agent` | 1.3.0 | MIT | extension types, `parseFrontmatter`, `getAgentDir`, `Key` |
| `vitest` | 5.1.0 | MIT | test runner |
| `typescript` | 6.0.3 | Apache-2.0 | type check, no emit |
| `@types/node` | 22.20.5 | MIT | `fs` and `path` types |

`pi-tui` is not needed: no picker, no custom component. `pi-ai` is not needed: the
extension does not touch models. Exact versions live in `package-lock.json`;
`npm install` is the only setup step.

## Open questions

- None open for this increment.
- Known follow-up, deliberately outside this spec: whether adopting `model`,
  `thinking` and `tools` from the agent file is wanted ("part 2"; opencode ties the
  model to the agent and switches it along).

## Dev plan

(pending — filled by the architect in step 3 of the loop)

## Review

(no rounds yet)

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
| Picker offers all four discovery sources | operator | 2026-11-12 |
| Rejected: forcing the whole prompt via `systemPrompt` | operator | 2026-11-12 |
