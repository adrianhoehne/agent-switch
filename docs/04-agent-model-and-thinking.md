---
description: Adopts the optional model and thinking level of an agent definition when the cycle selects it, keeping the current values when a field is absent or unusable, and restores the session's starting state on Main.
status: proposed
---

# 04 — Optional model and thinking from the agent file

## Goal

An agent definition can name a model and a thinking level. When the cycle selects such
an agent, the session uses them from the next message on. When a field is absent, the
current value stays. When a field is present but unusable — a typo, a model without an
API key, a level pi does not know — that field is dropped with a warning and the
current value stays. `Main` means the session's starting state: cycling back to it
restores the model and thinking level the session began with.

## Decisions behind the behaviour

| Point | Decision |
|---|---|
| `Main` | restores the snapshot taken when the session first left `Main`; it is the initial state, not "an agent without a model" |
| Snapshot timing | captured once, on the first transition away from `Main`, and kept for the rest of the session; moving between two agents does not re-snapshot |
| Resume | the restored selection is applied again at `session_start`; if it cannot be applied, the current value stays |
| Model and thinking | independent fields, independent fallbacks; the model is set first, because pi clamps the thinking level against the model |
| Failure | `ctx.ui.notify(..., "warning")`, naming the field and the value |
| Model syntax | `provider/modelId` resolves exactly; a bare `modelId` matches an available model by id; anything else is unusable |
| Unknown level | a `thinking` value outside `off, minimal, low, medium, high, xhigh, max` is unusable, not clamped by us |

## Non-goals

- **No** adoption of `tools`, `extensions` or `skills` from the agent file. Only the two
  named fields.
- **No** model adoption for subagents or for the agent files of other callers — this
  changes the *main* agent, the one the cycle switches.
- **No** persistence of the model into `settings.json`. The change lives in the session,
  like the prompt does.
- **No** warning when an agent simply has no `model:` or `thinking:` — absence is normal.
- **No** package tier, no picker, no slash command; all still separate.

## Files and interfaces

| File | Change |
|---|---|
| `src/agents.ts` | `AgentDefinition` gains `model?: string` and `thinking?: ThinkingLevel`; both parsed from the frontmatter, `thinking` validated against the seven levels, an unknown level left unset |
| `src/apply.ts` | **new**: `resolveModel(ref, available): Model \| undefined` and `applySelection(agent, deps)` — the decision half, pure, no pi session required |
| `src/extension.ts` | the shortcut handler applies a selection and captures or restores the snapshot; `session_start` re-applies a resumed selection |
| `test/agents.test.ts` | the two new fields |
| `test/apply.test.ts` | **new**: resolution, application, fallbacks |
| `test/extension.test.ts` | wiring: applied on cycle, warned on failure, restored on `Main`, re-applied on resume |
| `docs/01-switch-main-agent-prompt.md` | amended in place: `AgentDefinition` gains the two fields (`## Amendments to previous spec docs`) |

```ts
// Local union, not an import: `ThinkingLevel` lives in @earendil-works/pi-agent-core and
// `pi.setThinkingLevel` accepts this shape structurally. No new dependency.
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface AgentDefinition {
  // …unchanged fields…
  model?: string;                     // `provider/modelId` or a bare model id
  thinking?: ThinkingLevel;           // absent when the file names an unknown level
}

/** Structural, so the test needs no pi runtime: a real Model satisfies it. */
export interface ModelRef {
  readonly provider: string;
  readonly id: string;
}

export interface SelectionDeps<M extends ModelRef> {
  available: readonly M[];            // ctx.modelRegistry.getAvailable()
  setModel(model: M): Promise<boolean>;
  setThinkingLevel(level: ThinkingLevel): void;
  warn(message: string): void;
}

export function resolveModel<M extends ModelRef>(ref: string, available: readonly M[]): M | undefined;

/** Applies what is usable, warns about what is not. Never throws. */
export function applySelection<M extends ModelRef>(
  agent: AgentDefinition | null,
  deps: SelectionDeps<M>,
): Promise<{ modelApplied: boolean; thinkingApplied: boolean }>;
```

## Acceptance criteria

| # | Criterion | Command / evidence |
|---|---|---|
| 1 | Type check passes | `npm run typecheck` exits 0 |
| 2 | The suite passes, 35 existing cases unchanged plus the new ones | `npm test` exits 0; the new case names appear in the output |
| 3 | `model` and `thinking` are parsed; an unknown level leaves the field unset | cases `parses model and thinking`, `unknown thinking level is left unset` |
| 4 | `provider/id` resolves exactly; a bare id resolves against the available models; an unknown reference resolves to `undefined` | cases `resolves provider and id`, `resolves a bare model id`, `unknown model resolves to nothing` |
| 5 | An agent with no fields changes nothing | case `no fields leaves model and thinking alone` asserts neither setter was called |
| 6 | A usable model and level are applied, model first | case `applies model before thinking` asserts the call order |
| 7 | An unusable model leaves the current model and still applies a usable level | case `bad model keeps the model and applies thinking` |
| 8 | `setModel` returning `false` keeps the current model and warns | case `refused model keeps the current one and warns` |
| 9 | `Main` restores the snapshot; the snapshot is taken on the first exit only | cases `Main restores the snapshot`, `agents do not re-snapshot` |
| 10 | A resumed selection is applied again at `session_start` | case `resume applies the selection again` |
| 11 | Live: `architect` carries `thinking: high` today; cycling to it shows `high` in the footer, cycling back to `Main` shows the level the session started with | operator, `pi --extension ./src/extension.ts` |

