---
description: Closes three test gaps of increment 01 and makes a shortcut press without a built cycle a no-op, so those three behaviours are held by tests instead of by construction.
status: proposed
---

# 02 — Hold the cycle's edge cases in tests

## Goal

Three behaviours of the extension are correct today but unproven: a second
`session_start` rebuilding the cycle, a skipped agent file reaching the user as a
warning, and a keypress when no cycle exists. The third is also a latent defect:
the handler writes an `agent-switch-state` entry for `Main` — a selection nobody
made. pi 1.3.0 does not offer a reachable path to it (the TUI wires extension
shortcuts only after `session_start`), so the guard is defensive rather than a
reproduced bug: it costs four lines and keeps the handler honest if that wiring
order ever changes. This increment adds the guard and covers all three behaviours
with tests, so a regression fails the suite instead of resting on the reading of
the code.

## Non-goals

- **No** real-pi integration test. Driving a TTY and a model call to assert the
  outgoing prompt stays the manual check; the cost outweighs the value while the
  stub tests fire the real handlers.
- **No** coverage tooling. No new dependency for a number nobody acts on.
- **No** wording fix for `restoreSelection` warning "no longer available" about an
  agent that exists but is `enabled: false`. It stays in `docs/01` → `## Known gaps`.
- **No** branch-aware restore (`getBranch()` instead of `getEntries()`).
- **No** change to how the cycle is built, sorted or persisted.

## Files and interfaces

| File | Change |
|---|---|
| `src/extension.ts` | The shortcut handler returns before touching anything when the cycle is empty |
| `test/extension.test.ts` | Three new cases; one existing case narrowed to what it can still prove |

No interface changes. `MAIN_LABEL`, `STATE_CUSTOM_TYPE`, `buildCycleList`,
`nextLabel`, `findEntry` and `lastSelectedLabel` keep their signatures.

The guard, in words: a keypress **before** the session has loaded its agents does
nothing — no entry, no footer write, no label change. It is not an error either: a
keyboard handler that throws into pi mid-keypress is worse than one that waits for
`session_start`, which is the only place `ctx.cwd` is known.

## Acceptance criteria

| # | Criterion | Command / evidence |
|---|---|---|
| 1 | Type check passes | `npm run typecheck` exits 0 |
| 2 | The suite passes with 35 cases | `npm test` exits 0, 4 files, case names as in `## Testing` |
| 3 | A press before `session_start` writes no entry and no status | case `press before session_start is a no-op` asserts `stub.entries` is empty and `session.statuses` is empty |
| 4 | A second `session_start` does not duplicate the cycle | case `second session_start does not duplicate the cycle`: the fixture gains an agent between the two starts, then consecutive presses yield `alpha` → `mike` → `zulu`, read from `stub.entries.map((entry) => entry.data.name)`. A duplicated cycle would yield `alpha` → `zulu`, because a repeated list repeats its label sequence — which is why the earlier one-agent version of this criterion could not fail |
| 5 | A skipped agent file reaches the user as a warning naming path and reason | case `skipped file surfaces a warning` asserts one `warning` notification containing the file path and the skip reason |
| 6 | A press after `session_start` still writes exactly one entry | case `selection is persisted` (existing, unchanged) still asserts one entry |

The live behaviour of the guard cannot be checked: pi 1.3.0 writes a session file
only once a conversation message exists, and it wires extension shortcuts only after
`session_start`, so a human cannot press before the cycle is built. `## Known gaps`
records that, and records the live check that *is* reachable.

## Testing

| File | Case | What it proves |
|---|---|---|
| `test/extension.test.ts` | `press before session_start is a no-op` | the guard: no entry, no status, no throw |
| | `second session_start does not duplicate the cycle` | rebuild, not append — the fixture gains an agent between the starts, and the press order `alpha` → `mike` → `zulu` differs from what an appended rebuild would produce |
| | `skipped file surfaces a warning` | `onSkip` is wired to `ctx.ui.notify` with path and reason |
| | `shortcut is registered` *(changed)* | still proves key and description; the pre-session press assertion moves into the new no-op case and is inverted there, because the status write it expected is exactly what the guard removes |
| | `selection is persisted`, `before_agent_start applies the current agent`, `footer shows the current name`, `restore last selection`, `missing agent falls back to Main` *(unchanged)* | increment 01's wiring stays green |

