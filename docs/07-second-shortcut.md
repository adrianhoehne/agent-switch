---
description: Registers a second shortcut on f2, so the cycle works without releasing shift+tab from pi's thinking cycle, and amends the earlier specs that documented a single key.
status: active
---

# 07 — A second shortcut so the thinking key stays free

Implemented on 2026-11-15, after the release. Small in code, but it reverses a decision
`docs/03` recorded deliberately, and that reversal is dated in both places: here in
`## Log`, and in `docs/03` itself.

All ten criteria are verified. Criterion 10 passed on 2026-11-15: with the keybinding
file moved aside, `f2` changed the footer from `Main` to an agent name, and pi reported
the expected `shift+tab` conflict in its `[Extension issues]` block.

## Goal

`f2` cycles the main agent's system prompt in any session, with no configuration at all.
`shift+tab` keeps working exactly as it does today — including the one-time keybinding
release — for anyone who prefers it. The two keys run the same code: one press, one step,
whichever key sent it.

## Decisions behind the change

| Point | Decision | Why |
|---|---|---|
| The second key | `f2` | operator, 2026-11-15. No pi default binding uses a function key, and where a terminal sends one it arrives as a fixed escape sequence (`\x1bOQ` and two variants, per `pi-tui`), so the `ctrl+shift+a` unreliability from `docs/03` does not apply. Whether a given terminal delivers F-keys at all is the risk below, not a premise of this decision |
| The first key | `shift+tab` stays, unchanged, including the `<agent-dir>/keybindings.json` release | nothing to gain from removing a key the operator chose, and the keyboard habit is already there |
| Two keys for one action | **allowed now.** `docs/03` rejected exactly this; the rejection is withdrawn on 2026-11-15 | `docs/03`'s reason was "shows up twice in `/hotkeys` and doubles the conflict surface". The counter-argument did not exist then: a user who does not want to give `shift+tab` away had no way to use the extension at all |
| Handler | one function, registered twice | two copies drift; a fix in one would silently skip the other |
| Description | the same text on both keys | it is one action; `/hotkeys` will show two lines with the same label, which is what it is |
| Configurable key | still out of scope, still the roadmap item | this spec fixes the default pair; letting the user choose is a separate decision with its own questions |

## Non-goals

- **No** configurable key, no `--switch-key` flag, no settings field. `docs/ROADMAP.md` §3
  keeps that as `question`.
- **No** change to what a press does: cycle order, session entry, footer, the idle guard
  and the `Main` snapshot behave as `docs/01`–`docs/04` describe.
- **No** removal or demotion of `shift+tab`, and no change to the keybinding prerequisite.
- **No** `/agent <name>` command and no picker.
- **No** new footer, no second status segment, no notification that names the key.

## Files and interfaces

| File | Change |
|---|---|
| `src/extension.ts` | `SHORTCUT_KEY` becomes a pair — `"shift+tab"` and `"f2"` — the handler is hoisted into one named function, and `pi.registerShortcut` is called once per key. The comment block that explains the key and says "there is deliberately no fallback key" is rewritten |
| `test/extension.test.ts` | `pressShortcut` takes the key as its third argument instead of reading `shortcuts[0]`, so the 19 press calls in the twelve existing press cases name `"shift+tab"` explicitly — their givens and assertions stay byte-identical. One exception: the `THEN exactly one shortcut exists` comment in `shortcut is registered` becomes “two”, because it would otherwise be a lie. `shortcut is registered` asserts both keys and one shared description; two cases are added. 16 cases become 18 |
| `README.md` | the intro names both keys; the `## Use` table gains an `f2` row; the prerequisite section scopes the file to `shift+tab`; the two lines that would otherwise go stale — `## Known limits` (`:156`, "one key, one direction") and `## Development` (`:166`, "58 cases") — are updated |
| `docs/01-switch-main-agent-prompt.md` | amended in place: description, intro, trigger row, non-goal, criterion 9, testing row, risk paragraph and the dev-plan paragraph — the exact list is in `## Amendments to previous spec docs

Carried out by the stage that implements the behaviour, not afterwards.

**`docs/01-switch-main-agent-prompt.md`** — it describes the feature, so it has to name
both keys:

- frontmatter `description`: "on shift+tab" becomes "on shift+tab or f2".
- the intro (`:14`) and the trigger row (`:24`): both keys.
- `## Non-goals` (`:37`): "One shortcut, one direction" becomes "No picker, no slash
  command; two keys, one direction".
- acceptance criterion 9 (`:132`) and the `## Testing` row (`:168`): the assertion now
  covers both keys.
- `## Risks` (`:199`–`:204`): the sentence "Without that file the extension has no
  shortcut" is false after this increment and gets replaced.
- `## Dev plan` (`:387`–`:391`): "On a machine without that file pi drops the registration
  and says so in the `[Extension issues]` block" is re-scoped to `shift+tab`. The
  `## Dev plan` is history, but it is the paragraph an implementer copies, so it is
  amended rather than left to mislead. `docs/03:52`'s "`Tests  35 passed (35)`" is a
  different case: it was already false before this increment (the suite prints 58 today),
  so it is left alone — this spec does not own that debt.
- `docs/README.md:61`, the registry row for `01`: it says the increment cycles "on
  `shift+tab`", which stops matching the amended description. It is updated in the same
  pass as the new `07` row.

**`docs/03-shift-tab-shortcut.md`** — it owns the decision this spec reverses:

