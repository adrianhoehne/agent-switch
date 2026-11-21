---
description: Moves the agent cycle from ctrl+shift+a to shift+tab and releases that key from pi's thinking cycle, so the shortcut works on every terminal instead of only those that report the shift modifier.
status: active
---

# 03 — Move the cycle to shift+tab

Implemented on 2026-11-12. Criteria 1-4 are verified; 5 and 6 are the operator's
live check in a real terminal.

## Goal

`ctrl+shift+a` only reaches an extension when the terminal reports the shift
modifier separately. Without that — plain xterm, tmux with `extended-keys off`, most
macOS terminals — the key arrives as `ctrl+a`, pi moves the cursor to the line start,
and the cycle never fires. `shift+tab` is sent as `ESC[Z` and is distinguishable
everywhere.

pi refuses extension shortcuts on keys a reserved built-in owns, and `shift+tab` is
`app.thinking.cycle`. The operator does not use that key for thinking and accepts the
trade: the thinking level stays reachable through `/thinking [level]`, the cycle moves
onto the key.

## Non-goals

- **No** second shortcut. One key, one action; `ctrl+shift+a` is not kept as a
  fallback. *Withdrawn on 2026-11-15 by `docs/07-second-shortcut.md`, which adds `f2` as a
  second key: an operator who does not want to release `shift+tab` had no way in at all.*
- **No** slash command as a further entry point (`/agent`). Useful, but it is a
  separate decision and a separate increment.
- **No** configurable shortcut (CLI flag or settings key). `shift+tab` is the answer
  for this project; configurability can come when a second project needs it. The answer is
  now the pair `shift+tab` and `f2` — the configurability question itself is still open.
- **No** change to how thinking levels are set, displayed or persisted beyond
  releasing the key. An agent definition may carry a `thinking:` value since
  `docs/04-agent-model-and-thinking.md`; that increment owns the rule, not this one.

## Files and interfaces

| File | Change |
|---|---|
| `~/.pi/agent/keybindings.json` | **new file**, content `{ "app.thinking.cycle": [] }` — the empty list is how pi disables an action's bindings |
| `src/extension.ts` | `SHORTCUT_KEY` becomes `"shift+tab"`; the comment above it explains the release and why the key was chosen |
| `test/extension.test.ts` | the case `shortcut is registered` asserts `"shift+tab"` instead of `"ctrl+shift+a"`; since `docs/07` it asserts the pair `["shift+tab", "f2"]` |

No interface changes. The handler, the guard, the footer status and the session entry
stay exactly as they are; only the key differs.

## Acceptance criteria

| # | Criterion | Command / evidence |
|---|---|---|
| 1 | Type check passes | `npm run typecheck` exits 0 |
| 2 | The suite passes with 35 cases and the shortcut case asserts the new key | `npm test` exits 0 and prints `Tests  35 passed (35)`; `grep -n '"shift+tab"' test/extension.test.ts` shows the literal in `shortcut is registered`, because vitest prints case names, not assertion values |
| 3 | The thinking key is released | `node -e 'console.log(require(process.env.HOME + "/.pi/agent/keybindings.json"))'` prints `{ 'app.thinking.cycle': [] }` |
| 4 | pi loads the extension with the key | a fresh `pi --extension ./src/extension.ts` shows no shortcut conflict in the `[Extension issues]` startup block (that is where `getShortcuts()` reports it; stdout carries it only in a UI-less run), and `/hotkeys` lists `Shift+Tab` under **Extensions** |
| 5 | The key cycles the agent | live session: footer `Main` → first press `architect` → further presses onward |
| 6 | Thinking is still controllable | in the same session `/thinking high` sets the level; the `Thinking level: high` status line confirms it, and the footer's thinking segment as well when the model supports reasoning |

Criteria 4–6 are the operator's live check; the first two decide the commit.

## Testing

| File | Case | What it proves |
|---|---|---|
| `test/extension.test.ts` | `shortcut is registered` *(changed)* | the registered keys are exactly `shift+tab` and `f2`, and the description is still set |
| | the remaining cases *(unchanged)* | the handler, the guard, the footer, persistence and restore do not care which key triggers them |

Since `docs/07` this file gains two new cases — `both keys share one handler` and
`f2 press cycles the agent` — and `shortcut is registered` asserts the pair, because
there are now three facts (two keys, one function, same effect) instead of one. A test
cannot cover the
keybindings file either: it lives outside the repository, and pi exports only `.` and
`./rpc-entry`, so the resolved binding table is unreachable without a deep import
into `dist/` — the trap `docs/01` rejected for `pi-subagents`.