## Risks and alternatives

- **A guard can hide a broken load.** If `loadAgents` ever returns nothing, every
  press becomes silent. Mitigation: the empty cycle is only possible before
  `session_start`, which always rebuilds it, and each skipped file already produces
  a warning, so a repo whose agents all fail to parse is visible at start.
- **No feedback on a dead key.** Before the session exists the footer stays empty
  instead of showing `Main`. Accepted: the footer is set at `session_start`, one
  moment later.
- **Rejected alternative: keep writing the entry, filter it on restore.** A stored
  entry is read back by `lastSelectedLabel`, so the lie would have to be undone in
  a second place. Not writing it is one line.
- **Rejected alternative: assert the cycle length in the duplicate test.** Two
  presses over a one-agent cycle only wrap if the cycle is exactly one agent plus
  `Main`; the label sequence proves the same thing without exposing internals.

## Touch boundary

- Everything inside `/home/adrian/agent-switch`.
- **Not** `~/.pi/agent/**`, not `~/.agents/**`.
- **Not** generated folders: `node_modules/`, `coverage/`, `dist/`.
- The spec itself belongs to the orchestrator; the implementer changes the two
  files in `## Files and interfaces` and nothing else.

## Additional dependencies

None. `npm install` stays the only setup step; `package-lock.json` must not change.

## Open questions

None. The one behavioural choice — a press with an empty cycle is a silent no-op
rather than a footer write — is decided in `## Files and interfaces` and was put to
the operator with the goal. The disposition of the former criterion 6 is decided and
recorded under `## Log`.

## Dev plan

1. **Guard the press before the cycle exists, and narrow the case that relied on the
   old behaviour** — `src/extension.ts`, `handler` inside `pi.registerShortcut`:
   make the empty cycle an early return as the *first* statement, before `nextLabel`,
   `pi.appendEntry(STATE_CUSTOM_TYPE, …)` and `setLabel(ctx)`:
   ```ts
   if (cycle.length === 0) {
     return;
   }
   ```
   `cycle.length === 0` is exactly "no `session_start` has run": `loadCycle` →
   `buildCycleList` always prepends `MAIN_LABEL`, so any started session has at least
   one stop. Rewrite the comment above the handler so it no longer claims a no-op
   while the code writes an entry — it must say: empty cycle, therefore no entry, no
   footer write, no throw. Do **not** touch `nextLabel` in `src/state.ts`; its
   empty-list branch stays as documented and is covered by `test/state.test.ts`.
   `test/extension.test.ts`: delete the trailing pre-session block of
   `shortcut is registered` (the `createStubContext`, the `expect(() =>
   pressShortcut(...))` and the `statuses` assertions), leaving key and description.
   Add case `press before session_start is a no-op` with `createStubApi` +
   `createStubContext({ cwd: fixture.cwd })`, no `startSession`: assert
   `expect(() => pressShortcut(stub, session)).not.toThrow()`,
   `expect(stub.entries).toEqual([])`, `expect(session.statuses).toEqual([])`.
   The stub records entries as `{ customType, data }` with `data` left untyped;
   narrow it to `{ name: string }` in the stub helper so stage 3's assertion compiles
   under `strict`. The stub lives in this same test file and inside the boundary.
   Proof: `npx vitest run test/extension.test.ts` exits 0 and lists 7 cases, among
   them `press before session_start is a no-op` and the narrowed
   `shortcut is registered`; `npm run typecheck` exits 0.

2. **Cover the skipped-file warning** — test only. `loadCycle` already passes
   `onSkip` to `loadAgents` and calls `ctx.ui.notify(..., "warning")`. Add case
   `skipped file surfaces a warning`: write an agent whose frontmatter name is
   `main` (hits `RESERVED_AGENT_NAME` in `src/agents.ts`, so `readAgentFile` returns
   `verdict: "skipped"` with the reserved-name reason), `startSession`, then assert
   `session.notifications` has exactly one element of `type: "warning"` whose message
   contains the file path and the substring `reserved`. Exactly one is load-bearing:
   `restoreSelection` adds its own warning only when a stored label is missing, so
   pass no `entries`. Assert the reason as a substring, not the full sentence.
   Proof: `npx vitest run test/extension.test.ts` exits 0 with 8 cases,
   `skipped file surfaces a warning` among them.

