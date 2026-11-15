---
description: Publishes the packaged plugin on GitHub — scrubs the workstation path and the private mail address, untracks the workstation files, rewrites the commit identity, pushes, waits for green CI and tags v0.1.0.
status: active
---

# 06 — Publish on GitHub

Proposed on 2026-11-15. This spec was split out of an earlier, larger release spec in its
round-3 review (`AGENTS.md` step 4). It starts when `docs/05-release-packaging.md` is
implemented and committed.

Implemented on 2026-11-15. All twelve criteria are verified: the repository is public,
`master` carries the commits under the noreply identity, CI is green, `v0.1.0` and `v0.1.1`
are tagged and released with the keybinding file as an asset, and the operator's live
install works — the footer switches from `Main` to an agent name on `shift+tab`.

## Goal

`github.com/adrianhoehne/agent-switch` is public, MIT-licensed, installable with one
`pi install` command against the git URL, and green in CI on `master`. The repository
carries the plugin and its specs, not the workstation that built it: no workstation path
in any tracked file, no private mail address in any commit's metadata, and the
workstation-only files out of the index while staying on disk. Their paths do remain in
the blob history, because the rewrite is metadata-only — `## Risks` records why a
metadata-only rewrite cannot change that, so the Goal promises exactly what the plan
keeps.

## Decisions behind the publication

| Point | Decision | Why |
|---|---|---|
| Distribution | GitHub only, `pi install git:github.com/adrianhoehne/agent-switch@v0.1.0` | operator, 2026-11-15. No npm publish: the name `agent-switch` is taken on npm by an unrelated package |
| Repository | `adrianhoehne/agent-switch`, public, default branch `master` | the name is free; the local branch is already `master`, renaming buys nothing |
| Commit identity | author **and** committer of every commit rewritten to `adrianhoehne <19731088+adrianhoehne@users.noreply.github.com>`; same for this repository's `user.email` | the operator's private mail address must not become public. No remote, tag or second clone exists yet, so the rewrite costs nothing |
| Workstation files | `AGENTS.md` and `.pi/agents/architect.md` leave the index, stay on disk | internal process and a local agent definition; both carry absolute workstation paths and name internal subagents |
| History | metadata only — no rewritten messages, no squashed commits, no changed trees | the history is the record of how this was built |
| Spec status | `05` flips to `active` when it is committed; **this** spec stays `proposed` until an evidence-only commit after CI is green, and that evidence commit is what `v0.1.0` points at | no spec describes work that is not finished. `AGENTS.md` step 7 says "the final stage"; here that is the final stage an **agent** runs, because stage 7 belongs to the operator |
| Timeline | the tag is created only after CI is green | a tag should point at a commit that proved itself |

## Non-goals

- **No** change to `src/`, `test/`, `package.json`, `LICENSE`, `README.md` or
  `.github/`. `docs/05` owns them; a diff there is a finding, not a stage.
- **No** npm publish and no entry in the Pi package gallery.
- **No** branch rename to `main`, no squash, no rewritten or reworded commit messages. The
  one permitted history change is the mail rewrite in stage 4.
- **No** change to the global `~/.gitconfig`, and nothing under `~/.pi/agent/**` or
  `~/.agents/**`.
- **No** `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue or PR templates,
  no lint, no coverage, no CI matrix, no Dependabot, no release automation.
- **No** fix for the known limits in `docs/ROADMAP.md` §2–§5.
- **No** tag-triggered CI job: the workflow's `push` trigger names branches and no tags.

## Files and interfaces

| File | Change |
|---|---|
| `.gitignore` | adds `.pi/` and `AGENTS.md`, next to the `*.tgz` line from `docs/05` |
| `docs/01`, `docs/02`, `docs/03` | the workstation path prefix appears five times: **three prose mentions** (`docs/01:215`, `docs/02:96`, `docs/03:138`) become `<project root>`; the **two commands** (`docs/03:53`, `docs/03:144`) become `process.env.HOME + "/.pi/agent/keybindings.json"` so they stay runnable |
| `docs/05`, `docs/06` | `06` states the path only inside a bracket pattern and the mail domain only inside an alternation; `05` states neither, and both spellings have to stay patterns where they exist |
| `docs/README.md` | the link to the process document becomes prose that names it as not part of this repository; the registry row for `06` is added here, the `05` row arrived with its own commit |
| `docs/ROADMAP.md` | the two §1 rows merge into one and move into *Shipped*, dated; the npm sentence is reworded; the *Suggested order* entry for distribution points at what shipped |
| git index | `git rm --cached AGENTS.md .pi/agents/architect.md`; no edit to their contents |
| `.git/config` | `user.email` set to the noreply address for this repository only |
| git history | the author and committer mail address of every commit rewritten to the noreply address; messages, dates and trees untouched |
| GitHub | repository, `origin` remote, tag `v0.1.0`, release |

The edits to `docs/01`–`docs/03` are path cleanups, not behaviour amendments: those specs
stay `active` and need no `## Amendments to previous spec docs`. The prose keeps its
meaning; the two commands move from a hard-coded home directory to `$HOME`, which is a
repair — they become runnable on a machine that is not this one.

