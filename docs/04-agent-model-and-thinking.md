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
| Press while streaming | rejected: nothing changes, one warning. A model swap mid-run would let a response and its tool continuation run on different models |
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
| 2 | The suite passes with 53 cases: the 35 existing names unchanged plus 18 new ones | `npm test` exits 0 and its summary reads `Tests  53 passed (53)`. Under root the `it.skipIf` case skips, so the summary reads `52 passed | 1 skipped` |
| 3 | `model` and `thinking` are parsed; an unknown level leaves the field unset | cases `parses model and thinking`, `unknown thinking level is left unset` |
| 4 | `provider/id` resolves exactly; a bare id resolves against the available models; an unknown reference resolves to `undefined` | cases `resolves provider and id`, `resolves a bare model id`, `unknown model resolves to nothing` |
| 5 | An agent with no fields changes nothing | case `no fields leaves model and thinking alone` asserts neither setter was called |
| 6 | A usable model and level are applied, model first | case `applies model before thinking` asserts the call order |
| 7 | An unusable model leaves the current model and still applies a usable level | case `bad model keeps the model and applies thinking` |
| 8 | `setModel` returning `false` keeps the current model and warns | case `refused model keeps the current one and warns` |
| 9 | `Main` restores the snapshot; the snapshot is taken on the first exit only | cases `Main restores the snapshot`, `agents do not re-snapshot` |
| 10 | A resumed selection is applied again at `session_start` | case `resume applies the selection again` |
| 11 | A press while a response streams changes nothing and warns once | case `press while streaming changes nothing` asserts no entry, no status, no `setModel` and one warning |
| 12 | Live: `architect` carries `thinking: high` today; cycling to it shows `high` in the footer, cycling back to `Main` shows the level the session started with | operator, `pi --extension ./src/extension.ts` |

Criterion 12 is the operator's. Criteria 1–11 decide the commit.

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
| | `a throwing setter warns instead of crashing` | `setModel` throws when a model has no API key; the contract is "never throws" |
| `test/extension.test.ts` | `cycle applies the agent's model and level` | the handler wires the decision half |
| | `Main restores the snapshot` | Main is the initial state |
| | `agents do not re-snapshot` | the snapshot is taken once, on the first exit |
| | `resume applies the selection again` | a resumed label is not just a name |
| | `press while streaming changes nothing` | the guard: no entry, no status, no model change, one warning |
| | `Main restore that throws warns instead of crashing` | the snapshot's model can lose its key too; same rule as `applySelection` |
| | `snapshot without a model still restores the level` | `ctx.model` can be undefined at capture time; the level is restored anyway |

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

1. **Parse the two fields** — `src/agents.ts` and `test/agents.test.ts`.
   Add `export const THINKING_LEVELS = ["off","minimal","low","medium","high","xhigh","max"] as const;`
   and `export type ThinkingLevel = (typeof THINKING_LEVELS)[number];` above
   `AgentDefinition` (they describe a frontmatter field, so `apply.ts` imports the type
   from `./agents`; no cycle, since `agents.ts` never imports `apply.ts`). Extend
   `AgentDefinition` with `model?: string` and `thinking?: ThinkingLevel`, filled in
   `readAgentFile` next to `promptMode`: `model` from `readString(frontmatter, "model")`,
   `thinking` through `readThinkingLevel(frontmatter)` which returns `undefined` for
   anything outside `THINKING_LEVELS`. Reuse the "a wrong type is a missing field"
   convention. (`thinking: off` arrives as the string `"off"` in pi 1.3.0, not as `false`;
   no special case is needed.)
   Do not touch `loadAgents`, the skip rules, `findFileProblem` or any other key.
   Tests: `parses model and thinking`, `unknown thinking level is left unset`.
   Proof: `npx vitest run test/agents.test.ts` exits 0 with 16 cases; `npm run typecheck`
   exits 0 — the type check is the real guard here, because the existing cases compare
   fields one by one and added optional keys cannot break them.

