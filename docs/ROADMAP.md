# Roadmap — agent-switch

What is still missing, in the order the operator wants it. This file is process, not a
spec: it carries no frontmatter and it is not a registry entry. Every item names its
source, so the detail behind it can be read where it was decided.

State values: **open** (needs work), **question** (needs a decision first),
**decided** (settled, just not built).

## 1. Distribution

| Item | What it changes for the user | State | Source |
|---|---|---|---|

## 2. The one visible gap in daily use

| Item | What it changes for the user | State | Source |
|---|---|---|---|
| Persist the starting state (`Main`) in the session | after `--resume`, `Main` currently has nothing to restore, so the model and level of the last agent stay | open | Known gaps, `docs/04` |

## 3. Operating the cycle

| Item | What it changes for the user | State | Source |
|---|---|---|---|
| `/agent <name>` slash command | jump to an agent by name instead of pressing `shift+tab` until the footer matches; also works in terminals that do not send `shift+tab` | open | Non-goals, `docs/01` and `docs/03` |
| A configurable shortcut instead of the hard-coded `shift+tab` | a key that the terminal, tmux or another tool already owns stops being a dead end. Today the only workaround is rewriting the global `~/.pi/agent/keybindings.json`, because pi refuses an extension key that a built-in owns; the release ships that file as an asset, which makes it copyable but not configurable | open | Non-goals, `docs/03`; sharpened 2026-11-15 after the release published the keybinding file |
| Which key, and where the setting lives | the item above cannot start until three things are decided: the default key, whether the setting is a pi settings key, a CLI flag or a field in the agent file, and what happens when the chosen key is reserved again. Today a reserved key is not a crash, it is a shortcut that does not exist, with one line in pi's `[Extension issues]` startup block as its only trace | **question** | not recorded anywhere; `docs/03` `## Risks and alternatives` describes the same failure for `shift+tab` |
| A picker dialog | see descriptions and land on an agent in one step | **question** — the operator chose cycling deliberately; is a picker wanted later | Non-goals, `docs/01` |

## 4. Adopting more of the agent file

| Item | What it changes for the user | State | Source |
|---|---|---|---|
| The package tier: agents shipped inside installed pi packages | `source: "package"` and the `packageDirs` seam already exist; nothing produces them today, and no installed package declares an agent | open | Known gaps, `docs/01` |
| `tools` from the agent file | a switch would change what the agent can do, not only how it talks | **question** — a prompt swap keeps tool availability stable on purpose | Known gaps, `docs/01` |
| Warn when pi clamps a thinking level against the model | silence hides that the requested level was not honoured | open | Known gaps, `docs/04` |
| A tie rule for a bare model id | today the first match in `getAvailable()` wins, which can pick the wrong provider when two carry the same id | **question** — scoped models first, or a warning on ambiguity | Known gaps, `docs/04` |

## 5. Proof, not features

| Item | What it changes for the user | State | Source |
|---|---|---|---|
| Behaviour after a compaction | the prompt is set per run; the interplay with the recorded system delta in a compacted session is untested | open | review note, `docs/01` |
| The reachable live check: press, send one message, exactly one `agent-switch-state` entry | the only repo-external evidence the session file is right; costs one model call | open | Known gaps, `docs/02` |
| `restoreSelection` wording for an `enabled: false` agent | it says "no longer available" about a file that is present, only not offered | open | Known gaps, `docs/01` |
| `getBranch()` instead of `getEntries()` for the restore | a branched session can restore a label from an abandoned branch | open | Known gaps, `docs/01` |
| Atomicity of `lstat` → `readFileSync` | a file swapped to a symlink between check and read is still read; closing it means `openSync` + `fstat` | open | Known gaps, `docs/01` |
| The tie case under `small-icu` Node | the sort lock silently loses its teeth on a Node built without full ICU | open | Known gaps, `docs/01` |
| Skip the `model_change` entry when the model is already current | every resume writes one today | **question** — needs a `currentModel` in `SelectionDeps`, which widens the interface | Known gaps, `docs/04` |

## 6. Housekeeping

| Item | What it changes for the user | State | Source |
|---|---|---|---|
| `/hotkeys` shows an empty key cell for "Cycle thinking level" | cosmetic; the action is unbound because this plugin took the key | open | Known gaps, `docs/03` |
| `~/.pi/agent/keybindings.json` outside version control | the release file does not travel with the machine's configuration; the allowlist in `~/.pi/agent/.gitignore` would need one line | **question** — track it or leave it untracked | Known gaps, `docs/03` |
| `createStubPair` names context and session both `session` | confusing on the next read of the test file | open | review note, `docs/04` |

## Shipped

| Item | Spec |
|---|---|
| Cycle the main agent's system prompt on a shortcut, keeping `AGENTS.md` and the transcript | `docs/01-switch-main-agent-prompt.md` |
| Close three test gaps and stop recording a selection nobody made | `docs/02-tests-close-the-gaps.md` |
| Move the cycle to `shift+tab` and release it from the thinking cycle | `docs/03-shift-tab-shortcut.md` |
| Adopt an agent's optional `model` and `thinking`, restore the session's start on `Main` | `docs/04-agent-model-and-thinking.md` |
| README, personal install, the keybinding prerequisite documented | `README.md` |
| Release metadata and an MIT licence: `description`, `keywords: ["pi-package"]`, `engines`, `files`, CI workflow — `0.1.0` shipped 2026-11-15, `0.1.1` added the copyable keybinding file, `0.1.2` added the second shortcut on `f2` and 60 test cases | `docs/05-release-packaging.md`, `docs/07-second-shortcut.md` |

## Suggested order

1. Distribution (§1) — shipped on 2026-11-15 in `docs/05-release-packaging.md` and [`06-publish-on-github.md`](06-publish-on-github.md).
2. `/agent <name>` (§3) — the largest everyday gap.
3. Persist the starting state (§2) — the only gap that shows up in normal use.
4. Package tier (§4) — no effect today, because no installed package declares an agent.
5. Everything else, batched.

The order on this page is a proposal. The operator decides, and a change is recorded
here with a date.