## Acceptance criteria

| # | Criterion | Command / evidence |
|---|---|---|
| 1 | No workstation path is left in the tracked files | `git add -N docs/05-release-packaging.md docs/06-publish-on-github.md` first, because `git grep` skips untracked files; then `git grep -n "/home/adria[n]"` prints nothing. The bracket keeps the pattern from matching the line that states it |
| 2 | The workstation files are untracked but present | `git ls-files | grep -E "^(AGENTS\.md|\.pi/)"` prints nothing; `test -f AGENTS.md && test -f .pi/agents/architect.md` exits 0 |
| 3 | The docs registry knows both specs and no longer links an absent file | `grep -c "05-release-packaging" docs/README.md` prints 1; `grep -c "06-publish-on-github" docs/README.md` prints 1; `grep -c "](../AGENTS.md)" docs/README.md` prints 0 |
| 4 | The roadmap asks no licence question, promises no npm install, and carries its date | `grep -c "MIT" docs/ROADMAP.md` prints at least 1; `grep -c "which licence" docs/ROADMAP.md` prints 0; `grep -c "becomes installable from npm" docs/ROADMAP.md` prints 0; `grep -c "2026-11-15" docs/ROADMAP.md` prints at least 1 |
| 5 | No private mail address is in any tracked file | `git grep -inE "@(gmail|googlemail)\."` prints nothing. The alternation keeps the pattern from matching the line that states it |
| 6 | Packaging acceptance still passes | `npm run typecheck` exits 0; `npm test` exits 0 with `Tests  58 passed (58)` |
| 7 | This increment touched nothing outside the docs and the ignore rules | `git show --name-only --format= HEAD | grep -vE "^(docs/|\.gitignore$|AGENTS\.md$|\.pi/agents/architect\.md$|$)"` prints nothing after the release commit — the two untracked files appear in `git show` as deletions, which is why they are named |
| 8 | No private mail address is in the history | `git log --format='%ae %ce' | sort -u` prints only `19731088+adrianhoehne@users.noreply.github.com` on both fields; `git log --format='%B' | grep -ciE "@(gmail|googlemail)\."` prints 0 |
| 9 | The rewrite changed metadata only | `diff /tmp/agent-switch-trees-before.txt /tmp/agent-switch-trees-after.txt` prints nothing — those files hold `%T %ad %cd %s` for every commit — and both tree hashes are recorded in `## Log` |
| 10 | CI is green on `master` | `gh run list --branch master --limit 1 --json conclusion,name` reports `conclusion: success` for `CI` |
| 11 | The repository, the remote, the tag and the release exist, and the tag object is clean | `gh repo view adrianhoehne/agent-switch --json visibility,url` reports `PUBLIC`; `git remote -v` shows `origin`; `git tag -l v0.1.0` prints `v0.1.0`; `gh release view v0.1.0 --json tagName,name` names it; `git cat-file -p v0.1.0 | grep -i tagger` shows the noreply identity |
| 12 | Live: a fresh install from the git URL works | operator: `pi install git:github.com/adrianhoehne/agent-switch@v0.1.0`, `pi list` shows it, start `pi`, press `shift+tab`, the footer changes from `Main` to an agent name |

Criteria 1–6 gate the release commit; criterion 7 checks that commit and gates the push
together with 8–9; 10 gates the tag; 11 verifies the tag and the release; 12 is the
operator's.

Criterion 6 assumes a non-root run: `test/agents.test.ts` has one `it.skipIf` case that
skips under `root`, and the summary then reads `57 passed | 1 skipped`, which is not a
failure.

## Testing

No new test case in this increment: it changes no code, so it can prove nothing by
testing behaviour. What it must not break is `docs/05`'s suite — the four manifest cases
keep the manifest honest while `package.json` becomes public — and criterion 6 re-runs it
after the docs scrub and the index change.

The proofs of this increment are the acceptance commands themselves. That is deliberate:
the docs scrub, the ignore rules, the history and GitHub are only decidable by running
them, and no unit test can stand in for a `git log` that no longer shows an address.

Nothing here needs network in the test sense; the only network calls are `git push`,
`gh` and the operator's `pi install` in criterion 12.

## Risks and alternatives

- **The workstation path stays in the blob history.** Every commit on `master` carries it
  in at least one blob — the local agent file and the specs had it from the first commit,
  and the two workstation files stay on disk. A metadata-only rewrite cannot remove a
  blob, and criterion 1 greps the *tree*, not the history. Anyone who needs the path gone
  from the history too would need a content rewrite — a `--replace-text` pass — which was
  not asked for and would invalidate every tree hash this plan uses as evidence. This is
  why the Goal promises a clean tree and clean metadata, not a clean history.
- **The rewrite is the one irreversible step.** It refuses a dirty tree, `filter-branch`
  is deprecated, and a wrong environment variable silently rewrites nothing. Every check
  in stage 4 runs while `refs/original/refs/heads/master` still exists; delete it last. A
  rewrite that "worked" but still shows the private address in
  `git log --format='%ae %ce' | sort -u` is not a rewrite.