3. **Cover the second `session_start`** — test only. Add case
   `second session_start does not duplicate the cycle`: write agents `alpha` and
   `zulu`, `startSession`, then write `mike`, `startSession` again, then press three
   times and assert the label sequence `alpha`, `mike`, `zulu` read from
   `stub.entries.map((entry) => entry.data.name)` — not from `session.statuses`,
   which also holds the two `session_start` writes. Pass no `entries` to
   `createStubContext`, so the start position is `Main` and not a restored label.
   Varying the fixture between the two starts is what makes the case fail against an
   appended rebuild.
   Proof: `npm test` exits 0, 4 files, 35 cases, with
   `second session_start does not duplicate the cycle` among them;
   `npm run typecheck` exits 0.

### What could go wrong

- **Criterion 4 was not probative as first written.** A cycle `[Main, a]` and a
  duplicated `[Main, a, Main, a]` produce the identical label sequence for every
  press: repeating a list repeats its labels. The criterion and the case now vary
  the fixture between the two starts, where an appended rebuild shows up on the
  second press (`zulu` instead of `mike`).
- **The warning case can pass for the wrong reason.** `notifications` also receives
  `restoreSelection`'s "no longer available" warning. Pass no `entries` to
  `createStubContext` and assert the whole array (length one).
- **Skip trigger choice.** The reserved name `main` depends on
  `MAIN_LABEL.toLowerCase()` staying `main`; the empty-body trigger depends on
  `body.trim()`. Both are real production rules; the reserved-name one fails loudly
  (a loaded agent instead of a skip) if the constant moves.
- **Guard placement.** It must be the handler's first statement: the honest form,
  because everything after it is work that only makes sense once a cycle exists.
- **Stale comment.** Leaving the old comment in place makes the code lie about
  itself in the one place a reviewer reads; the comment change belongs to stage 1.
- **Not implementer work:** the `docs/README.md` status flip, the prose rewrite and
  the stale row in `docs/01` → `## Known gaps` are the orchestrator's step 7.

### Ordering and dependencies

Stage 1 must not be split: the guard changes behaviour, so the old trailing
assertion in `shortcut is registered` breaks in the same edit that adds the guard,
and the new no-op case inherits that proof. No stage depends on a later one; stages
2 and 3 are test-only and interchangeable, listed in the order that keeps case names
matching `## Testing`.

Intermediate counts are checkpoints (32 → 33 → 34 → 35), not acceptance. Only the
final `npm test` with 35 cases and `npm run typecheck` decide the increment.
`package-lock.json` must stay byte-identical; nothing under `src/agents.ts`,
`src/prompt.ts` or `src/state.ts` changes.

### What the next increment inherits

- The real-pi integration test stays unwritten. `## Known gaps` records both the
  unreachable guard path and the live check that would be reachable.
- No coverage tooling, deliberately — no number to act on.
- The `restoreSelection` wording for an agent that exists but is `enabled: false`
  stays in `docs/01` → `## Known gaps`.
- Branch-aware restore (`getBranch()`), the package tier (`source: "package"`, the
  `packageDirs` seam) and any change to cycle construction, sorting or persistence
  remain unowned by a spec.
- Row 1 of `docs/01` → `## Known gaps` ("the guard is not in the code") is stale the
  moment stage 1 lands. Removing it is step-7 bookkeeping, not implementer work.
- The status flip to `active`, the descriptive prose rewrite and the removal of
  scaffolding sections are the orchestrator's step 7.

## Known gaps

Recorded 2026-11-12. Neither is a defect in this increment; both are limits of what
pi 1.3.0 lets anyone observe.