## Risks and alternatives

- **Without the keybindings release `shift+tab` disappears.** pi drops that
  registration and reports it in the `[Extension issues]` startup block — visible,
  but only there, which is exactly why criterion 4 exists. The release is a one-line
  file that has to exist on every machine this project runs on. Since `docs/07` a
  missing file costs one key, not the shortcut: `f2` needs no release.
- **`shift+tab` inside pi's dialogs.** `app.thinking.cycle` is the only binding on
  that key in 1.3.0 — no selector or picker handles `\x1b[Z`, and pi's picker
  bindings are explicitly outside the reserved list. So inside a dialog `shift+tab`
  simply does nothing; the live check covers the editor case, which is where the
  extension handler runs.
- **Rejected alternative: keeping both keys.** Two shortcuts for one action shows up
  twice in `/hotkeys` and doubles the conflict surface. The one the operator wants is
  the one that stays. *Withdrawn on 2026-11-15 by `docs/07-second-shortcut.md`: the trade-off
  was reconsidered because a user who keeps `shift+tab` had no way in at all, and the second
  key is one that no pi default binds.*
- **Rejected alternative: a slash command instead of a key.** It works everywhere, but
  it is not what the operator asked for here.

## Touch boundary

The complete list of files this increment touches, and who owns each:

| File | Owner |
|---|---|
| `src/extension.ts` | implementer (stage 1) |
| `test/extension.test.ts` | implementer (stage 1) |
| `docs/01-switch-main-agent-prompt.md` | orchestrator (stage 4, the amendments) |
| `docs/README.md` | orchestrator (stage 4: the `01` row names the key) |
| `~/.pi/agent/keybindings.json` | **orchestrator only (stage 2)** — see below |

- **Not** any other file under `~/.pi/agent/**`, not `~/.agents/**`, not the agent
  definitions.
- **Not** generated folders: `node_modules/`, `coverage/`, `dist/`.
- `~/.pi/agent/keybindings.json` is outside the project and global: it changes key
  handling for every session and every project on this machine. The operator agreed
  to its creation on 2026-11-12 (see `## Log`); an implementer must not create or
  edit it, and it is not part of any commit.

## Additional dependencies

None.

## Open questions

None. The trade — thinking loses its key, `/thinking [level]` remains — was agreed
with the operator on 2026-11-12.

## Dev plan

1. **Move the key in the extension and its test** — one stage, because either half
   alone leaves the suite red. In `src/extension.ts` change
   `const SHORTCUT_KEY = "ctrl+shift+a"` to `"shift+tab"` and rewrite the comment
   above it: it currently justifies the literal-key choice only; it must now also say
   that pi's `app.thinking.cycle` owns `shift+tab` and is released in
   `<agent-dir>/keybindings.json`. Touch nothing else in the file —
   `registerShortcut(...)`, `SHORTCUT_DESCRIPTION`, the empty-cycle guard and
   `setLabel` stay byte-identical. In `test/extension.test.ts` change the single
   literal in the case `shortcut is registered` from `"ctrl+shift+a"` to
   `"shift+tab"`. Since `docs/07` the helper takes the key as its third argument and
   finds the registration by name, so a second key needs no new plumbing — only the two
   cases and the widened assertion.
   Proof: `npm run typecheck` exits 0; `npm test` exits 0 and its summary reads
   `Tests  35 passed (35)`. The literal itself is not printed by vitest; criterion 2's
   "asserting the new key" is shown by the diff of that line, not by the run.

2. **Create `~/.pi/agent/keybindings.json` — orchestrator work, not the implementer's.**
   Content is exactly `{ "app.thinking.cycle": [] }`. Reason for the split: it is the
   one file outside `<project root>`, `AGENTS.md` → *Touch boundary* puts
   everything outside the repo behind the operator's agreement, and it is global
   configuration — it changes key handling for every session and every project on
   this machine, cannot be reviewed as a repo diff, and rolls back by deleting one
   file. The agreement exists: the trade is recorded in the spec's `## Log` and in
   the touch boundary. The file is not part of the commit.
   Proof: `node -e 'console.log(require(process.env.HOME + "/.pi/agent/keybindings.json"))'`
   prints `{ 'app.thinking.cycle': [] }`.

3. **Not implementer work: the live checks.** Criteria 4, 5 and 6 need a running pi
   in a real terminal and belong to the operator, run after stages 1 and 2.