- `## Non-goals` (`:26`–`:27`, "**No** second shortcut. One key, one action; `ctrl+shift+a`
  is not kept as a fallback."): the text stays as the record of what was true then and
  gains one sentence — withdrawn on 2026-11-15 by `docs/07`, which adds `f2` as a second
  key.
- the "Still out of scope" bullet (`:193`, "a configurable shortcut, a second key"): the
  second key leaves that list; the configurable shortcut stays.
- the rejected alternative ("keeping both keys", `## Risks and alternatives`): marked
  withdrawn, with the counter-argument recorded — a user who does not want to release
  `shift+tab` had no way in.
- `## Risks and alternatives` (`:75`–`:78`, "Without the keybindings release the shortcut
  disappears … has to exist on every machine"): re-scoped to `shift+tab`.
- the "No configurable shortcut" bullet (`:30`–`:31`, "`shift+tab` is the answer for this
  project"): it is about configurability, not about the key set, so the bullet stays — with
  one clause saying the answer is now the pair `shift+tab` and `f2`, while the
  configurability question stays open in `docs/ROADMAP.md` §3.
- `## Known gaps`-adjacent bullet (`:188`–`:190`, "**No fallback.** `ctrl+shift+a` is
  gone; a machine without `~/.pi/agent/keybindings.json` has no working shortcut at
  all."): false after this increment, replaced by the `f2` fallback.
- `## Files and interfaces` (`:42`), `## Testing` (`:64`, `:65`, `:67`) and `## Dev plan`
  (`:130`) are not history: they state what the tests must cover. `:42` and `:64` re-scope
  the registered key to both, `:65`'s "the other 34 cases *(unchanged)*" becomes the
  count-free "the remaining cases *(unchanged)*" — 34 stopped being true with the second
  key and would stop again with the next case — `:67`'s "No new case: the key is a
  constant, and asserting it twice adds nothing" is replaced by the two cases this
  increment adds, and `:130`'s "the helper `pressShortcut` reads `stub.shortcuts[0]`"
  describes the new signature.
- the `## Log` row (`:279`, "no second key, no slash command") stays as written: it is a
  dated record of what was decided then, like `:191`.
- the `## Known gaps` row (`:201`, "the extension has no shortcut at all"): re-scoped to
  `shift+tab`. The `app.thinking.cycle` row next to it and the "Thinking lost its key
  globally" risk (`:191`) stay untouched — both are still true.

**`README.md`** is not a spec but states the same thing in user-facing words; it is
amended in the same stage.

One rule for the two specs, so the next reader does not have to infer it: `## Dev plan`
prose is history and stays, **except** where it is the paragraph an implementer copies —
`docs/01:387`–`:391` is that paragraph, which is why it is amended and `docs/01:340` is
not.

## Acceptance criteria

| # | Criterion | Command / evidence |
|---|---|---|
| 1 | Type check passes | `npm run typecheck` exits 0 |
| 2 | The suite passes with 60 cases, and no existing case is renamed | `npm test` exits 0 with `Tests  60 passed (60)` — under `root` it reads `59 passed \| 1 skipped`, which is not a failure; `git diff -U0 -- test/ \| grep -E "^[-+]\s*it\("` shows exactly the two added `it(` lines and no removed or renamed one |
| 3 | Both keys are registered, with the same description | case `shortcut is registered` asserts `["shift+tab", "f2"]` and one non-empty description |
| 4 | Both keys reach the same handler | case `both keys share one handler` asserts strict equality of the two handler references |
| 5 | A press on `f2` does what a press on `shift+tab` does | case `f2 press cycles the agent` asserts the session entry, the footer label and the applied agent, exactly as the `shift+tab` cases do |
| 6 | No press case depends on registration order | `grep -n "shortcuts\[0\]" test/extension.test.ts` prints nothing; `pressShortcut` takes the key as its third argument |
| 7 | The code carries no second copy of the handler | `grep -cE "^[[:space:]]*pi\.registerShortcut\(" src/extension.ts` prints 2 — two explicit statements, not a loop over the pair, because the criterion counts lines. The pattern is anchored so a comment that mentions `registerShortcut` cannot inflate it |
| 8 | The old "no fallback" claim is gone | `grep -c "deliberately no fallback key" src/extension.ts` prints 0, and `git grep -n "One shortcut, one direction" -- docs/01-switch-main-agent-prompt.md` prints nothing. Scoped on purpose: this spec quotes both phrases itself, and an unscoped grep would match its own text |
| 9 | The README names both keys, scopes the prerequisite, and drops every claim that goes false | `grep -n "f2" README.md` finds it in the intro, the `## Use` table and the prerequisite section (three sections, at least three lines); `grep -n "needed for" README.md` finds the scoped sentence; `grep -n "one key, one direction" README.md`, `grep -n "58 cases" README.md`, `grep -n "Without it the extension has no" README.md` and `grep -n "it simply has no key" README.md` print nothing; `grep -c "60 cases" README.md` prints 1. The two `Without it …` fragments stop before the line wrap at `README.md:17`–`:18` on purpose — the whole sentence cannot be matched by a line-based grep |
| 10 | Live: `f2` cycles with no keybinding configuration at all | operator: with `~/.pi/agent/keybindings.json` moved aside, start `pi`, press `f2`, the footer changes from `Main` to an agent name |

Criteria 1–9 gate the commit; criterion 10 is the operator's. The README lines that would
go stale or false — `## Requirements` ("has no shortcut"), `## Known limits` ("one key, one
direction"), `## Development` ("58 cases") and the prerequisite paragraph ("it simply has
no key") — are all decided by criterion 9, not left to prose.

## Testing

| File | Case | What it proves |
|---|---|---|
| `test/extension.test.ts` | `shortcut is registered` (changed) | exactly two keys, `shift+tab` and `f2`, each with the same non-empty description |
| | `both keys share one handler` (new) | the two registrations reference the same function, so a later change cannot fix one key and break the other |
| | `f2 press cycles the agent` (new) | pressing `f2` advances the cycle: one session entry, the footer label, the agent applied. It is `cycle applies the agent's model and level` with the key changed, so it is not independent coverage — it proves the routing of the second key and nothing else |
| | every existing press case (changed helper) | `pressShortcut(stub, ctx, "shift+tab")` names its key, so none of them depends on the order the extension registers its shortcuts |
| `test/package.test.ts`, `test/agents.test.ts`, `test/apply.test.ts`, `test/prompt.test.ts`, `test/state.test.ts` | all existing cases | unchanged: this increment touches the wiring, not the decision half, the parser or the cycle arithmetic |

58 existing cases + 2 new = 60. Zero tests are deleted; the only edited assertions are in
`shortcut is registered` and inside the `pressShortcut` helper.

## Risks and alternatives

- **`f2` can be bound by something outside pi.** Some terminals use F-keys for their own
  menus, and a multiplexer can swallow them. We cannot detect that; the press simply does
  nothing, `shift+tab` remains, and the README says so. This is the same class of risk as
  `shift+tab` in a terminal that does not report it. The pi facts in the dev plan were
  verified against the installed 1.5.2, which is also what the README names; criterion 10
  is the only evidence a terminal delivers the key.
- **`/hotkeys` shows the same description twice.** Two keys, one action — that is the
  honest rendering. A distinct label ("… without setup") would pretend they are two
  features; refused.
- **A future pi release could bind `f2`.** Then the extension's `f2` is skipped with one
  line in the `[Extension issues]` block, and `shift+tab` keeps working. Nothing crashes;
  the user sees a warning they did not ask for, which is the price of a hard-coded key.
- **The docs surface is larger than the code.** Dozens of places across `docs/01`,
  `docs/03` and the README describe "the shortcut"; that is why the amendments are a named
  stage instead of an afterthought, and why the exact list lives in `## Amendments`
  instead of being counted here.
- **Reversing `docs/03` silently would be worse than reversing it.** The withdrawal is
  dated and carries the argument that was missing; the old text stays visible as history.
- **Rejected alternative: make `f2` the only key.** It would need no keybinding file at
  all, but it breaks the habit the operator has today and would force editing this README
  and every spec that names `shift+tab` — more work for less.
- **`docs/ROADMAP.md` still says "instead of the hard-coded `shift+tab`".** After this
  increment two keys are hard-coded; the sentence is close enough to stay, and the roadmap
  is not a spec. Its wording catches up when the configurable key lands.
- **Rejected alternative: register the second key only when the first is unavailable.**
  The extension cannot see pi's conflict resolution, so it would have to guess; and a
  silent single-key mode is harder to document than two keys.

## Touch boundary

| File | Owner |
|---|---|
| `src/extension.ts`, `test/extension.test.ts`, `README.md` | implementer |
| `docs/01-switch-main-agent-prompt.md`, `docs/03-shift-tab-shortcut.md`, `docs/07-second-shortcut.md`, `docs/README.md` | orchestrator |

- **Not** `src/agents.ts`, `src/apply.ts`, `src/prompt.ts`, `src/state.ts`: the cycle,
  the parser and the decision half do not change.
- **Not** `package.json`, `.github/`, `LICENSE`, `keybindings.json`: no new dependency, no
  version bump in this increment.
- **Not** anything under `~/.pi/agent/**` or `~/.agents/**`. Criterion 10 moves the
  keybinding file aside; the operator does that, not an agent.
- **Not** generated folders: `node_modules/`, `coverage/`, `*.tgz`.

## Additional dependencies

None. `f2` is a literal key id like `shift+tab`; `Key` still lives in
`@earendil-works/pi-tui` and is still not imported.

## Dependency changes

None.

## Open questions

None. The key, the build form (a second fixed key rather than a configurable one) and the
withdrawal of the two-key rejection were decided by the operator on 2026-11-15 and are
recorded in `## Log`.

## Dev plan

1. **The wiring: one handler, two keys** — `src/extension.ts` and `test/extension.test.ts`, one stage, because the registration change and its proof cannot be split without leaving the suite red. Owner: `ranger-1`.

   `src/extension.ts`, module level: replace `const SHORTCUT_KEY = "shift+tab"` with a pair and a destructured alias, so both call sites stay self-describing:
   ```ts
   const SHORTCUT_KEYS = ["shift+tab", "f2"] as const;
   const [SHORTCUT_KEY, SECOND_SHORTCUT_KEY] = SHORTCUT_KEYS;
   ```
   Lowercase only: `KeyId` is `BaseKey | ModifiedKeyId<BaseKey>` and `SpecialKey` carries `"f2"`, never `"F2"` (`pi-tui/dist/keys.d.ts:32`). `pi.registerShortcut(shortcut: KeyId, …)` (`pi-coding-agent/dist/core/extensions/types.d.ts:1275`) therefore accepts the literal. Four things were read from the installed 1.5.2, not remembered: the loader stores the string verbatim (`extension.shortcuts.set(shortcut, …)`, `dist/core/extensions/loader.js:264`); `getShortcuts` lowercases it and only *skips* a key listed in `RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS` (`dist/core/extensions/runner.js:9–29`, skip at `:464`), which names no F-key, and no default keybinding uses `f1`–`f12`; dispatch is `matchesKey(data, shortcutStr)` in `onExtensionShortcut` (`dist/modes/interactive/interactive-mode.js:1875`), and `pi-tui` maps three sequences — `\x1bOQ`, `\x1b[12~`, `\x1b[[B` — to `f2` (`dist/keys.js:275`, reverse map `:348–356`), so the key arrives as a fixed id and needs no keybinding file. No `f2` diagnostic is expected in `[Extension issues]`.

   Rewrite the doc comment above the pair: both keys are literal key ids; `shift+tab` is owned by `app.thinking.cycle` and still needs the `<agent-dir>/keybindings.json` release; `f2` is bound by no pi default and needs none. Delete the sentence claiming there is deliberately no fallback key. Keep the `Key`-not-imported paragraph and widen it to "both keys".

   Inside `agentSwitch`, hoist the inline `handler:` of `pi.registerShortcut` into one named declaration above the registrations — `async function cycleAgent(ctx: ExtensionContext): Promise<void>`, body moved unchanged (empty-cycle guard, `isIdle` guard, `previousLabel`, snapshot capture, `appendEntry`, `setLabel`, `restoreMain`/`applySelection`) with its comments. Then two explicit registration statements, same description, same function reference:
   ```ts
   pi.registerShortcut(SHORTCUT_KEY, { description: SHORTCUT_DESCRIPTION, handler: cycleAgent });
   pi.registerShortcut(SECOND_SHORTCUT_KEY, { description: SHORTCUT_DESCRIPTION, handler: cycleAgent });
   ```
   Two lines on purpose — criterion 7 counts matching *lines*, so a `for…of` loop would print `1`. Add a comment saying why there is one function: two copies drift.

   `test/extension.test.ts`:
   - `pressShortcut` becomes `function pressShortcut(stub: StubApi, context: StubContext, key: string): Promise<void>`, resolving with `stub.shortcuts.find((registered) => registered.key === key)` and throwing `The extension registered no "${key}" shortcut.` when absent. No default value: a default would let the old call sites stay and would quietly reintroduce the positional assumption.
   - The 19 press calls in twelve existing cases gain `, "shift+tab"` as the third argument, nothing else: `press before session_start is a no-op` (1), `second session_start does not duplicate the cycle` (3), `before_agent_start applies the current agent` (1), `footer shows the current name` (1), `selection is persisted` (1), `cycle applies the agent's model and level` (1), `Main restores the snapshot` (2), `agents do not re-snapshot` (3), `press while streaming changes nothing` (1), `Main restore that throws warns instead of crashing` (2), `snapshot without a model still restores the level` (2), `resume applies the selection again` (1). Givens, comments and assertions stay byte-identical. The four cases that never press — `shortcut is registered`, `skipped file surfaces a warning`, `restore last selection`, `missing agent falls back to Main` — are untouched apart from the one below.
   - `shortcut is registered` (the only changed assertions): `expect(stub.shortcuts).toHaveLength(1)` becomes `toHaveLength(2)` (or is dropped — `toEqual` on the mapped keys already pins the pair), then `expect(stub.shortcuts.map((shortcut) => shortcut.key)).toEqual(["shift+tab", "f2"])`, then destructure `[primary, secondary]` and assert `primary.description` is a non-empty string and `secondary.description` is `toBe(primary.description)`. Using `map` + destructuring leaves zero `shortcuts[0]` occurrences.
   - New case `both keys share one handler`: stub, `agentSwitch`, `const [primary, secondary] = stub.shortcuts`, `expect(primary.handler).toBe(secondary.handler)`. It asserts a fact no other case can — reference identity, not the key list — so it fails if a second arrow wrapper is introduced per registration.
   - New case `f2 press cycles the agent`: write `architect` with `model: "anthropic/claude-sonnet-4"`, `thinking: "high"`, start the session, `await pressShortcut(stub, session, "f2")`, then assert `stub.entries` equals one `{ customType: STATE_CUSTOM_TYPE, data: { name: "architect" } }`, `session.statuses.at(-1)` equals `{ key: "agent", text: "architect" }`, and `stub.calls` equals `["setModel anthropic/claude-sonnet-4", "setThinkingLevel high"]`. It repeats facts the `shift+tab` cases already assert, deliberately: the new information is which key id reaches the same effect, and a different input with the same expectation is not a duplicate. Do not loop both keys inside one case — that hides a per-key failure behind one assertion and leaves the case count at 59.
   Proof:
   ```bash
   npm run typecheck                                 # exits 0
   npx vitest run test/extension.test.ts              # "Tests  18 passed (18)"
   npm test                                           # "Tests  60 passed (60)"
   grep -cE "^[[:space:]]*pi\.registerShortcut\(" src/extension.ts   # 2
   grep -n "shortcuts\[0\]" test/extension.test.ts    # no output
   ```
   Under root the summary reads `59 passed | 1 skipped`, because `unreadable directory counts as empty` is an `it.skipIf`.

2. **The README** — `README.md`. Owner: `ranger-1`. Five edits, all user-facing prose: the intro (`:4`) names both keys; the Requirements bullet (`:17`–`:18`) stops claiming the extension has no shortcut without the file and scopes the configuration to `shift+tab`; the prerequisite section (`:49`–`:79`) says the file is needed for `shift+tab` only and that a missing file leaves `f2` working while pi reports the `shift+tab` conflict; the `## Use` table (`:85`) gains an `f2` row with the same effect text, marked as needing no configuration; the "If the file is missing" paragraph no longer ends with "it simply has no key". Two further lines are consequences, not new requirements, and become false if left: `## Known limits` (`:156`) still says "one key, one direction" and `## Development` (`:166`) still says "vitest, 58 cases" — both are updated in this stage, otherwise the README documents a state that no longer exists.
   Proof:
   ```bash
   grep -c "f2" README.md                                 # at least 3 (expected 5 lines)
   grep -n "58 cases" README.md                           # no output
   grep -n "one key, one direction" README.md             # no output
   grep -n "needed for" README.md                         # the scoped prerequisite sentence
   ```

3. **`docs/01` amendment** — `docs/01-switch-main-agent-prompt.md`. Owner: orchestrator (the spec file is not implementer territory). Lands immediately after stage 1–2 in the same uncommitted tree: a spec must not describe behaviour that does not exist yet, so the code goes first, the docs follow, and both enter the one commit. Every place the `## Amendments to previous spec docs` section lists for `docs/01`, and nothing beyond it: the frontmatter `description`, the intro (`:14`), the trigger row (`:24`), the `## Non-goals` bullet (`:37`), acceptance criterion 9 (`:132`), the `## Testing` row for `shortcut is registered` (`:168`), and the shortcut-conflict paragraph in `## Risks and alternatives` (`:199`–`:203`), which keeps the truthful half (a reserved built-in is still refused) and drops "Without that file the extension has no shortcut". Status stays `active`.
   Proof:
   ```bash
   git grep -n "on shift+tab or f2" -- docs/01-switch-main-agent-prompt.md   # the frontmatter description
   git grep -n "One shortcut, one direction" -- docs/01-switch-main-agent-prompt.md  # nothing, exit 1
   git grep -n "Without that file the extension has no" -- docs/01-switch-main-agent-prompt.md  # nothing, it was replaced
   ```
   The description is spelled `on shift+tab or f2`, without backticks, because the frontmatter is plain text; the registry row is spelled with backticks. Those are the two literals, and stage 6 greps the registry row a different way for exactly that reason.

4. **`docs/03` amendment** — `docs/03-shift-tab-shortcut.md`. Owner: orchestrator. Carry out **every bullet** of `## Amendments to previous spec docs` for `docs/03` — do not work from a summary here, there are more than a handful and one of them (`## Testing`) is the section that says what the tests must cover, so a half-done stage leaves a spec that contradicts the code. The one exception is named in the amendments: the `## Log` row at `:279` stays as a dated record.
   Proof, one grep per place — no counts, because a floor below the list grades on a curve. Every fragment stops before a line wrap in `docs/03`; that is why they are short:
   ```bash
   git grep -n "second shortcut" -- docs/03-shift-tab-shortcut.md                # the bullet (it reads `**No** second shortcut`), now carrying the withdrawal sentence
   git grep -n "2026-11-15" -- docs/03-shift-tab-shortcut.md                     # the dated withdrawal
   git grep -n "no working shortcut at all" -- docs/03-shift-tab-shortcut.md     # nothing, the "No fallback" claim is gone
   git grep -n "the extension has no shortcut at all" -- docs/03-shift-tab-shortcut.md  # nothing, the Known-gaps row is re-scoped
   git grep -n "a configurable shortcut, a second" -- docs/03-shift-tab-shortcut.md     # nothing, the second key left that list
   git grep -n "has to exist on every machine" -- docs/03-shift-tab-shortcut.md  # one line, now scoped to shift+tab
   git grep -n "registered keys are exactly" -- docs/03-shift-tab-shortcut.md    # re-scoped to both keys
   git grep -n "No new case: the key is a constant" -- docs/03-shift-tab-shortcut.md    # nothing, replaced by the two new cases
   git grep -n "reads \`stub.shortcuts\[0\]\`" -- docs/03-shift-tab-shortcut.md   # nothing, the signature changed
   git grep -n "34 cases" -- docs/03-shift-tab-shortcut.md                       # nothing, the count-free wording replaced it
   git grep -n "keeping both keys" -- docs/03-shift-tab-shortcut.md               # only the withdrawal sentence
   ```

5. **Code review — gate** — `grizzled-senior-dev`, read-only. Reviews `git diff` plus the untracked `docs/07-second-shortcut.md` now that stages 1–4 are in the tree, so one verdict covers code, tests, README and amendments. Only `✅ Ship it` opens stage 7; `🔧` goes back to the same implementer with this spec. Reject a helper default of `"shift+tab"` (contradicts `## Testing`'s "names its key"), a per-registration arrow wrapper (breaks criterion 4), and any changed assertion outside `shortcut is registered`.

6. **Finalise the spec and the registry** — `docs/07-second-shortcut.md` and `docs/README.md`. Owner: orchestrator, after the verdict. Set `status: active`, rewrite the prose to the descriptive form, remove `## Amendments to previous spec docs`, and record the review rounds and the per-finding decisions in `## Review` and `## Log`. Add the registry row `| \`07-second-shortcut.md\` | … | active |`, and update the `01` row, whose text names `shift+tab` alone and stops matching the amended description.
   Proof:
   ```bash
   grep -n "^status:" docs/07-second-shortcut.md                # "status: active"
   grep -c "## Amendments to previous spec docs" docs/07-second-shortcut.md   # 0
   grep -n "07-second-shortcut" docs/README.md                  # the new row, column reads active
   grep -n "01-switch-main-agent-prompt" docs/README.md | grep -c "f2"   # 1: the amended 01 row names f2
   ```

7. **Acceptance and the single commit** — orchestrator. Read the diff itself, run the acceptance commands, walk criteria 1–9 one by one, re-run the proofs of stages 3, 4 and 6 (they decide the doc amendments and the registry rows, which no criterion covers), then one commit. Expect seven files: `src/extension.ts`, `test/extension.test.ts`, `README.md`, `docs/01…`, `docs/03…`, `docs/07…`, `docs/README.md`.
   Proof:
   ```bash
   npm run typecheck && npm test        # exits 0; "Tests  60 passed (60)"
   git status --short                   # empty after the commit
   git show --stat HEAD                 # the seven files
   ```

8. **Criterion 10 — the live check, operator only.** With `~/.pi/agent/keybindings.json` moved aside, `pi --extension ./src/extension.ts`, press `f2`, watch the footer go `Main` → an agent name. It needs a real terminal, a real session and real credentials; `AGENTS.md` keeps that out of agent hands, and it is not a commit gate. A test cannot show that a terminal delivers `\x1bOQ` for `f2`; only this does.

### What could go wrong

- **Hoisting can silently produce two handlers.** `handler: (ctx) => cycleAgent(ctx)` written twice — or an arrow re-created per registration — compiles, passes every other case, and makes criterion 4 vacuous for the reason it exists. The handler must be the bare function reference at both call sites.
- **`shortcuts[0]` is invisible until it matters.** With `shift+tab` registered first, the old helper still returns the right shortcut, so a half-done change stays green and only criterion 6 catches it. `find` by key, and the error message must name the key so a missing registration fails legibly.
- **Two registrations in one extension are two Map entries**, keyed by the exact string (`loader.js:264`). Registering the same key twice would overwrite instead of adding; the pair must stay distinct, and both lowercase.
- **`f2` is a fixed id, not a guarantee.** Some terminals use F-keys for their own menus and a multiplexer can swallow them; the press then does nothing and nothing crashes — the same class as a terminal that does not report `shift+tab`, and the README says so. A future pi binding `f2` would be *skipped* with one `[Extension issues]` line, not taken away from the built-in.
- **Criterion 7 is only checkable for one code shape.** `grep -c` counts lines: two explicit registration statements give `2`, a `for…of` over the pair gives `1`. As written the criterion pins the shape; if the reviewer prefers the loop, the criterion needs the orchestrator's pen. The plan takes the two-line form.
- **Criterion 8 depends on file-tracking and on the prose pass.** `git grep` skips untracked files, so before the commit only `src/extension.ts` matches the phrase; after the commit this spec's own `## Files and interfaces` row would quote it again. The criterion is therefore scoped to `src/extension.ts` and `docs/01`, which is where the claims lived.
- **The README's two stale lines** ("58 cases", "one key, one direction") are in the spec's file table and fixed in stage 2, because a README that names a count that no longer exists is worse than one that never mentioned it.
- **The amendments must not overtake the code.** Amending `docs/01` before stage 1 would make a tracked spec claim a behaviour that does not exist, which `docs/README.md` forbids. Code, then tests, then README, then the two amendments, then review.

### Ordering and dependencies

Strictly 1 → 2 → 3 → 4 → 5 → 6 → 7, and 8 after 7. No stage needs a later one. Stage 1 leaves `npm test` green at 60; stages 2–4 touch no code and cannot break it; stages 6 and 7 touch only `docs/`. One writer per working tree throughout: `ranger-1` finishes stage 2 before the orchestrator opens `docs/01`, and the reviewer at stage 5 is read-only and does not overlap a writer. Stage 5's verdict is a prerequisite of 7, and stage 6 deliberately follows the review because `AGENTS.md` step 7 owns the `active` flip and the prose pass; the diff it leaves is docs-only, and stage 7 re-reads it.

### What the next increment inherits

- **A configurable key stays unbuilt** — `docs/ROADMAP.md` §3 keeps it as `question`; this increment fixes the default pair only.
- **No third entry point.** No `/agent`, no picker; unchanged.
- **The prerequisite is now asymmetric**: `<agent-dir>/keybindings.json` is required for `shift+tab` and for nothing else. That asymmetry is the deliverable, not a gap to close.
- **`/hotkeys` shows the same description twice.** Accepted as the honest rendering of one action; a differing label needs its own decision.
- **`f2` is hard-coded and not conflict-checked by us.** The only visibility for a future collision is pi's `[Extension issues]` block.
- **Everything `docs/04` deferred is untouched**: the snapshot stays in memory, bare model ids stay first-match-wins, `thinking` stays unvalidated against the model.

## Review

**2026-11-15 — spec review, round 1 — 🔧 Fix these and I'll sign off — blockers: yes (4).**

Blocking:

1. **M1** — the files table and stage 2 promised two README lines (`:156` "one key, one
   direction", `:166` "58 cases"), but criterion 8 grepped "One shortcut, one direction" —
   a different phrase — so its README half was vacuous: it printed nothing before the
   change and would print nothing after. Criterion 9 decides both stale lines now, with
   `grep -n` for the old text and `grep -c "60 cases"` for the new.
2. **M2** — criterion 2 cited "the 58 names from `docs/05`", a list that exists nowhere;
   `docs/05` carries a count. It now decides "no case renamed" by diff (`git diff -U0 --
   test/ | grep -E "^[-+]\s*it\("`) and carries the non-root caveat.
3. **M3** — stage 3 said "Six places" and enumerated seven, and its proof comment dropped
   the risks paragraph. Both corrected.
4. **M4** — two `docs/03` claims go false and were unamended: the "No fallback" bullet at
   `:188`–`:190` and the risk at `:75`–`:78`. Both are in the amendments section now, the
   `## Log` row at `:279` is explicitly kept as a dated record, and the `01` registry row is
   updated in stage 6 rather than left describing the old key set.

Non-blocking, applied: criterion 7's grep was anchored to registration lines so a comment
mentioning `registerShortcut` cannot inflate it; criterion 6 tightened to "prints nothing";
criterion 9's second half gained a command; the `THEN exactly one shortcut exists` comment
is named as the one allowed comment change; the pi facts are flagged as verified on 1.3.0
with 1.5.2 covered by criterion 10 alone; two `pi-tui`/`runner.js` line references were off
by one; the "five places…" count was replaced by the measured 7/6/7; the `f2` case is
described as a rerun of an existing case rather than independent coverage; and stage 3's
unscoped `git grep` is scoped to `docs/01`.

Verified against the machine in this round: `SpecialKey` carries `"f2"`, the loader stores
shortcuts verbatim, `RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS` names no F-key, no
default binding uses `f1`–`f12`, and `pi-tui` maps three sequences to `f2`. Also: 16 cases
in `test/extension.test.ts`, 58 in total, 19 `pressShortcut` call sites in the twelve cases
named.

Round 1 outcome: all four blockers and every note applied.

**2026-11-15 — spec review, round 2 — 🔧 Fix these and I'll sign off — blockers: yes (6).**

Blocking:

1. **R2-M1** — criterion 9 existed twice and the gate sentence twice; the second copy was
   the round-1 draft. Deleted.
2. **R2-M2** — the README sentences stage 2 promised to fix ("has no shortcut", "it simply
   has no key") had no decider. Criterion 9 greps them now.
3. **R2-M3** — the `docs/03` amendments named places stage 4's enumeration did not carry
   out, and its proof could pass on a half-done stage. Stage 4 now says "every bullet" and
   its proof greps the specific claim.
4. **R2-M4** — five more `docs/03` claims go false (`## Testing` at `:42`, `:64`, `:65`,
   `:67`, `## Files and interfaces` at `:130`). All named in the amendments now; `## Testing`
   is not history, it is what the tests must cover.
5. **R2-M5** — the pi facts were labelled "verified against the installed 1.3.0", but the
   installed tree is 1.5.2 (`node -p`), and four line numbers did not match it. Re-read from
   1.5.2: `types.d.ts:1275`, `loader.js:264`, `interactive-mode.js:1875`, `keys.js:275` and
   `:348–356`, `runner.js:9–29` with the skip at `:464`.
6. **R2-M6** — stage 1 still taught that criterion 6 allows two `shortcuts[0]` reads. Gone.

Non-blocking, applied: the file table no longer counts places, it points at the amendments;
stage 3 says "every place the amendments list" instead of a number; the prerequisite range
became `:49`–`:79`; stage 1's proof uses the anchored grep; `docs/01`'s dev-plan paragraph
is amended rather than left to mislead; the dangling "findings below" is gone; criterion 8's
scope matches the sentence about it; stage 7 re-runs the doc-stage proofs, which decide
things no criterion covers.

Round 2 outcome: all six blockers and every note applied.

**2026-11-15 — spec review, round 3 — 🔧 Fix these and I'll sign off — blockers: yes (3).**

Blocking, all of the same family — a proof that passes on a half-done stage:

1. **M1** — stage 4's proof expected `34 cases` to be gone or re-scoped to `54`, while the
   amendments said that row keeps its meaning. The two disagreed, `54` came from nowhere
   (`docs/05`'s proof, written when the suite really was 54), and a correct stage could not
   pass. The row becomes count-free and the proof greps the old string.
2. **M2** — stage 3's "at least 6 lines" sat below its own list of eight, and two of the
   eight need not contain `f2` at all; stage 4 had no decider for three amendments it
   carries (`:201`, `:193`, the rejection withdrawal). Both are now one grep per claim.
3. **M3** — `expect(stub.shortcuts).toHaveLength(1)` inside `shortcut is registered` was not
   named among the changed assertions, although stage 1's proof cannot go green without
   that edit. Named, with both acceptable forms.

Non-blocking, applied: the section labels in the amendments were swapped (`:42` is the
files table, `:130` the dev plan); the Log lumped round 2's eight minors into one row;
`## Decisions` overclaimed that F-keys "arrive in every terminal" while `## Risks`
retracts it; the rules for which dev-plan prose is history needed one written clause;
the `docs/01` risk range stopped a line early (`:200`–`:204`); and `docs/ROADMAP.md`'s
"instead of the hard-coded `shift+tab`" is noted as wording that catches up later.

Round 3 is the third block, so `AGENTS.md` step 4 applies. Splitting does not help: the
spec is one wiring change and every finding lives inside a stage that already exists. The
step-4 fallback — orchestrator and operator decide together — is recorded in `## Log`.

**2026-11-15 — spec review, round 4 — 🔧 Fix these and I'll sign off — blockers: yes (4).**

Blocking, and the fault was the orchestrator's: four greps could never match, because the
sentences they looked for wrap across a line break in the documents.

1. **B1** — stage 4 grepped `"a configurable shortcut, a second key"`, which is split at
   `docs/03:193`/`:194`; it printed nothing before the change and would print nothing
   after. Now `"a configurable shortcut, a second"`.
2. **B2** — stage 4 decided three of the nine places its own amendments name, so a
   half-done amendment stage went green. One grep per place now: eleven commands, each
   stopping before a line wrap.
3. **B3** — criterion 9 grepped `"has no shortcut"`, which is split at `README.md:17`/`:18`
   — the false Requirements claim could survive a green criterion. Now `"Without it the
   extension has no"`, which lies on one line.
4. **B4** — stage 3 expected `or \`f2\`` in `docs/01`'s frontmatter while the description is
   plain text (no backticks), and stage 6 expected the unbackticked `shift+tab or f2` in a
   registry row where keys are backticked: one of the two had to fail. The exact literals
   are written down per file now, and stage 6 greps the `01` row for `f2` instead.

Non-blocking, applied: the `:75`–`:78` risk amendment had been lost in a previous edit and
is restored; the `:30`–`:31` "No configurable shortcut" bullet gains a clause; the `:52`
`35 passed` count is named as a debt this spec does not own; the `docs/01` risk range is
`:199`–`:204` in both places; and the round-2/R3 minors are split into one Log row each.

Round 4 is the round the operator asked for after the third block. The rule in `AGENTS.md`
step 4 says the reviewer is not asked again afterwards; the decisions are recorded per
finding in `## Log`, and they settle the gate.

**2026-11-15 — spec review, round 5 — not requested, by rule.**

## Log

| Date | Finding | Decision |
|---|---|---|
| 2026-11-15 | operator: a second key when `shift+tab` must stay | yes, `f2`, fixed, both keys active |
| 2026-11-15 | operator: build form | a second fixed key now; a configurable key stays the roadmap item |
| 2026-11-15 | `docs/03` rejected two keys | withdrawn on 2026-11-15: the argument against it was `/hotkeys` duplication and conflict surface; the argument for it is that users who keep `shift+tab` had no way in at all |
| 2026-11-15 | review R1 M1: README lines undecided, criterion 8 vacuous for the README | taken — criterion 9 decides both, criterion 8 is scoped to `docs/01` where that phrase lives |
| 2026-11-15 | review R1 M2: criterion 2 cited a list of names that does not exist | taken — a diff decides "no case renamed", plus the root caveat |
| 2026-11-15 | review R1 M3: "Six places" against seven enumerated | taken — seven, and the proof comment names all seven |
| 2026-11-15 | review R1 M4: two `docs/03` claims go false unamended | taken — `:188`–`:190` and `:75`–`:78` are in the amendments; `:279` stays as a dated record; the `01` registry row is updated in stage 6 |
| 2026-11-15 | review R1 m1: criterion 7 counts a comment mentioning `registerShortcut` | taken — anchored to `^[[:space:]]*pi\.registerShortcut\(` |
| 2026-11-15 | review R1 m2: criterion 6 allowed two indexed reads | taken — "prints nothing" |
| 2026-11-15 | review R1 m3: criterion 9's second half had no command | taken — `grep -n "needed for" README.md` |
| 2026-11-15 | review R1 m4: a stale test comment stays | taken — named as the one allowed comment change |
| 2026-11-15 | review R1 m5: pi facts verified on 1.3.0 only | taken — stated in the risk, with criterion 10 as the 1.5.2 evidence |
| 2026-11-15 | review R1 m6: two line references off by one | taken — `keys.d.ts:32`, `runner.js:9–29, 459–470` |
| 2026-11-15 | review R1 m7: unsourced "five places" | taken — measured 7 / 6 / 7 |
| 2026-11-15 | review R1 m8: the `f2` case oversold as independent coverage | taken — described as a rerun with the key changed |
| 2026-11-15 | review R1 m9: stage 3's `git grep` unscoped | taken — `-- docs/01-switch-main-agent-prompt.md` |
| 2026-11-15 | review R2 M1: criterion 9 and the gate sentence exist twice | taken — the round-1 duplicates are deleted |
| 2026-11-15 | review R2 M2: the two README sentences have no decider | taken — criterion 9 greps "has no shortcut" and "it simply has no key" |
| 2026-11-15 | review R2 M3: stage 4 does not carry out the amendments it lists | taken — "every bullet", plus a proof that greps the specific claim |
| 2026-11-15 | review R2 M4: five more `docs/03` claims go false | taken — `:42`, `:64`, `:65`, `:67`, `:130` are in the amendments |
| 2026-11-15 | review R2 M5: pi facts labelled 1.3.0, four anchors wrong | taken — re-read from the installed 1.5.2, all five numbers corrected |
| 2026-11-15 | review R2 M6: stage 1 teaches the old criterion 6 | taken — the clause is gone |
| 2026-11-15 | review R2 m1–m8: counts that drift, a range one line short, an unanchored proof grep, an amended-vs-history asymmetry, a dangling reference, a scope mismatch, and doc proofs no criterion covers | taken — numbers replaced by pointers, range `:49`–`:79`, anchored grep, `docs/01` dev plan amended, reference removed, scope aligned, stage 7 re-runs the doc proofs |
| 2026-11-15 | review R3 M1: stage 4's proof contradicts its own amendment, `54` has no source | taken — the row becomes count-free, the proof greps `34 cases` for nothing |
| 2026-11-15 | review R3 M2a: "at least 6 lines" below a list of eight, and two places need not contain `f2` | taken — one grep per claim, no counts |
| 2026-11-15 | review R3 M2b: stage 4 has no decider for three amendments it carries | taken — `:201`, `:193` and the rejection withdrawal each get a grep |
| 2026-11-15 | review R3 M3: `toHaveLength(1)` not named among the changed assertions | taken — named, with `toHaveLength(2)` or dropping it as the two acceptable forms |
| 2026-11-15 | review R3 m1: section labels swapped in the amendments | taken — `:42` is the files table, `:130` the dev plan, `:64`/`:65`/`:67` are `## Testing` |
| 2026-11-15 | review R3 m2–m6: Log lumped eight minors into one row; "F-keys arrive in every terminal" overclaims; no written rule for dev-plan history; risk range one line short; ROADMAP wording drifts | taken — one row each here, decision row reworded, rule clause added, `:200`–`:204`, and the roadmap wording is named as catching up later |
| 2026-11-15 | `AGENTS.md` step 4: third block, split or decide together | **decided with the operator on 2026-11-15: one more spec review round, no split.** Splitting a two-line wiring change produces two specs neither of which is smaller, and every finding lives inside a stage that already exists. The rule's fallback applies because splitting does not help |
| 2026-11-15 | review R4 B1: stage 4's grep wraps across `docs/03:193`/`:194` | taken — `a configurable shortcut, a second` |
| 2026-11-15 | review R4 B2: stage 4 decides three of the nine places | taken — one grep per place, eleven commands |
| 2026-11-15 | review R4 B3: criterion 9's grep wraps across `README.md:17`/`:18` | taken — `Without it the extension has no` |
| 2026-11-15 | review R4 B4: stage 3 and stage 6 demand contradictory literals | taken — the exact literal per file is written down; stage 6 greps the `01` row for `f2` |
| 2026-11-15 | review R4 m1: "at least 3" floors elsewhere | taken — criterion 9 names the three sections and the two `f2` lines |
| 2026-11-15 | review R4 m2: "nothing outside the re-scoped sentence" | taken — the full old clause is grepped |
| 2026-11-15 | review R4 m3: `docs/03:30`–`:31` half-true | taken — the bullet gains a clause and the amendment names it |
| 2026-11-15 | review R4 m4: two ranges for one paragraph | taken — `:199`–`:204` in both |
| 2026-11-15 | review R4 m5: Log rows lumped several minors | taken — one row per finding from R2 and R3 on |
| 2026-11-15 | review R4 m6: `docs/03:52`'s `35 passed` was already false | taken — stated as a debt this spec does not own |
| 2026-11-15 | criterion 10: the live check | operator: `~/.pi/agent/keybindings.json` moved aside, `pi --extension ./src/extension.ts`, `f2` changed the footer from `Main` to an agent name; `shift+tab` was skipped with the expected `[Extension issues]` line. The file was restored afterwards |
| 2026-11-15 | code review: verdict | 🔧 first round, then ✅ after the two documented blockers were closed by replacement. The code and the suite were signed off in the first round; both blockers were in `docs/`, which the orchestrator owns |
| 2026-11-15 | code review: docs/03:137 spliced instead of replaced, docs/01 stray double backtick, two dead proof literals | taken — the clause is replaced, the backtick removed, and `No second shortcut`/`the registered key is exactly` retargeted to `second shortcut`/`registered keys are exactly` |
| 2026-11-15 | orchestrator, after round 4: two proofs contradicted their own amendment wording | taken — "re-scoped to `shift+tab`" keeps the phrase, so stage 4 expects one line there instead of none; `docs/03:67`'s "No new case" sentence is genuinely replaced so its grep still expects nothing |