2. **The decision half** — new `src/apply.ts` and `test/apply.test.ts`.
   `src/apply.ts` imports **types only** (`import type { AgentDefinition, ThinkingLevel }
   from "./agents"`), so it runs without a pi session. Contents as in the spec's
   interface block. Decisions to write down in comments:
   - `resolveModel` splits at the **first** `/` (provider ids carry none, model ids do:
     `meta-llama/llama-3.1-70b` must survive as an id). Without a `/` it matches
     `available` by `id`, first match wins.
   - `applySelection` sets the model first, then the level, and the two fallbacks are
     independent. Every rejection calls `deps.warn` naming field, value and agent, e.g.
     `Agent "architect": model "nope/model" is not available — keeping the current model.`
   - `agent === null`, or an agent with neither field, touches nothing and warns nothing.
   - "Never throws" is part of the contract: `try`/`catch` around both setters turns a
     throw into a warning and `…Applied: false`.
   Tests: the nine the spec's `## Testing` table lists for this file, the throwing setter
   among them. The one case needing an out-of-union level casts with
   `"ultra" as ThinkingLevel`, because `agents.ts` already drops it — this guard is the
   second line of defence.
   Proof: `npx vitest run test/apply.test.ts` exits 0 with 9 cases.

3. **Handler path: guard, snapshot, apply, restore** — `src/extension.ts` and
   `test/extension.test.ts`.
   - `type AvailableModel = ReturnType<ExtensionContext["modelRegistry"]["getAvailable"]>[number];`
     and `type MainState = { readonly model: ExtensionContext["model"]; readonly thinking: ThinkingLevel };`
     — spelled from the context type, so no `Model`/`ThinkingLevel` import from pi packages.
   - `function selectionDeps(ctx): SelectionDeps<AvailableModel>` returning `available`,
     `setModel`, `setThinkingLevel`, `warn` (→ `ctx.ui.notify(message, "warning")`). Built
     per call, never cached: `ctx` differs between `session_start` and the handler.
   - `let mainSnapshot: MainState | null = null;` in the factory closure.
   - `async function restoreMain(snapshot, deps)`: `null` → nothing; a snapshot without a
     model (`ctx.model` is `Model | undefined`) → skip the model silently and keep the
     level; model first, `false` **or a throw** → warn naming provider/id; then
     `setThinkingLevel`. It calls `deps` directly because the
     snapshot holds a `Model`, not a reference string.
   - The shortcut handler becomes `async (ctx)` and keeps its order, with two insertions:
     after the `cycle.length === 0` guard, `if (!ctx.isIdle()) { ctx.ui.notify("A response
     is still streaming — the agent is switched once it is idle.", "warning"); return; }`;
     and `const previousLabel = currentLabel;` before `nextLabel`, then on
     `previousLabel === MAIN_LABEL && mainSnapshot === null` capture
     `{ model: ctx.model, thinking: pi.getThinkingLevel() }`. `pi.getThinkingLevel()`, not
     `ctx.thinkingLevel` (optional). Then `appendEntry`, `setLabel`, and
     `await (selectedAgent() === null ? restoreMain(mainSnapshot, deps) : applySelection(agent, deps))`.
   - **Capture only here, never in `session_start`.** pi persists the session model in the
     transcript, so at a resumed `session_start` `ctx.model` is already the agent's model.
     One capture site makes that trap structurally impossible.
   - Test fixture work: `createStubApi` gains `setModel` (records, configurable boolean),
     `setThinkingLevel` (records), `getThinkingLevel`; `createStubContext` gains `model`,
     `modelRegistry: { getAvailable, find }` and `isIdle: () => true`. `pressShortcut`
     returns the handler's promise; the nine existing cases gain `await` — names, givens
     and assertions unchanged, the `await` is mechanical. `writeAgent` gains an optional
     third parameter for frontmatter fields.
   - New cases: `cycle applies the agent's model and level`, `Main restores the snapshot`,
     `agents do not re-snapshot`, `press while streaming changes nothing`,
     `Main restore that throws warns instead of crashing`,
     `snapshot without a model still restores the level`.
   Proof: `npx vitest run test/extension.test.ts` exits 0 with 15 cases.

4. **Re-apply a resumed selection** — `src/extension.ts` and `test/extension.test.ts`.
   Make the `session_start` handler `async`; after `cycle = loadCycle(ctx)`,
   `restoreSelection`, `currentLabel`, the missing-label warning and `setLabel`, add
   `if (currentLabel !== MAIN_LABEL) await applySelection(selectedAgent(), deps);` with a
   comment that this is the one place the extension applies without a keypress, and why it
   can never capture the snapshot (no capture statement exists in this handler).
   `startSession` returns the handler's promise, and the nine existing cases that call it
   gain `await`.
   New case `resume applies the selection again`: a state entry for an agent carrying
   `model: anthropic/claude-sonnet-4` and `thinking: high`; `session_start` records both
   setters. Also assert that a subsequent press to `Main` applies nothing
   (`mainSnapshot` is still `null`) — that pins the in-memory limit instead of leaving it
   to be discovered.
   Proof: `npx vitest run test/extension.test.ts` exits 0 with 16 cases; `npm run
   typecheck` exits 0; `npm test` exits 0 and its summary reads `Tests  53 passed (53)`.