| Gap | Why it stays open |
|---|---|
| The guard's live path is not reachable in pi 1.3.0 | the TUI binds extension shortcuts only after `session_start`, and a session file exists only once a conversation message does. The guard is defensive; the unit case is the proof |
| The live check that *is* reachable is not built | press after `session_start`, send one message, then the session file must carry exactly one `agent-switch-state` entry. It costs a model call and proves criterion 6's counterpart, not the guard |

## Review

**2026-11-12 — spec review, round 1 — 🔧 Fix these and I'll sign off — blockers: yes (1).**

Blocking: criterion 6 (`press before the first message, then grep the session file`)
was undecidable. `SessionManager._persist` writes no session file before a
conversation message exists, and the TUI wires extension shortcuts only after
`session_start`, so a human press "before the first message" is a press after the
start: the file would show one entry against correct code. Smallest fix: drop the
criterion, record why under `## Known gaps`, and reword the goal from "wrong" to the
defensive framing.

Non-blocking, all folded in: row 1 of `docs/01` → `## Known gaps` goes stale on
stage 1 (named as step-7 bookkeeping); criterion 4, `## Testing` and stage 3 now name
the observable (`stub.entries.map((entry) => entry.data.name)`) instead of "the label
sequence"; stage 3 says to pass no `entries`; criterion 3 says `stub.entries` where it
meant it (the stub context has an `entries` field of the same name); the "guard after
`nextLabel` would overwrite `currentLabel`" rationale was disprovable and is gone;
criterion 5 says "skip reason", not "parse reason"; the frontmatter claims "the three
behaviours" instead of "every behaviour".

Round 1 outcome: criterion 6 removed by operator decision, everything else applied.

**2026-11-12 — spec review, round 2 — ✅ Ship it — blockers: none.**

Round 1's blocker is closed: criterion 6 is gone, the numbering runs 1–6 without a
gap, and the two surviving "criterion 6" strings mean the new criterion 6 and the
round-1 record, not a dangling reference. `## Known gaps` records an unreachable path
plus an explicitly unbuilt live check that costs a model call — correctly outside
implementer work. Numbers re-derived: 32 cases today in 4 files → 35; stage 1 lands 7
extension cases, stage 2 eight; the `alpha`/`zulu` then `mike` fixture yields
`alpha` → `mike` → `zulu` on a rebuild versus `alpha` → `zulu` when appended, so
criterion 4 is now probative.

Non-blocking notes, all folded in: two `## Open questions` sections merged; the stub's
`data` narrowed to `{ name: string }` so criterion 4's observable compiles under
`strict`; one `## Log` line per round-1 finding; `## Known gaps` dated; "moves into
the no-op case and is inverted there" instead of "not moved but reversed".

Gate: open.

## Log

| Decision | Source | Date |
|---|---|---|
| Increment scope: guard plus three tests, no integration test, no coverage tooling | operator | 2026-11-12 |
| Criterion 6 dropped: the live path it named is unreachable in pi 1.3.0; the guard stays, as a `## Known gaps` entry | operator, after spec review round 1 | 2026-11-12 |
| Note 1: the stale row in `docs/01` → `## Known gaps` is named as step-7 work | spec review round 1 | 2026-11-12 |
| Note 2: criterion 4, `## Testing` and stage 3 name `stub.entries.map(…)` as the observable | spec review round 1 | 2026-11-12 |
| Note 3: stage 3 tells the implementer to pass no `entries` | spec review round 1 | 2026-11-12 |
| Note 4: criterion 3 says `stub.entries`, not `entries` | spec review round 1 | 2026-11-12 |
| Note 5: `## Open questions` earns its "none" — the criterion-6 disposition is decided and logged | spec review round 1 | 2026-11-12 |
| Note 6: the disprovable "after `nextLabel`" rationale is removed | spec review round 1 | 2026-11-12 |
| Note 7: criterion 5 says "skip reason" | spec review round 1 | 2026-11-12 |
| Note 8: frontmatter claims "those three behaviours", not "every behaviour" | spec review round 1 | 2026-11-12 |
| Round-2 notes: duplicate `## Open questions` merged, stub `data` narrowing added to stage 1, one Log line per finding, `## Known gaps` dated, "moves then inverted" wording | spec review round 2 | 2026-11-12 |
