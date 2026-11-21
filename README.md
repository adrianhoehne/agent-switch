# agent-switch

A pi extension that switches the main agent of a running conversation onto a
different system prompt. `shift+tab` or `f2` cycles between `Main` — pi's own prompt —
and the agent definitions on your machine. One press is one step. The next message is
composed with the selected agent's prompt, and the conversation continues where it was.

Project context, the skill catalogue and the working directory stay in the prompt. The
transcript is never rewritten.

## Requirements

- pi 1.5.2 — the version this was built and tested against (`pi --version`). The suite
  also passed on 1.3.0.
- The agent definitions you want to cycle through, in one of the directories listed
  under [Where agents are read from](#where-agents-are-read-from).
- One line of keybinding configuration for `shift+tab`, see below. **Without it
  `shift+tab` has no shortcut; `f2` works regardless.**

## Install

Release install — for anyone who is not the author:

```bash
pi install git:github.com/adrianhoehne/agent-switch@v0.1.1
```

Personal install — the extension loads in every pi session:

```bash
pi install /path/to/agent-switch
```

Project install — only inside the current repository:

```bash
pi install --local /path/to/agent-switch
```

To try it once without installing:

```bash
pi --extension /path/to/agent-switch/src/extension.ts
```

A local package is loaded from its path, not copied. After a pull, run `/reload` in a
running session or start a new one.

## The keybinding prerequisite

`shift+tab` belongs to pi's built-in `app.thinking.cycle`. pi refuses an extension
shortcut on a key a reserved built-in owns, so the key has to be released first. The
file is needed for `shift+tab` only: `f2` is bound by no pi default and needs no
configuration. Create `<agent-dir>/keybindings.json` (default
`~/.pi/agent/keybindings.json`):

```json
{
  "app.thinking.cycle": []
}
```

An empty list is how pi disables an action's bindings. Then run `/reload`.

The file is in the repository as [`keybindings.json`](keybindings.json) and attached to
the release, so it can be copied instead of typed:

```bash
curl -fsSL https://github.com/adrianhoehne/agent-switch/releases/download/v0.1.1/keybindings.json \
  -o ~/.pi/agent/keybindings.json
```

That command **replaces** whatever the file holds. If you already bind keys there, add
the `app.thinking.cycle` line to your file instead of downloading over it.

If the file is missing, `f2` still cycles; only `shift+tab` is dropped. pi skips that
registration and reports
`Extension shortcut 'shift+tab' … conflicts with built-in shortcut. Skipping.` in its
`[Extension issues]` block at startup.

The thinking level is still settable, with `/thinking <level>`.

## Use

| Key | Effect |
|---|---|
| `shift+tab` | next entry in the cycle, wrapping; needs the keybinding file |
| `f2` | next entry in the cycle, wrapping; needs no configuration |
| — | the footer shows `Main` or the selected agent's name |

The cycle is `Main`, then every enabled agent sorted by name. A press takes effect on
the next message: the running request is not disturbed, and a press while a response
streams is rejected with a warning rather than swapping the model mid-run.

`Main` means the state the session started with. The first switch away from it records
the prompt, the model and the thinking level; returning to `Main` restores them. After
a `--resume` there is no recorded state, so `Main` leaves the current values alone —
the recorded state lives in memory, not in the session file.

## Agent definitions

An agent file is Markdown with YAML frontmatter. The body is the prompt. The extension
reads these fields; everything else in the file is left to whichever tool owns that
field.

| Field | Effect here |
|---|---|
| `name` | the cycle label and the footer text; falls back to the file name |
| `description` | not shown by the cycle; kept for other consumers |
| `prompt_mode` | `replace` (default) makes the body the role prompt; `append` puts it after pi's own prompt |
| `model` | `provider/modelId` or a bare model id; absent means "keep the current model" |
| `thinking` | one of `off, minimal, low, medium, high, xhigh, max`; absent or unknown means "keep the current level" |
| `enabled` | `false` keeps the agent out of the cycle |

A file is skipped, with a warning naming path and reason, when its frontmatter is not
valid YAML, its body is empty, its name is `Main` in any casing, it is a symlink, it is
not a regular file, or it is larger than 1 MiB. An unreadable directory counts as empty.

An unusable `model` or `thinking` value falls back per field: the other field still
applies, and a warning says which value was dropped.

### Why `AGENTS.md` survives a switch

`prompt_mode: replace` replaces pi's role prompt. pi builds the project context — your
`AGENTS.md`, the skill catalogue, the working directory — outside that slot, so a switch
changes the role, not the rules. This is the behaviour of
[opencode](https://github.com/sst/opencode)'s agent switch.

### Where agents are read from

Later tiers win for the same name:

1. `~/.pi/agent/agents/*.md` — global
2. `<project>/.agents/agents/*.md` — shared workspace
3. `<project>/.pi/agents/*.md` — project

The package tier (agents shipped inside an installed pi package) is declared in the
types but not read yet; no dependency on it.

## What a switch changes in the session

- **The request**, from the next message on: the role prompt, and optionally the model
  and thinking level.
- **The session file**: a `custom` entry named `agent-switch-state` records the label,
  so a resume restores the footer and re-applies the agent. No chat message is added;
  the transcript stays clean.
- **The footer**: one status segment.

Nothing else. Tools, extensions, permissions and the conversation history are untouched.

## Known limits

| Limit | Detail |
|---|---|
| The starting state is not persisted | after `--resume`, `Main` has nothing to restore |
| A bare model id is first-match-wins | `getAvailable()` order decides across providers |
| Thinking is not validated against the model | pi clamps an unsupported level; the footer shows the effective value |
| A resume writes a `model_change` entry | even when the model is already current |
| No picker, no slash command | two keys, one direction; `/agent <name>` is not built |

A model switch changes the context window; a long conversation may be compacted after
one. That is the same effect as switching the model by hand.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit, strict
npm test            # vitest, 60 cases
```

Layout:

| Path | Content |
|---|---|
| `src/agents.ts` | discovery and frontmatter parsing |
| `src/prompt.ts` | how the body reaches the prompt |
| `src/apply.ts` | which model and level to set, and what to do when they are unusable |
| `src/state.ts` | cycle list, label arithmetic, the session entry |
| `src/extension.ts` | the pi wiring: shortcut, footer, `session_start`, `before_agent_start` |
| `docs/` | the specs this code implements, each with its review history |

The behaviour is specified in `docs/`; start with `docs/README.md` for the format and
`docs/01-switch-main-agent-prompt.md` for the increment that built this.

## Status

Version 0.1.1, MIT, and the repository is public at
[github.com/adrianhoehne/agent-switch](https://github.com/adrianhoehne/agent-switch). The
extension installs from the git URL above or from a local path.

It is **not** published to npm, because the name `agent-switch` there belongs to another
package. The `pi-package` keyword in the manifest is metadata for the pi gallery; it only
matters once an npm package exists.

## Licence

MIT, copyright (c) 2026 Adrian Alexander Höhne. The full text is in
[LICENSE](LICENSE).
