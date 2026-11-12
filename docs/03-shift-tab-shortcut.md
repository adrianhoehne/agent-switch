---
description: Moves the agent cycle from ctrl+shift+a to shift+tab and releases that key from pi's thinking cycle, so the shortcut works on every terminal instead of only those that report the shift modifier.
status: proposed
---

# 03 — Move the cycle to shift+tab

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
  fallback.
- **No** slash command as a further entry point (`/agent`). Useful, but it is a
  separate decision and a separate increment.
- **No** configurable shortcut (CLI flag or settings key). `shift+tab` is the answer
  for this project; configurability can come when a second project needs it.
- **No** change to how thinking levels are set, displayed or persisted beyond
  releasing the key.

## Files and interfaces

| File | Change |
|---|---|
| `~/.pi/agent/keybindings.json` | **new file**, one line: `"app.thinking.cycle": []` — the empty list is how pi disables an action's bindings |
| `src/extension.ts` | `SHORTCUT_KEY` becomes `"shift+tab"`; the comment above it explains the release and why the key was chosen |
| `test/extension.test.ts` | the case `shortcut is registered` asserts `"shift+tab"` instead of `"ctrl+shift+a"` |

No interface changes. The handler, the guard, the footer status and the session entry
stay exactly as they are; only the key differs.

## Acceptance criteria

| # | Criterion | Command / evidence |
|---|---|---|
| 1 | Type check passes | `npm run typecheck` exits 0 |
| 2 | The suite passes with 35 cases, the shortcut case asserting the new key | `npm test` exits 0; case `shortcut is registered` asserts `"shift+tab"` |
| 3 | The thinking key is released | `node -e 'console.log(require("/home/adrian/.pi/agent/keybindings.json"))'` prints `{ 'app.thinking.cycle': [] }` |
| 4 | pi loads the extension without a shortcut diagnostic | `pi --extension ./src/extension.ts` starts and shows no "conflicts with built-in shortcut. Skipping" line; `/hotkeys` lists `Shift+Tab` under **Extensions** |
| 5 | The key cycles the agent | live session: footer `Main` → first press `architect` → further presses onward |
| 6 | Thinking is still controllable | in the same session `/thinking high` sets the level; the footer's thinking segment changes |

Criteria 4–6 are the operator's live check; the first two decide the commit.

## Testing

| File | Case | What it proves |
|---|---|---|
| `test/extension.test.ts` | `shortcut is registered` *(changed)* | the registered key is exactly `shift+tab`, and the description is still set |
| | the other 34 cases *(unchanged)* | the handler, the guard, the footer, persistence and restore do not care which key triggers them |

No new case: the key is a constant, and asserting it twice adds nothing. The
behaviour behind it is covered by the existing cases.

## Risks and alternatives

- **Without the keybindings release the shortcut silently disappears.** pi drops the
  registration and prints "conflicts with built-in shortcut. Skipping" at startup —
  visible, but easy to miss. The release is a one-line file that has to exist on
  every machine this project runs on; `## Known gaps` records that.
- **`shift+tab` inside pi's dialogs.** The pickers and selectors use `shift+tab` for
  their own navigation in some terminals. Extension shortcuts fire in the editor, not
  inside a modal, so the risk is a modifier that does not arrive while a dialog is
  open — acceptable, and the live check covers the editor case.
- **Rejected alternative: keeping both keys.** Two shortcuts for one action shows up
  twice in `/hotkeys` and doubles the conflict surface. The one the operator wants is
  the one that stays.
- **Rejected alternative: a slash command instead of a key.** It works everywhere, but
  it is not what the operator asked for here.

## Touch boundary

- Everything inside `/home/adrian/agent-switch`.
- **`~/.pi/agent/keybindings.json`** is the one file outside the project this
  increment may create or change, and only to disable `app.thinking.cycle`.
- **Not** any other file under `~/.pi/agent/**`, not `~/.agents/**`, not the agent
  definitions.
- **Not** generated folders: `node_modules/`, `coverage/`, `dist/`.

## Additional dependencies

None.

## Open questions

None. The trade — thinking loses its key, `/thinking [level]` remains — was agreed
with the operator on 2026-11-12.

## Dev plan

(pending — filled by the architect in step 3 of the loop)

## Review

(no rounds yet)

## Log

| Decision | Source | Date |
|---|---|---|
| `shift+tab` becomes the cycle key; `app.thinking.cycle` is released; no second key, no slash command, no configurability | operator | 2026-11-12 |
