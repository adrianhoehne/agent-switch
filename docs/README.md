# Docs — specifications for agent-switch

This project is run **spec-driven**: the specification describes the intended
behaviour, the code implements it, the test runs prove both. The process document that
came out of that work (`AGENTS.md`) belongs to the author's working copy and is not part
of this repository; what a reader needs from it is the format below.

## Format

- File name `NN-short-description.md`, `NN` = order of creation, unique, two
  digits. Lower case, hyphens, ASCII only.
- Markdown with YAML frontmatter; required fields:
  - `description`: one sentence summarising the content (so specs can be scanned
    without opening them),
  - `status`: `proposed` | `active` | `superseded`. For `superseded`, optionally
    `replacement: <file.md>` or a list of them.
- Without frontmatter the document counts as `proposed`.
- **Exception:** `00-project-overview.md` has no frontmatter. It is the lead page
  (goal, non-goals, map) and produces no code.

## Required and recommended sections

- **`## Testing` (required):** what the tests must cover — file and case, each
  with what the case proves.
- **`## Acceptance criteria` (required):** checkable criteria, each with the
  command or log-line evidence that decides it. "Fast", "clean" or "better" are
  not criteria.
- **`## Dev plan` (required for `proposed`):** stages in build order, each with
  files/functions and the proof that it works. No stage may depend on a later one.
- **`## Known gaps` (recommended):** deviations between spec intent and code, each
  with a date. This replaces no work, it makes the work visible.
- **`## Open questions`:** open decisions. As long as a question is open, the spec
  cannot become `active` — only the operator answers it.
- **`## Additional dependencies` / `## Dependency changes`:** required as soon as a
  spec introduces, changes or removes a dependency — with exact version and
  licence.
- **`## Amendments to previous spec docs`:** only in a spec that supersedes
  another; the section is removed after implementation.
- **`## Review` and `## Log`:** belong to every `proposed` document. `## Review`
  collects the rounds of the spec review (date, verdict, whether a blocker was
  among the findings), `## Log` the decision per finding (taken, or not taken and
  why) from spec review and code review.

## Changing existing specs

- **Change in place:** set the spec back from `active` to `proposed`, adjust the
  behaviour, add stages to `## Dev plan` where needed (with date and a note that
  they arose after the first implementation). The final stage sets the spec back
  to `active`.
- **Via a new spec:** the new spec gets
  `## Amendments to previous spec docs` and a `## Dev plan`. The amendments
  section is removed after implementation.
- **Order:** no spec describes behaviour that does not exist yet. A changed spec is
  updated in **the** stage that implements the behaviour.
- Every behaviour change needs tests. Old code without tests: add tests.

## Overview

| File | Content | Status |
|---|---|---|
| [`01-switch-main-agent-prompt.md`](01-switch-main-agent-prompt.md) | Cycles the main agent's system prompt through the agent definition files on `shift+tab`, keeping project context and history intact | active |
| [`02-tests-close-the-gaps.md`](02-tests-close-the-gaps.md) | Closes three test gaps of 01 and stops the shortcut recording a selection before the cycle exists | active |
| [`03-shift-tab-shortcut.md`](03-shift-tab-shortcut.md) | Moves the cycle from `ctrl+shift+a` to `shift+tab` and releases that key from pi's thinking cycle | active |
| [`04-agent-model-and-thinking.md`](04-agent-model-and-thinking.md) | Adopts an agent's optional `model` and `thinking`, falling back per field, and restores the session's start on `Main` | active |
| [`05-release-packaging.md`](05-release-packaging.md) | Prepares the plugin for a public release: MIT licence, release metadata, a manifest guard test, a CI workflow and a README that names the install | active |
| [`06-publish-on-github.md`](06-publish-on-github.md) | Publishes the packaged plugin on GitHub: docs scrub, workstation files out of the index, commit-identity rewrite, push, CI, tag `v0.1.0` | active |

The table lists only files that exist. Each spec is added here with its `Status`
when it is committed.

[`ROADMAP.md`](ROADMAP.md) is not a spec: it tracks what is still missing, what each
item changes for the user and whether it is open or decided. It carries no frontmatter
and no `Status` of its own.

The meta file of this folder (`README.md`) deliberately carries no frontmatter: it
is process, not a spec.