- **The rewrite invalidates every commit hash.** Nothing points at them today — no remote,
  no tag, no second clone, no branch besides `master`. A clone that exists somewhere else
  would have to be re-cloned, not rebased. The per-commit tree comparison in criterion 9
  is what keeps this from being a leap of faith.
- **`git filter-repo` is not installed on this machine.** The rewrite uses the built-in
  `git filter-branch --env-filter`, which needs no new tool; installing `git-filter-repo`
  would be a new dependency for a one-off command. 31 commits make its speed warning moot.
- **A criterion can match its own document.** The earlier release spec failed its own
  leak checks that way in three review rounds. Criteria 1 and 5 therefore spell the path
  and the domain as patterns; anyone editing those lines has to preserve that property.
- **`git push` over SSH can be refused** even though `gh` is authenticated — token auth
  does not imply a key. Stage 5 names the fallback.
- **The tag points at the evidence commit, not at the commit CI first validated.** The
  evidence commit changes docs only, and it runs its own CI before the tag, so the tagged
  commit is green too. Stage 6 waits for that run.
- **`gh run list --json` prints compact JSON when piped**, so `| wc -l` counts lines, not
  runs. The tag check uses `--jq 'length'` and a pinned `--limit` for that reason.
- **A green local run is not a green CI run.** The runner is a fresh `ubuntu-latest` with
  no `node_modules/` and no `~/.pi`; a case that quietly depended on this machine would
  only fail there. Stage 5 waits with `gh run watch --exit-status`.
- **Removing `AGENTS.md` from the index means a contributor gets no process document.**
  Accepted: the README's Development section carries build and test, and the file stays in
  the history.
- **The README's install URL has existed since `docs/05`.** Until stage 6 creates the tag,
  that command fails for a reader. The window is minutes; `docs/05` records the same risk.

## Touch boundary

| Work | Owner |
|---|---|
| `docs/*`, `.gitignore`, the git index, the history rewrite, the commits, the push, the tag, the release | orchestrator |
| the live install (criterion 12) | operator |

- **No implementer stage.** This increment touches no production code; the roles table
  allows the orchestrator a change with no behavioural effect, and a docs and index change
  is exactly that. A diff under `src/`, `test/` or the packaging files is a finding.
- **Not** the contents of `AGENTS.md` or `.pi/agents/architect.md`: they leave the index,
  they are not edited.
- **Not** anything under `~/.pi/agent/**`, `~/.agents/**`, or `~/.gitconfig`.
- **Not** generated folders: `node_modules/`, `coverage/`, `*.tgz`.

## Additional dependencies

None. No package, no action and no tool is added: the rewrite uses the installed git, and
the GitHub work uses the authenticated `gh`.

## Dependency changes

None. `docs/05` owns the pi bump.

## Open questions

None. Distribution, repository, identity and the status flip were decided on 2026-11-15
and are recorded in `## Decisions behind the publication`.

## Dev plan

Stages 1–6 are orchestrator work (stage 4 is the rewrite), stage 7 belongs to the operator.
No stage changes code.

1. **Docs scrub and registry**. Owner: orchestrator.
   The workstation path prefix — `/home/` plus the account name — appears in five places
   in `docs/01`–`docs/03`, and they are not all the same kind. **Three are prose**
   (`docs/01:215` and `docs/02:96`, both `- Everything inside …`; `docs/03:138`, "it is
   the one file outside …") and become `<project root>`. **Two are commands**
   (`docs/03:53` and `docs/03:144`, both `require("…/.pi/agent/keybindings.json")`) and
   become `require(process.env.HOME + "/.pi/agent/keybindings.json")`. Turning the prose
   of `docs/03:138` into that `require(…)` call would mangle an `active` spec while the
   proof still passes — the count is stated here so it cannot happen.
   `docs/README.md`: the `](../AGENTS.md)` link on line 5 becomes prose that names the
   process document as not part of this repository — honesty over a grep — and gains the
   row for `06` here; the `05` row arrived with its own commit, and adding it twice would
   make criterion 3's `grep -c` print 2. References to the process document inside
   `docs/01` and `docs/04` are historical and stay.
   `docs/ROADMAP.md`: the two §1 rows merge into one row and move into *Shipped*, with the
   date `2026-11-15` in that row's `Spec` cell (metadata and licence shipped with `0.1.0`,
   source `docs/05`) — the roadmap calls `decided` "settled, just not built", and these are
   built. The `## 1. Distribution` heading and its now-empty table stay, so the numbering
   of the other sections keeps its anchors; the *Suggested order* entry
   "1. Distribution (§1)" is reworded to name `docs/05` and `docs/06` as shipped. The npm
   sentence is reworded because this release does not deliver npm installability.
   Proof, scoped to `docs/` because `AGENTS.md` and `.pi/` are still tracked at this point
   and only stage 2 untracks them: `git grep -n "/home/adria[n]" -- docs/` prints nothing
   (exit 1); `grep -c "05-release-packaging" docs/README.md` prints 1;
   `grep -c "06-publish-on-github" docs/README.md` prints 1;
   `grep -c "](../AGENTS.md)" docs/README.md` prints 0;
   `grep -c "becomes installable from npm" docs/ROADMAP.md` prints 0;
   `grep -c "which licence" docs/ROADMAP.md` prints 0;
   `grep -c "2026-11-15" docs/ROADMAP.md` prints at least 1.

