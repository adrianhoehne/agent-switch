---
description: Closes three test gaps of increment 01 and stops the shortcut from recording a selection when no cycle has been built, so every behaviour of the extension is held by a test instead of by construction.
status: proposed
---

# 02 — Hold the cycle's edge cases in tests

## Goal

Three behaviours of the extension are correct today but unproven: a second
`session_start` rebuilding the cycle, a skipped agent file reaching the user as a
warning, and a keypress before the cycle exists. The third one is not only unproven
but wrong: pressing `ctrl+shift+a` before `session_start` has run writes a
`agent-switch-state` entry for `Main` — a selection the user never made. This
increment adds the guard and covers all three with tests, so a regression fails the
suite instead of showing up in a live session.

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
| 3 | A press before `session_start` writes no entry and no status | case `press before session_start is a no-op` asserts `entries` is empty and `statuses` is empty |
| 4 | A second `session_start` does not duplicate the cycle | case `second session_start does not duplicate the cycle`: two starts, then two presses on a one-agent fixture, asserts the label sequence `Main` → `agent` → `Main` |
| 5 | A skipped agent file reaches the user as a warning naming path and reason | case `skipped file surfaces a warning` asserts one `warning` notification containing the file path and the parse reason |
| 6 | The live behaviour matches: a press before the first message leaves no `agent-switch-state` entry in the session file | `pi --extension ./src/extension.ts`, press once, send nothing; `grep -c agent-switch-state <session.jsonl>` returns 0 |
| 7 | A press after `session_start` still writes exactly one entry | case `selection is persisted` (existing, unchanged) still asserts one entry |

Criterion 6 is the only one a test cannot decide, and it is cheaper than the
criterion-13 session of increment 01: no model call, just the session file.

## Testing

| File | Case | What it proves |
|---|---|---|
| `test/extension.test.ts` | `press before session_start is a no-op` | the guard: no entry, no status, no throw |
| | `second session_start does not duplicate the cycle` | rebuild, not append — two presses over a one-agent cycle wrap back to `Main` |
| | `skipped file surfaces a warning` | `onSkip` is wired to `ctx.ui.notify` with path and reason |
| | `shortcut is registered` *(changed)* | still proves key and description; its pre-session press assertion moves to the new no-op case, because the status write it expected is what the guard removes |
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
the operator with the goal.

## Dev plan

(pending — filled by the architect in step 3 of the loop)

## Review

(no rounds yet)

## Log

| Decision | Source | Date |
|---|---|---|
| Increment scope: guard plus three tests, no integration test, no coverage tooling | operator | 2026-11-12 |