5. **Not implementer work — the `docs/01` amendment (orchestrator, step 7).** The five
   places under `## Amendments to previous spec docs` are edited in this increment.
   Proof: `grep -n 'model.*thinking' docs/01-switch-main-agent-prompt.md` no longer reports
   a passage claiming the two fields are not adopted; its `## Log` rows stay as history.

6. **Not implementer work — criterion 12 (operator).** `pi --extension ./src/extension.ts`,
   cycle to `architect` (`thinking: high`), press on and back to `Main`. Needs a real
   terminal, real API keys and a real session, which `AGENTS.md` keeps out of agent hands.

### What could go wrong

- **The `await` conversion looks like churn.** Nine existing extension cases and two
  helpers gain `await`; nothing else in them may change. If an assertion has to be
  rewritten, the wiring is wrong, not the test.
- **Capturing the snapshot in `session_start` is the trap.** It compiles, it passes
  `Main restores the snapshot`, and it quietly makes `Main` restore the *agent's* model
  after a resume. Stage 4's second assertion exists to catch this.
- **The idle guard changes visible behaviour.** A press while pi streams used to flip the
  label and now only warns. Intended, and now covered by criterion 11 — do not read the
  warning in a live session as a bug.
- **A missing snapshot on a resumed session is not a failure.** `Main` then applies
  nothing and does not warn: absence is normal, and the snapshot is deliberately not
  persisted (spec `## Known gaps`). Do not "fix" it with a warning.
- **`restoreMain` duplicates five lines of `applySelection`.** Deliberate and bounded:
  same order, same `false` → warn rule. One code path would need a third export in the
  spec's interface, which only the orchestrator may change.
- **Do not resolve the snapshot's model back through a reference string.** It adds a
  `getAvailable()` round trip and fails with a spurious warning on a scoped model list.
- **`ctx.isIdle()` is a runtime member** (`dist/core/extensions/types.d.ts`): if the stub
  omits it the case fails at runtime, not at typecheck, because the fixture casts.
- **No new dependency, no `Model`/`ThinkingLevel` import from pi**: both types live in
  packages that are not dependencies of this one.

### Ordering and dependencies

Strictly 1 → 2 → 3 → 4. Stage 1 must precede 3 and 4 (the fields must exist), stage 2 must
precede 3 (`selectionDeps` implements `SelectionDeps`). No stage depends on a later one;
each leaves the suite green. Stages 5 and 6 follow the commit of 4; criterion 12 is the
operator's, after 5.

### What the next increment inherits

- **The snapshot does not survive a new process** — see `## Known gaps`; making it durable
  is its own spec.
- **Bare-id resolution is first-match-wins** across providers; a tie rule is unbuilt.
- **`thinking` is not validated against the model**; pi clamps, and we do not
  second-guess it.
- **`tools`, `extensions`, `skills` in an agent file stay ignored**, as do package-tier
  agents and any `/agent` command.
- `docs/README.md`'s `Status` column and the flip of `04` to `active` are the
  orchestrator's, in step 7.

## Known gaps

Recorded 2026-11-12. Each is a limit of this increment, not a defect.

| Gap | Why it stays open |
|---|---|
| The snapshot is in memory, not in the session | after a reload or resume of a session that was on an agent, `Main` applies nothing because there is no snapshot. Persisting it means a stored entry, a reader in `state.ts` and a decision about what "starting state" means for a resumed session — its own spec |
| A bare model id resolves first-match-wins | `getAvailable()` order decides; a tie rule (scoped models first, or a warning on ambiguity) is unbuilt |
| `thinking` is not checked against the chosen model | pi clamps an unsupported level and the footer shows the effective value; warning about a clamp is not part of this increment |
| A resume re-applies the model even when it is already current | `pi.setModel` appends a `model_change` entry, so every resume writes one. `SelectionDeps` has no `currentModel`/`currentThinking`, so a no-op skip is not possible without widening the interface |

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
| `### What the next increment inherits` | the bullet naming `model`/`thinking` adoption as a later increment is now shipped |
| frontmatter `description` and `## Goal` | **stay as they are**: 01's subject is still the prompt swap; model and thinking are additive and are documented here |
| `docs/03-shift-tab-shortcut.md`, `## Non-goals` | "No change to how thinking levels are set … beyond releasing the key" stops holding the moment this ships |