2. **The workstation files leave the index**, and the ignore rules catch them.
   Owner: orchestrator.
   Append `.pi/` and `AGENTS.md` to `.gitignore`, then `git rm --cached AGENTS.md
   .pi/agents/architect.md`. No edit to their contents; they stay on disk.
   Proof: `git ls-files | grep -E "^(AGENTS\.md|\.pi/)"` prints nothing (exit 1);
   `test -f AGENTS.md && test -f .pi/agents/architect.md && echo present` prints `present`;
   `git status --short` shows `D  AGENTS.md` and `D  .pi/agents/architect.md` next to the
   modified docs; criterion 1 now holds over the whole tree, not only over `docs/`.

3. **Identity, acceptance and the release commit**. Owner: orchestrator.
   `git config user.email "19731088+adrianhoehne@users.noreply.github.com"` — repository
   local; `user.name` is already `adrianhoehne`; `~/.gitconfig` is not touched. `05` is
   already `active` from its own commit; `06` stays `proposed` here.
   Run the acceptance, check criteria 1–7 with the commands from the spec, put the results
   in `## Log`, and commit **everything, including the still-untracked `docs/06`** — the
   intent-to-add from criterion 1 leaves an ` A` entry, and `git filter-branch` refuses
   such a tree — as `Publish: docs scrub, workstation files out of the index`.
   Proof: `npm run typecheck` exits 0; `npm test` exits 0 with
   `Tests  58 passed (58)`; `git show --name-only --format= HEAD | grep -vE "^(docs/|\.gitignore$|AGENTS\.md$|\.pi/agents/architect\.md$|$)"`
   prints nothing — the two untracked files show up as deletions, which is why
   they are named; `git log -1 --format='%ae %ce'` prints the two noreply addresses;
   `git rev-list --count master` prints 31.

4. **History rewrite** — metadata only, every commit. Owner: orchestrator.
   Precondition: `git status --short` empty — `filter-branch` refuses a dirty tree, so
   nothing may be written into a tracked file before it runs. All evidence goes to `/tmp`:
   ```bash
   git rev-list --count master                                              # 31
   git rev-parse HEAD^{tree} > /tmp/agent-switch-tree-before.txt
   git log --format='%T %ad %cd %s' > /tmp/agent-switch-trees-before.txt
   ```
   Run — the address is matched by its local part, so it never appears in a committed file:
   ```bash
   FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '
   new="19731088+adrianhoehne@users.noreply.github.com"
   case "$GIT_AUTHOR_EMAIL" in
     adrian.*) GIT_AUTHOR_EMAIL="$new" ;;
   esac
   case "$GIT_COMMITTER_EMAIL" in
     adrian.*) GIT_COMMITTER_EMAIL="$new" ;;
   esac
   export GIT_AUTHOR_EMAIL GIT_COMMITTER_EMAIL
   ' -- --all
   ```
   Names, messages and dates are not touched — `filter-branch` carries the original author
   and committer dates into `git commit-tree`; the commits from stage 3 already carry the
   noreply address, which does not match `adrian.*`, so the filter is idempotent.
   Verify, in this order, **before** deleting the backup:
   `git log --format='%ae %ce' | sort -u` prints one line,
   `19731088+adrianhoehne@users.noreply.github.com 19731088+adrianhoehne@users.noreply.github.com`;
   `git log --format='%B' | grep -ciE "@(gmail|googlemail)\."` prints 0;
   `diff /tmp/agent-switch-tree-before.txt <(git rev-parse HEAD^{tree}) && echo tree-identical`
   prints `tree-identical`;
   `git log --format='%T %ad %cd %s' > /tmp/agent-switch-trees-after.txt && diff /tmp/agent-switch-trees-before.txt /tmp/agent-switch-trees-after.txt && echo trees-identical`
   prints `trees-identical`; `git rev-list --count master` still prints 31;
   `git status --short` prints nothing.
   Then remove the backup so the old objects cannot be pushed by accident:
   `git for-each-ref refs/original` shows `refs/original/refs/heads/master`,
   `git update-ref -d refs/original/refs/heads/master`, `git for-each-ref refs/original`
   prints nothing. Optional hygiene: `git reflog expire --expire=now --all && git gc --prune=now`.
   Restore if it went wrong, **before** deleting the backup:
   `git reset --hard refs/original/refs/heads/master`, then delete the backup and fix the
   filter. After the backup is gone the only way back is a manual re-commit.
   After the rewrite, re-run typecheck and the suite once: `npm run typecheck` exits 0,
   `npm test` exits 0 with `Tests  58 passed (58)`.