4. **Amend `docs/01` — orchestrator work.** The places listed under `## Amendments to
   previous spec docs` are updated in the same increment: the key literal where 01
   documents the shortcut, and the reserved-list sentence, which changes meaning
   because `shift+tab` *is* in that list. `## Log` rows keep the old key — a log is
   history, not documentation.
   Proof: `grep -rn 'ctrl+shift+a' docs/01-switch-main-agent-prompt.md docs/README.md src/ test/`
   returns exactly three kinds of hit: `01`'s `## Review` and `## Log` lines (history),
   and `docs/README.md`'s `03` row, which names the old key as the origin of the move.
   `npm run typecheck` and `npm test` stay green.

Who runs what: stage 1 the implementer; stages 2 and 4 the orchestrator, together with
criterion 3 as acceptance evidence; stage 3 and criteria 4-6 the operator.

### What could go wrong

- **The gap between stage 1 and stage 2 is a silently dead shortcut.** With
  `SHORTCUT_KEY = "shift+tab"` and no keybindings file, pi drops the registration. Do
  not start a session between the two stages and do not read a missing shortcut there
  as a regression.
- **Hand-written JSON breaks the whole file.** pi reads `<agent-dir>/keybindings.json`
  as one object; a trailing comma takes every binding in it down, not just this one.
- **`/reload` is the documented step** after editing the file, but a fresh
  `pi --extension ./src/extension.ts` is the cleaner evidence for criterion 4: it
  re-reads both the keybindings and the extension from disk.
- **The spec's `## Risks` referred to a `## Known gaps` section that did not exist.**
  The section is now there; do not repair it as part of the implementation.
- **Do not add a test case** to "cover" the keybindings file. It lives outside the
  repo, `vitest` cannot see it, and criterion 2's 35 would break for nothing.

### Ordering and dependencies

Stage 1 has no prerequisite. Stage 2 has no dependency on stage 1 but must be finished
before stage 3 and before the commit, because criterion 3 is acceptance evidence.
Criterion 4 is the gate that proves the two halves fit; if it fails, the fault is in
stage 2 first, not in the constant. Sequence: 1 → 2 → 3 → 4 → review → commit.

### What the next increment inherits

- **A fallback now exists.** `ctrl+shift+a` is gone, and since `docs/07` a machine
  without `~/.pi/agent/keybindings.json` still cycles the agent through `f2`. The file is
  required for `shift+tab`, not for the shortcut.
- **Thinking lost its key globally.** `app.thinking.cycle` stays unbound for every
  project on this machine until it is rebound; `/thinking [level]` remains.
- **Still out of scope:** a `/agent` slash command and a configurable shortcut. Each is a
  separate spec. *(A second key was out of scope here and arrived in `docs/07`.)*
- `docs/README.md`'s `Status` column is the orchestrator's to maintain.

## Known gaps

| Gap | Why it stays open |
|---|---|
| `~/.pi/agent/keybindings.json` is a prerequisite on every machine for `shift+tab` | without it pi drops that registration; since `docs/07` `f2` still works, so the file costs one key rather than the shortcut. It cannot live in the repository, because pi reads it from the agent directory |
| `app.thinking.cycle` stays unbound for every project on this machine | the release is global by nature; `/thinking [level]` is the remaining entry point, and rebinding the key per project is not something pi supports |
| `/hotkeys` renders an empty key cell for "Cycle thinking level" | with the action unbound, the row keeps its label and loses its key. Cosmetic; no action |

## Review

**2026-11-12 — spec review, round 1 — 🔧 Fix these and I'll sign off — blockers: yes (1).**

Verified the spine in the installed 1.3.0 rather than trusting the prose: an empty
list disables an action (`KeybindingValueSchema` has no `minItems`, and the manager
resolves an explicit `[]` instead of falling back to defaults), `app.thinking.cycle`
is in `RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS`, `shift+tab` is otherwise unbound
(`\x1b[Z` → `shift+tab`, covered by legacy, Kitty CSI-u and modifyOtherKeys), the
`[Extension issues]` block is where the conflict diagnostic lands, `/hotkeys` prints
`Shift+Tab` for an extension key, and the 35-case arithmetic holds.

Blocking: `03` changes a key that `docs/01` documents at ten places and said nothing
about it. `docs/README.md` offers change-in-place or a spec with `## Amendments to
previous spec docs`; this spec took neither, leaving an `active` spec that names a
key which no longer exists — including the sentence "`ctrl+shift+a` is in neither
list", whose meaning flips because `shift+tab` *is* reserved. Fix: amendments section
plus a stage that carries it out, amending 01 in place as increment 02 already did.

