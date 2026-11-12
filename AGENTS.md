# AGENTS.md — agent-switch

Applies to all work in this directory. It extends `~/.pi/agent/AGENTS.md`; for this
project, this file takes precedence.

## What gets built here

A Pi plugin that switches the main agent of a running conversation onto a new
system prompt between turns.

## Roles

| Role | Who | May | May not |
|---|---|---|---|
| **Orchestrator** | the main session | goal, scoping, spec, agreement with the operator, insert the dev plan, acceptance, build, commit | write production code — except a change with no behavioural effect (typo, comment, formatting) |
| **Architect** | subagent `architect` (`.pi/agents/architect.md`) | check the spec for feasibility, write `## Dev plan` | write code, build, run tests, review |
| **Implementer** | subagent `ranger-1` | production code, tests, running the acceptance commands itself | change the spec, commit, review its own work, start subagents |
| **Reviewer** | subagent `grizzled-senior-dev` | review spec and diff, give a verdict | change anything |

Models and budgets are deployment policy, not the content of this file.

## Delegation

**Level 2 — no limit.** The orchestrator may run several subagents at once. What
remains is the working-tree rule: one writer per working tree, parallel writers
only in separate worktrees, read-only reviews may overlap at any time.

Decided by the operator on 2026-11-12.

The operator decides the level, not the orchestrator: how much parallelism is
sustainable depends on the model and on the machine. A change is recorded here with
date and reason, never switched silently.

## The loop: one increment

1. **Spec.** The orchestrator writes `docs/NN-short-description.md` (frontmatter
   `description` + `status: proposed`, required sections per `docs/README.md`).
   No code before the spec. If a question cannot be answered, it goes under
   `## Open questions` — no guessing.
2. **Agreement.** The orchestrator presents **goal and
   `## Acceptance criteria`** to the operator (`ask_user`) and waits for the OK.
   Only then step 3. Without that agreement no dev plan is written.
3. **Dev plan.** Subagent `architect` receives the spec path and the question of
   the increment. Its answer is the `## Dev plan` section — no `output` path, the
   orchestrator inserts it into the spec itself. The architect also checks whether
   the criteria are testable as written.
   **Gate:** `## Acceptance criteria` filled, `## Dev plan` filled.
4. **Spec review — Gate.** `grizzled-senior-dev` reviews the spec against the
   checklist from the `spec-doc-review` skill. Only `✅ Ship it` opens the gate;
   `🔧 Fix these` and `🤔 Needs a rethink` block. Every round is recorded in the
   `## Review` section.
   - **After the third block the spec is too big.** Then it gets split: the rest
     moves into `## Non-goals` and into a spec of its own. Do not wave it through.
   - If splitting does not help either, the orchestrator decides — **together with
     the operator**, not alone. One line per finding in `## Log`: taken, or not
     taken and why. The reviewer is not asked again afterwards.
5. **Implementation.** `ranger-1` implements **one** stage of the dev plan, keeps
   to the touch boundary, and answers in the four sections `## Result`,
   `## Changed`, `## Verification`, `## Open`. Successful stages get
   `**Completed yyyy-MM-dd**` (skill `spec-doc-implementation`).
6. **Code review — Gate.** `grizzled-senior-dev` reviews `git diff <base>` (skill
   `review-changes`). No `✅ Ship it` means no commit; the finding goes back to
   **the same** implementer, with the same spec. If the review blocks repeatedly,
   the increment is too big: split the stage, do not wave it through.
7. **Acceptance and commit.** The orchestrator reads the diff itself, runs the
   acceptance commands, checks the criteria one by one, and only then commits. It
   also maintains `docs/README.md` (column `Status`). The final stage sets the
   spec to `status: active`, rewrites the prose in descriptive form, and removes
   `## Amendments` (skill `spec-doc-implementation`).

A report is a report, not proof: nothing is accepted on prose.

## Working tree

- **One writer per working tree.** `ranger-1` is the only one writing production
  code; the orchestrator touches no file while an implementer is running.
  Parallelism only with separate worktrees.
- Read-only reviews may run in parallel; a writer never next to another.
- The implementer never commits; the orchestrator never commits unreviewed.
- The spec belongs to the orchestrator. After the gate it changes only through it,
  and a changed spec goes through step 4 again.

## Acceptance

Before every commit:

```bash
npm run typecheck
npm test
```

No commit without green acceptance **and** without `✅` from step 6.

## Touch boundary

- Everything inside `/home/adrian/agent-switch` is fair game for an implementer.
- Everything outside that directory — including the global agent and skill
  definitions under `~/.pi/agent/` and `~/.agents/` — needs the operator's
  agreement first.
- Generated artefacts (build output, `node_modules/`, coverage reports) are never
  touched by hand.
- Files belonging to another increment are not part of the current one.

## Language

- **Specs, docs, `AGENTS.md`: English.**
- **Section headings stay English**, where a check script reads them: `## Testing`,
  `## Acceptance criteria`, `## Dev plan`, `## Open questions`,
  `## Additional dependencies`, `## Dependency changes`,
  `## Amendments to previous spec docs`.
- **Code: English** — identifiers, comments, new file names.
- **User-visible text: the language the end user reads.** Default is English;
  name a different language here if the product is used in another one.
- **Code references in specs use the English name** — the name the code actually
  carries.

## Rules

- **Invent no requirement.** Unclear points are asked about or noted under
  `## Open questions`, not interpreted.
- **One spec, one increment.** Several changes are several specs.
- **No new dependencies without consulting** the operator.

## Open questions

These points were not settled when this file was written. Until they are answered,
they are not decided — do not fill them in silently.

- **`docs/PROJECT-STATE.md`.** Not requested. Create it only if the operator asks;
  from then on it travels with every increment commit.
- **Project-specific rules** (operating limits, data directories, banned tools,
  plugin conventions): none named so far.

## References

- Spec process and registry: `docs/README.md`
- Checklist for specs: skill `spec-doc-review`
- Dev-plan stages and completion: skill `spec-doc-implementation`
- Review of uncommitted changes: skill `review-changes`