5. **Repository, push, first CI run**. Owner: orchestrator.
   ```bash
   gh repo create adrianhoehne/agent-switch --public --source . --remote origin \
     --description "A pi extension that switches the main agent of a running conversation onto another agent's system prompt"
   git push -u origin master
   ```
   `gh` is authenticated as `adrianhoehne` with the `workflow` scope, so pushing
   `.github/workflows/ci.yml` is allowed. If `git push` fails with
   `Permission denied (publickey)`, run `gh auth setup-git`, then
   `git remote set-url origin https://github.com/adrianhoehne/agent-switch.git`, then push
   again.
   The run appears a few seconds after the push, so retry until `gh run list` returns one —
   an empty list expands to `null`, and `gh run watch null` fails for the wrong reason:
   ```bash
   gh run list --branch master --limit 1 --json name,status,conclusion,headSha
   gh run watch "$(gh run list --branch master --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
   ```
   `--exit-status` returns non-zero when the run fails; diagnose with
   `gh run view <databaseId> --log-failed`, which names the failing step and its log line.
   Proof: `gh run list --branch master --limit 1 --json conclusion,name` reports
   `"conclusion":"success"` for `CI`; `gh repo view adrianhoehne/agent-switch --json visibility,url`
   reports `PUBLIC`; `git remote -v` shows `origin`.

6. **Evidence commit, tag and release** — only after stage 5 is green. Owner: orchestrator.
   Write the proof of criteria 8–10 into `## Log` (the two tree hashes, the `diff` result,
   the run id), flip this spec to `status: active` in the descriptive prose the loop
   requires, set its `docs/README.md` row to `active`, commit as
   `Publish 0.1.0: record the release`, push, and wait for that run to be green too.
   The run recorded for criterion 10 is stage 5's, because the evidence commit does not
   exist when that proof is written; the tag below waits for the evidence commit's **own**
   run, so the tagged commit is green as well.
   The tag cannot start a run by construction: the workflow's `push` trigger names
   `branches: [master]` and no `tags`. Count anyway, because a count is what would catch an
   edited workflow, and note that `gh run list --json` prints compact single-line JSON when
   piped — `--jq 'length'` prints the number of runs:
   ```bash
   runs_before=$(gh run list --limit 50 --json databaseId --jq 'length')
   git tag -a v0.1.0 -m "agent-switch 0.1.0"
   git push origin v0.1.0
   sleep 60                                       # the registration window stage 5 documents
   runs_after=$(gh run list --limit 50 --json databaseId --jq 'length')
   test "$runs_before" = "$runs_after" && echo same-count
   gh release create v0.1.0 --title "v0.1.0" --notes-file /tmp/agent-switch-release-notes.md
   ```
   The release notes live in a file the orchestrator writes one step earlier — what the
   plugin does, the install command, the keybinding prerequisite, the MIT licence — so no
   placeholder can end up published. A tag-triggered run of the evidence commit would be
   indistinguishable from that commit's own run by `headSha`, which is why the count, and
   not the SHA, is the evidence.
   Proof: `git tag -l v0.1.0` prints `v0.1.0`; `gh release view v0.1.0 --json tagName,name`
   names it; `test "$runs_before" = "$runs_after"` in the same shell prints `same-count`;
   `grep -n "^status: active" docs/06-publish-on-github.md` finds the frontmatter;
   `grep -n "06-publish-on-github" docs/README.md` shows the row ending in `| active |`;
   `git cat-file -p v0.1.0 | grep -i tagger` shows the noreply identity — the annotated tag
   object carries a tagger of its own, and `%ae %ce` would never notice; `git status --short`
   prints nothing.

7. **Live install** — operator, not agent work. Criterion 12.
   `pi install git:github.com/adrianhoehne/agent-switch@v0.1.0`, then `pi list` shows the
   package, then start `pi` and press `shift+tab`: the footer changes from `Main` to an
   agent name. It needs a real terminal, real keys and the keybinding release from
   `docs/03`, and it changes the operator's global pi installation, which the touch
   boundary puts behind the operator.

### What could go wrong

- **Most likely break: the rewrite (stage 4).** It is the only irreversible step, and a
  wrong environment variable silently rewrites nothing. Every check runs before the backup
  ref is deleted; the backup ref is the restore path.
- **The status flip happens after the release commit.** If stage 6's second push fails,
  the repository shows `06` as `proposed` for a while. That is the honest state: the
  release notes and the tag do not exist yet.
- **A criterion can match its own document.** Both leak criteria spell the path and the
  mail domain as patterns. Editing those lines without keeping the brackets or the
  alternation turns a passing check into a failing one, or worse, into a vacuous one.
- **`.gitignore`'s `AGENTS.md` pattern is unanchored** and would also ignore a nested
  `AGENTS.md` in a future directory. That is what the spec lists; keep it literal and use
  `/AGENTS.md` in a later increment if it ever matters.

### Ordering and dependencies

1 → 2 → 3 is strict: the docs must be clean and the index must be free of the workstation
files before the release commit, and criterion 1 needs both. 3 → 4 needs a clean tree,
4 → 5 needs rewritten history (otherwise the private address is pushed), 5 → 6 needs green
CI, 6 → 7 needs the tag. No stage depends on a later one, and no stage changes code, so
the suite stays green throughout.

### What the next increment inherits

- A public repository whose history carries no private address, with `docs/` as the design
  record — review rounds and internal subagent names included.
- The workstation files only in the history; the local workflow on disk is untouched and
  no longer tracked.