Criterion 11 is the operator's. Criteria 1–10 decide the commit.

## Testing

| File | Case | What it proves |
|---|---|---|
| `test/agents.test.ts` | `parses model and thinking` | both fields reach `AgentDefinition` |
| | `unknown thinking level is left unset` | a typo is a missing field, not a clamped guess |
| `test/apply.test.ts` | `resolves provider and id` | exact reference |
| | `resolves a bare model id` | id-only reference against the available list |
| | `unknown model resolves to nothing` | no accidental match |
| | `no fields leaves model and thinking alone` | absence changes nothing |
| | `applies model before thinking` | order, because pi clamps the level against the model |
| | `bad model keeps the model and applies thinking` | the two fields fall back independently |
| | `refused model keeps the current one and warns` | `setModel → false` is a warning, not a change |
| | `unusable level warns and keeps the level` | the thinking half of the same rule |
| `test/extension.test.ts` | `cycle applies the agent's model and level` | the handler wires the decision half |
| | `Main restores the snapshot` | Main is the initial state |
| | `agents do not re-snapshot` | the snapshot is taken once, on the first exit |
| | `resume applies the selection again` | a resumed label is not just a name |

## Risks and alternatives

- **A model change mid-conversation changes the context window.** A transcript that
  fitted before may not fit afterwards, and pi compacts. The operator accepted this:
  it is the same risk as switching the model by hand. It stays named here so nobody
  meets it as a surprise.
- **The snapshot can go stale.** It records the model the session started with; if that
  model is gone when you cycle back to `Main`, the restore fails and warns, and the
  current model stays. That is the same fallback as everywhere else, not a special case.
- **`thinking` on a model that does not support it** is clamped down by pi. We do not
  second-guess that; the footer shows the effective level.
- **The visible change today:** the global agent files already carry `thinking: high`
  (`architect`, `scout-1`) and `medium` (`ranger-1`). After this increment, cycling to
  them changes the level. `grizzled-senior-dev` has no level and changes nothing.
- **Rejected alternative: adopt `tools` too.** A prompt swap keeps tool availability
  stable; adopting tools would change what the agent can do mid-conversation, and it is
  a separate decision.
- **Rejected alternative: write the model into `settings.json`.** A switch is session
  state, like the prompt; persisting it would change the next session silently.

## Touch boundary

| File | Owner |
|---|---|
| `src/agents.ts`, `src/apply.ts`, `src/extension.ts` | implementer |
| `test/agents.test.ts`, `test/apply.test.ts`, `test/extension.test.ts` | implementer |
| `docs/01-switch-main-agent-prompt.md` | orchestrator (the `AgentDefinition` amendment, step 7) |

- **Not** any file under `~/.pi/agent/**` or `~/.agents/**` — the agent files are read,
  never written; `keybindings.json` is already in place and not part of this increment.
- **Not** generated folders: `node_modules/`, `coverage/`, `dist/`.

## Additional dependencies

None. The two pi types that would have been needed are not part of
`@earendil-works/pi-coding-agent`'s public surface — `ThinkingLevel` lives in
`@earendil-works/pi-agent-core`, and a `Model` in `@earendil-works/pi-ai` — so the code
uses a local `THINKING_LEVELS` union and a structural `ModelRef`. A real `Model`
satisfies `ModelRef`, and `setThinkingLevel` accepts the union structurally. That keeps
the dependency table unchanged and the tests free of a pi runtime.

## Open questions

None. The five behavioural decisions were answered by the operator on 2026-11-12 and
are recorded in `## Log`.

## Dev plan

(pending — filled by the architect in step 3 of the loop)

## Amendments to previous spec docs

`docs/01-switch-main-agent-prompt.md` owns the `AgentDefinition` interface and states
that only the system prompt is swapped. Both change here, so 01 is amended in place in
the same increment, as 02 and 03 did:

| `docs/01` location | Change |
|---|---|
| `## Files and interfaces`, the `AgentDefinition` block | gains `model?: string` and `thinking?: ThinkingLevel` |
| `## Files and interfaces`, the `src/agents.ts` row | mentions the two parsed fields |
| `## Non-goals`, the first bullet ("Not adopting `model`, `thinking` or `tools`") | narrowed to `tools`; the other two are adopted by this increment |
| `## Known gaps`, the row about `model`/`thinking`/`tools` | reduced to `tools` |
| `## Log` | keeps its rows; the follow-up is history |

Proof after the amendment: `grep -n 'model.*thinking' docs/01-switch-main-agent-prompt.md`
no longer reports a section that claims the two fields are not adopted. This section is
removed at step 7, when 01 is amended.

## Review

(no rounds yet)

## Log

| Decision | Source | Date |
|---|---|---|
| `Main` is the session's starting state and restores the snapshot | operator | 2026-11-12 |
| Resume re-applies the agent's model; a failure leaves the current model | operator | 2026-11-12 |
| Model and thinking fall back independently (simpler: two fields, two fallbacks) | operator asked which is simpler; orchestrator chose independent | 2026-11-12 |
| A failure is reported with `ctx.ui.notify` as a warning | operator | 2026-11-12 |
| Changing the model mid-conversation can force a compaction — accepted, same as switching by hand | operator | 2026-11-12 |