Proof after the amendment: `grep -n 'of the agent file are not adopted\|Not\*\* adopting' docs/01-switch-main-agent-prompt.md`
prints nothing, and `grep -n 'beyond releasing the key' docs/03-shift-tab-shortcut.md` prints
nothing. A grep on `model.*thinking` would also match the rewritten `src/agents.ts` row, so
it cannot decide the amendment. This section is
removed at step 7, when 01 is amended.

## Review

**2026-11-12 — spec review, round 1 — 🔧 Fix these and I'll sign off — blockers: yes (5).**

The trap-notes were verified against the installed 1.3.0 and hold: `setModel` clamps
thinking inside itself, and a resumed session's `ctx.model` is already the stored one, so
capturing the snapshot only in the shortcut handler is right. The local seven-level union
matches `ThinkingLevel` exactly, `registerShortcut` accepts a promise, `isIdle()`,
`getAvailable()` and the boolean `setModel` exist. The increment is still one increment.

Blocking: (1) case arithmetic — `agents` has 14 cases (13 `it` plus one `it.skipIf`), so
stage 1 ends at 16 and the increment at 51, not 15 and 50; (2) `restoreMain` would throw
out of the keypress, because `setModel` throws for a model without an API key instead of
returning `false`, so the `## Risks` claim described code nobody had planned; (3)
`ctx.model` is `Model | undefined`, so the snapshot needed a rule for a missing model; (4)
the amendments list missed `docs/03`'s non-goal about thinking levels and `docs/01`'s
"What the next increment inherits"; (5) the amendment proof could never come back clean,
because the `## Log` row deliberately keeps the words.

Non-blocking, folded in: no YAML `false` case for `thinking: off` (it arrives as the
string); a resume appends a `model_change` entry every time, now a Known gap; the
throwing-setter and restore-throw cases are in `## Testing`; criterion 2 is pinned to
`Tests  51 passed (51)`.

Round 1 outcome: all five blockers and all four notes applied.

**2026-11-12 — spec review, round 2 — 🔧 Fix these and I'll sign off — blockers: yes (1).**

Four of the five round-1 blockers landed: the amendments list covers all four
`model.*thinking` lines in `docs/01` (34, 254, 415, 493) plus `docs/03`'s non-goal,
`restoreMain` catches, the undefined-model rule is written, and the twelve criteria end on
the operator's live check.

Blocking: the same arithmetic, one case later — `## Testing` named a new extension case
that no stage built, so the plan reached 51 while the table implied 52.

Non-blocking, applied: the undefined-model branch got its own case; the amendment proof no
longer expects a line that will not be there; `docs/01`'s frontmatter and Goal are recorded
as deliberately unchanged; stage 4 names `startSession`; stage 2 counts one cast, not two;
`## Known gaps` is dated.

Round 2 outcome: blocker and all notes applied. Totals recomputed: 35 + 2 + 9 + 6 + 1 =
53, with 18 new cases.

**2026-11-12 — spec review, round 3 — ✅ Ship it — blockers: no.**

Re-verified by running: `agents` 14, `extension` 9, `prompt` 5, `state` 7 = 35, and
`npm test` prints `Tests  35 passed (35)`, so `Tests  53 passed (53)` is the right string.
The stages multiply out (16 + 9 + 16 + 5 + 7 = 53, i.e. 18 new), the case map is closed in
both directions, review blocks are chronological, criteria run 1–12, and every amendment
target exists.

Follow-ups, applied: the step-7 proof now greps the old claim instead of `model.*thinking`,
which would match the rewritten `src/agents.ts` row; criterion 2 notes the root caveat
(`52 passed | 1 skipped`); stage 2 counts the nine table cases rather than eight.

Gate: open.

## Log

| Decision | Source | Date |
|---|---|---|
| `Main` is the session's starting state and restores the snapshot | operator | 2026-11-12 |
| Resume re-applies the agent's model; a failure leaves the current model | operator | 2026-11-12 |
| Model and thinking fall back independently (simpler: two fields, two fallbacks) | operator asked which is simpler; orchestrator chose independent | 2026-11-12 |
| A failure is reported with `ctx.ui.notify` as a warning | operator | 2026-11-12 |
| Changing the model mid-conversation can force a compaction — accepted, same as switching by hand | operator | 2026-11-12 |
| A press while a response streams is rejected with a warning instead of switching mid-run | operator | 2026-11-12 |
| The 35 existing cases are confirmed by counting `it(` (agents 14, extension 9, prompt 5, state 7); a dev-plan doubt about the number was unfounded | orchestrator | 2026-11-12 |