- Unchanged: no npm publish, no gallery entry, no `CHANGELOG`, no templates, no lint, no
  coverage, no CI matrix, no Dependabot, and the known limits of `docs/ROADMAP.md` §2–§5.
- `peerDependencies` still `"*"`, so the plugin is not pinned to one pi release.

## Review

**2026-11-15 — split review, round 1 — 🔧 Fix these and I'll sign off — blockers: yes (3).**

Blocking: the Goal promised a history free of the workstation path, which a metadata-only
rewrite cannot deliver — five commits carry it in their blobs, and criterion 1 greps the
tree, so nothing decided the sentence and it was false; stage 1 added the `05` registry
row a second time and would have made criterion 3's count print 2; and two `## Log` rows
quoted repairs that are not in the document — one described a sentence that appears
nowhere, the other quoted the `Spec status` row with words it does not contain.

Non-blocking, applied: a Log row described the proofs as naming their paths while stage 2
still counts a whole-tree `git status`; the roadmap rows would have been marked `decided`
("settled, just not built") while also appearing in *Shipped*; dangling references to the
process document in `docs/01` and `docs/04` were unaddressed; a plural typo; and stage 5
offered `gh run watch null` as the fallback for a run that has not registered yet.

Verified against the machine in this round: the commit arithmetic 29 → 30 → 31, the
`git show --name-only` shape of criterion 7 including the two staged deletions, the
rewrite snippet on a 31-commit clone (metadata-only, idempotent, count unchanged), the
five path occurrences, both leak criteria staying self-blind, and `gh` authenticated with
the `workflow` scope.

Round 1 outcome: all three blockers and all five notes applied.

**2026-11-15 — split review, round 2 — 🔧 Fix these and I'll sign off — blockers: yes (2).**

Blocking: the five path occurrences were miscounted as two prose mentions and three
commands — they are three prose mentions (`docs/01:215`, `docs/02:96`, `docs/03:138`) and
two commands (`docs/03:53`, `docs/03:144`), so a literal implementer would have turned
"it is the one file outside …" into a `require(…)` call and mangled an `active` spec while
criterion 1 stayed green; and the Goal attributed an acceptance to the operator that no
decision or log row records.

Non-blocking, all applied: the release commit did not say it takes the still-untracked
`docs/06`, which would have left an intent-to-add entry that `filter-branch` refuses; the
gate sentence assigned two criteria to the wrong stage; the roadmap row count contradicted
stage 1 and would have left §1 empty while *Suggested order* still pointed at it; the file
table claimed `docs/05` states a leak pattern it does not contain; the blob-history count
was derived from `-S` (which prints 0) instead of a per-commit scan; the stage-owner
sentence read as if stage 4 belonged to nobody; and one Log row distributed its checks
between criterion 11 and stage 6 wrongly.

Round 2 outcome: both blockers and all seven notes applied. Verified in this round: three
prose and two command occurrences, all 29 commits carrying the path in a blob, the rewrite
snippet green on a clone, both leak criteria self-blind.

**2026-11-15 — split review, round 3 — ✅ Ship it — blockers: none.**

Both round-2 blockers were re-verified from the files: the five path occurrences are three
prose mentions and two commands at the exact lines the spec now names, and the Goal no
longer attributes an acceptance the record does not contain. Re-derived: twelve criteria,
seven stages, 29 → 30 → 31 commits, all 29 commits carrying the path in a blob, the
rewrite snippet green on a clone, both leak criteria self-blind, the roadmap phrases the
criteria grep existing verbatim.

Nine cosmetic notes were raised and deliberately not blocked on; all are applied after
the verdict and listed in `## Log`. None of them changes a criterion, a stage or an owner.

Gate open: the publication increment starts when `docs/05` is committed.

For the record, the publication half was reviewed three times before the split, under
the name `docs/05-github-release.md`:

- **Round 1 — 🔧, 4 blockers**: the spec stated the workstation path in seven places,
  including its own criterion against that path; the rewrite command embedded the private
  mail address as a literal in a committed file while the criterion only grepped commit
  metadata; the evidence step wrote into the tracked `## Log` although it requires a clean
  tree, and re-derived the tree hash from a `HEAD` the evidence commit had already moved;
  the tag-run proof compared `headSha`, which cannot distinguish a tag run from the
  evidence commit's own run. All four are closed here: criteria 1 and 5 use self-blind
  patterns, the filter matches the local part, the evidence lives in `/tmp`, and the tag
  check counts runs with `--jq 'length'`.
- **Round 2 — 🔧, 2 blockers**: a whole-tree `git status` with exactly two files; a
  `wc -l` on piped `gh` JSON that always prints `1`. Both were collateral from round 1;
  the whole-tree check is gone from this half and the count is repaired.
- **Round 3 — 🔧, 2 blockers**: a whole-tree path grep that could not pass before the
  workstation files were untracked; and, in the packaging half, a `git diff package.json`
  claim that is false before the first commit. The first is fixed here, where stage 1
  scopes its grep to `docs/`; the second stayed with `docs/05`.