Non-blocking, all folded in: criterion 2 names a grep for the literal (vitest prints
case names, not assertion values); criterion 6 names the `Thinking level:` status line
as evidence that does not depend on the model supporting reasoning; the touch boundary
lists the owner per file and the implementer is told not to touch the global file; the
"picker navigation" risk was factually wrong and is replaced (no selector handles
`\x1b[Z`); `/hotkeys` rendering an empty cell for "Cycle thinking level" is a Known
gap; "no new test case" now cites pi's two-entry exports map instead of only
"vitest cannot see the file"; the "silently disappears" bullet no longer contradicts
itself.

Round 1 outcome: block and all notes applied.

**2026-11-12 — spec review, round 2 — 🔧 Fix these and I'll sign off — blockers: none.**

The round-1 blocker is closed: the amendments section names the reserved-list sentence
as a meaning change, stage 4 carries it, the touch boundary is a per-file owner table
with the global file walled off, `## Log` records the operator's agreement, and
`keybindings.json` really does not exist yet. Verified: `npm test` prints
`Tests  35 passed (35)`, `app.thinking.cycle` is the only `shift+tab` binding, pi's
exports map is `.` and `./rpc-entry`.

Notes: stage 4's proof could not pass — `01`'s `## Review` also keeps the old key, and
`docs/README.md`'s `01` row was outside the grep; the sequence line skipped stage 4;
`## Files and interfaces` quoted the keybindings file as a fragment where stage 2 has
an object.

Round 2 outcome: all applied.

**2026-11-12 — spec review, round 3 — 🔧 Fix these — blockers: none.**

The amended proof was still one item short, same trap as round 2: `docs/README.md:62`
is `03`'s own row and names the old key as the origin of the move, so "only Review and
Log lines" stayed unsatisfiable. The 01 side was correct: after the amendment only
462 (`## Review`) and 483/517 (`## Log`) remain, and every other hit sits in a section
the table names. Also: "who runs what" said stage 3 was the orchestrator's although
stage 3 is the operator's; round 2's verdict was missing from `## Review`.

Round 3 outcome: all three applied.

**2026-11-12 — spec review, round 4 — ✅ Ship it — blockers: no.**

Verified the round-3 fixes by running the proof: today 17 hits, stage 1 removes two,
stage 4 removes thirteen, leaving exactly `01`'s 462 (`## Review`), 483 and 517
(`## Log`) plus `docs/README.md:62`, which names the old key as the origin. Satisfiable
and stated to the line. Owners agree across stages, touch boundary, amendments table
and proofs; criteria 1-6 unregressed; the sequence no longer skips a stage. Follow-up,
applied: the amendments table no longer lists `## Log` among the spots to rewrite, and
round 3 is recorded.

Gate: open.

## Log

| Decision | Source | Date |
|---|---|---|
| `shift+tab` becomes the cycle key; `app.thinking.cycle` is released; no second key, no slash command, no configurability | operator | 2026-11-12 |
| The operator agreed that this increment creates `~/.pi/agent/keybindings.json` — a global file outside the repository | operator | 2026-11-12 |
| Spec review round 1 blocker: `docs/01` documents the old key and is amended in place, with the reserved-list sentence called out as a meaning change | spec review round 1 | 2026-11-12 |
| Round-1 notes: criterion 2 names the grep for the literal, criterion 6 names the always-available status line, the touch boundary lists owner per file, the picker risk was factually wrong and is replaced, `/hotkeys` empty cell added to Known gaps, the "no new test case" reason now cites pi's exports map | spec review round 1 | 2026-11-12 |
| Round-2 notes: the amendment proof excludes neither `## Review` nor `docs/README.md` (both keep the old key as history or as a registry row to update), sequence line includes stage 4, the keybindings content is quoted as an object | spec review round 2 | 2026-11-12 |
| Stage 2 done by the orchestrator: `~/.pi/agent/keybindings.json` created with `{ "app.thinking.cycle": [] }`; `node -e` prints it | orchestrator | 2026-11-12 |
| Stage 1: constant and test literal moved, comment explains the reserved key | code review, `✅` | 2026-11-12 |
| Stage 4: `docs/01` amended at ten places plus the registry row; the proof returns only `## Review`/`## Log` lines and `03`'s own registry row | orchestrator | 2026-11-12 |
| Live, `pi --extension ./src/extension.ts`: `shift+tab` cycles `Main` → `architect` → `grizzled-senior-dev`; `/hotkeys` lists `Shift+Tab` under Extensions; no conflict diagnostic | orchestrator in tmux | 2026-11-12 |
| Amendments section removed, spec set to `active` | orchestrator | 2026-11-12 |