Round 3 was the third block, so `AGENTS.md` step 4 applied and the spec was split. Three
sentences in this document owe their shape to that history: a clean *tree* is provable and
a clean *history* is not (the paths live on in blobs, see `## Risks`); the address is
matched by its local part and never spelled; and the evidence lives in `/tmp` because the
tree must be clean when the rewrite runs.

## Log

| Date | Finding | Decision |
|---|---|---|
| 2026-11-15 | operator: distribution | GitHub only, install from the git URL |
| 2026-11-15 | operator: private mail address | must leave the repository; it sits in the author and committer fields of all commits, so the history is rewritten before the first push |
| 2026-11-15 | operator: `docs/` | stays in the repository as it is |
| 2026-11-15 | operator: scope | blockers + CI + tarball hygiene, and first check what can leave the repository |
| 2026-11-15 | review R1 M1: spec states the workstation path | taken — criteria 1 and 5 spell the path and the domain as patterns that cannot match their own lines |
| 2026-11-15 | review R1 M2: private mail address as a literal | taken — the filter matches the local part, criterion 5 greps files with an alternation, criterion 8 greps the history and the messages |
| 2026-11-15 | review R1 M3: self-referential tree-hash proof | taken — evidence stays in `/tmp`, nothing is written into a tracked file before the rewrite, criterion 9 compares the two `/tmp` files |
| 2026-11-15 | review R1 M4: tag-run proof undecidable | taken — counts with `--jq 'length'` and a pinned limit, before and after the tag push |
| 2026-11-15 | review R1 m5: `<agent-dir>` breaks `docs/03` commands | taken — `process.env.HOME + "/.pi/agent/keybindings.json"` |
| 2026-11-15 | review R1 m6: criterion forces registry silence | taken — the registry names the process document, the criterion greps the link instead |
| 2026-11-15 | review R1 m8: author date only | taken — `%T %ad %cd %s` |
| 2026-11-15 | review R1 m10: no baseline for "names unchanged" | taken — the pre-commit `git status --short test/` check lives in `docs/05` |
| 2026-11-15 | review R1 m13: roadmap promises npm | taken — reworded, criterion 4 greps the old sentence |
| 2026-11-15 | review R1 m15: copyright confirmation as outstanding work | taken — removed; the operator decided it |
| 2026-11-15 | review R2 B1: whole-tree `git status` | taken — stage 2 names the two staged deletions instead of counting the tree |
| 2026-11-15 | review R2 B2: `wc -l` on piped JSON | taken — `--jq 'length'`, `--limit 50`, 60-second settle, trigger as the structural reason |
| 2026-11-15 | review R2 m1: spec claims to scrub a path it lacks | taken — the patterns must stay patterns |
| 2026-11-15 | review R2 m2: evidence commit proves no flip | taken — criterion 11 checks the tagger, stage 6's proof checks the status flip and the registry row |
| 2026-11-15 | review R2 m3: decisions row claims a criterion early | taken — the `Spec status` row says "until an evidence-only commit after CI is green"; stage 6 records criteria 8–10 there, 8–9 are proved in stage 4 and 10 in stage 5 |
| 2026-11-15 | review R2 m4: re-run includes a pre-commit criterion | taken — only typecheck and the test summary are re-run after the rewrite |
| 2026-11-15 | review R2 m6: roadmap rows without a date | taken — `2026-11-15` |
| 2026-11-15 | review R2 m7: criteria never see the untracked spec | taken — `git add -N` before the greps, and criterion 1 names both specs |
| 2026-11-15 | review R2 m8: `gh run list` defaults to 20 | taken — `--limit 50` |
| 2026-11-15 | review R3 B1: whole-tree grep before the untrack is possible | taken — stage 1 scopes its proof to `docs/`, stage 2 and criterion 1 take the whole tree |
| 2026-11-15 | review R3 n1: Log row contradicts the repaired stage | taken — the row is gone; it described a sentence that never existed |
| 2026-11-15 | review R3 n4: `$runs_before = $runs_after` is not a command | taken — `test "$runs_before" = "$runs_after" && echo same-count`, same shell |
| 2026-11-15 | review R3 n5: placeholder inside a copy-pasteable command | taken — `--notes-file /tmp/agent-switch-release-notes.md` |
| 2026-11-15 | split review R1 M1: Goal promises a history free of the path | taken — the Goal names the blob history, and a risk bullet explains why a metadata-only rewrite cannot remove it |
| 2026-11-15 | split review R1 M2: stage 1 adds the `05` registry row twice | taken — stage 1 adds the `06` row only |
| 2026-11-15 | split review R1 M3: two Log rows cited text that is not there | taken — the bogus row is deleted, the `Spec status` row is named as it stands |
| 2026-11-15 | split review R1 n1: Log row misdescribes stage 2's proof | taken — "names the two staged deletions" |
| 2026-11-15 | split review R1 n2: roadmap rows `decided` and shipped at once | taken — both move into *Shipped* |
| 2026-11-15 | split review R1 n3: dangling references to the process document | taken — the `docs/01` and `docs/04` references are declared historical |
| 2026-11-15 | split review R1 n4: "Stage 1–3" plural | taken — "Stages 1–3" |
| 2026-11-15 | split review R1 n5: `gh run watch null` before the run registers | taken — retry until the list has an entry |
| 2026-11-15 | split review R2 B1: the five path occurrences are miscounted | taken — three prose mentions and two commands, named by line in the file table, the paragraph below it and stage 1 |
| 2026-11-15 | split review R2 B2: Goal claims an operator acceptance nobody recorded | taken — the Goal says the plan accepts it and `## Risks` records why; no operator attribution |
| 2026-11-15 | split review R2 n1: the commit does not name the untracked `docs/06` | taken — stage 3 commits everything, explicitly including it |
| 2026-11-15 | split review R2 n2: gate sentence assigns two criteria wrongly | taken — 1–6 gate the commit, 7 checks it and gates the push, 8–9 the push, 10 the tag, 11 verifies tag and release |
| 2026-11-15 | split review R2 n3: one `Shipped` row or two, and an empty §1 | taken — the two rows merge, §1 empties, *Suggested order* points at what shipped |
| 2026-11-15 | split review R2 n4: file table overclaims for `docs/05` | taken — `05` states neither pattern |
| 2026-11-15 | split review R2 n5: blob-history count derived from `-S` | taken — every commit on `master` carries the path in a blob, verified by per-commit scan |
| 2026-11-15 | split review R2 n6: stage 4 read as ownerless | taken — stages 1–6 are orchestrator work, stage 4 is the rewrite |
| 2026-11-15 | split review R2 n7: Log row distributes its checks wrongly | taken — criterion 11 checks the tagger, stage 6 the status flip and the registry row |
| 2026-11-15 | split review R3 n5: "stage 6 proves criteria 8–10" | taken — stage 6 records them; 8–9 are proved in stage 4, 10 in stage 5 |
| 2026-11-15 | split review R3 n6: "quoted as it stands" when nothing is quoted | taken — "named as it stands" |
| 2026-11-15 | split review R3 n7: the date has no cell in *Shipped* | taken — the date goes into the `Spec` cell, whose `Item` cell names the release |
| 2026-11-15 | split review R3 n8: an empty §1 after the move is undecided | taken — the `## 1. Distribution` heading and its empty table stay, and the legend keeps `decided` for other items |
| 2026-11-15 | split review R3 n9: the recorded run predates the evidence commit | taken — the Log names stage 5's run as criterion 10's evidence, and stage 6 waits for the evidence run before tagging |
| 2026-11-15 | release: criterion 1 | `git grep -n "/home/adria[n]"` over the whole tree prints nothing, after `docs/06` is staged |
| 2026-11-15 | release: criterion 2 | `git ls-files` lists neither `AGENTS.md` nor `.pi/`; both files are still on disk |
| 2026-11-15 | release: criterion 3 | `05-release-packaging` 1, `06-publish-on-github` 1, `](../AGENTS.md)` 0 |
| 2026-11-15 | release: criterion 4 | `MIT` 1, `2026-11-15` 2, `which licence` 0, `becomes installable from npm` 0 |
| 2026-11-15 | release: criterion 5 | `git grep -inE "@(gmail|googlemail)\."` prints nothing |
| 2026-11-15 | release: criterion 6 | `npm run typecheck` exits 0; `npm test` prints `Tests  58 passed (58)` |
| 2026-11-15 | release: criterion 7 | checked immediately after the release commit; recorded here by the evidence commit, because it reads `HEAD` |
| 2026-11-15 | release: commit identity | `user.email` is the noreply address repository-locally; `~/.gitconfig` untouched |
| 2026-11-15 | release: criterion 7 | `git show --name-only --format= HEAD \| grep -vE "^(docs/\|\.gitignore$\|AGENTS\.md$\|\.pi/agents/architect\.md$\|$)"` printed nothing against the release commit |
| 2026-11-15 | release: criterion 8 | `git log --format='%ae %ce' \| sort -u` prints one line, the noreply address on both fields; `git log --format='%B' \| grep -ciE "@(gmail\|googlemail)\."` prints 0 |
| 2026-11-15 | release: criterion 9 | `diff /tmp/agent-switch-trees-before.txt /tmp/agent-switch-trees-after.txt` printed nothing for all 31 commits (`%T %ad %cd %s`); the tree hash `87d5c0c33a91cc0ed63c8f08daa420610feedd53` is unchanged before and after the rewrite; 31 commits before, 31 after; backup ref deleted, reflog expired, `gc --prune=now` |
| 2026-11-15 | release: criterion 10 | first run on `master` — `CI`, run 43745322583, commit `6d942ef`, conclusion `success` |
| 2026-11-15 | release: push route | SSH was refused (`Permission denied (publickey)`); `gh auth setup-git` and the HTTPS remote pushed `master` |
| 2026-11-15 | release: criterion 11 | `v0.1.0` and `v0.1.1` exist as annotated tags, each with a release; `gh repo view` reports `PUBLIC`; both tag objects carry the noreply tagger; no tag started a CI run (run count equal before and after each tag push) |
| 2026-11-15 | release: criterion 12 | operator, 2026-11-15: installed from the git URL, `pi list` shows the package, `shift+tab` changes the footer from `Main` to an agent name. The increment is closed |
