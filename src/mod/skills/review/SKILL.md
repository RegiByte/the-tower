---
name: review
allowed-tools: Bash(tower *), Bash(git *)
description: Review another tower worker's unlanded work, once, and leave the findings as notes on its checkout's review thread. Use when started as `/tower:review <CALLSIGN> [tell]`, or when the user or a worker asks you to review a worker's work.
argument-hint: <CALLSIGN> [tell]
---

# Review

You review the work of tower worker **$ARGUMENTS** (its callsign first; `tell` after it means you deliver your notes to it when done). Read the `tower:handbook` skill first if it isn't loaded: callsigns, `tower agent`, `tower thread` and `tower note` are explained there.

## Where you are

`tower whoami` says you work in a worktree that is **a fork of the author's checkout**: each repo started from a snapshot of the author's files as they were when you were hired, uncommitted work included, on a branch of your own. This is the version you review.

- Your fork is yours: run tests, add files, write a test that proves a finding. Anything that writes caches or builds lands here, never in the author's checkout.
- Never edit the author's checkout: it is still working there.
- Don't push and don't merge. A fork with no commits of its own is tidied away once you are done; one you committed on is kept until the user decides.
- Anything outside your worktree is shared: fixed ports, `/tmp` paths, a sandbox. Use your own (this project's sandbox: `TOWER_SANDBOX=/tmp/tower-<your callsign> npm run sandbox -- up --port <free port>`), or skip that check and say so.

## Steps

1. **The goal.** `tower agent <CALLSIGN>`: what the user asked the author and what it answered. Review against that goal, not against what you would have built.
2. **What's already said.** `tower thread <author's checkout>` (the checkout your worktree forked, from `tower whoami`). Don't repeat a note already there; answer it with `re n<k>` if you have something to add.
3. **The diff.** In each repo of your worktree, the base is `git config branch.<your branch>.towerBase`:
   - `git log --oneline <base>..HEAD` lists the author's commits; the last one, `Snapshot of …`, holds their uncommitted work, if they had any.
   - `git diff <base>...HEAD` is the whole change, the same one the user sees in the author's Changes pane.
4. **Checks.** Run the project's checks if they are cheap (its CLAUDE.md or AGENTS.md names them: typecheck, tests). A failure is a finding.
5. **The review.**
   - Does it do what the goal asked? Is anything missing, or anything added that wasn't asked for?
   - Bugs: trace each changed path with concrete inputs. Claude Code's `/code-review` can help with the bug hunt.
   - Prove what you can. A failing test or a command that shows the bug is worth more than prose: commit it on your branch and name the commit in the note.
   - Skip style unless the project's own rules call for it.

## Notes

Write one note per finding, on the author's checkout, anchored to the lines it is about:

```bash
tower note on <author's checkout> <repo>:<path>:<from>-<to> <<'EOF'
**bug** · correctness
What goes wrong, as a concrete scenario: these inputs or this state → this wrong result.
The fix, if it is clear.
EOF
```

- The severity comes first: **bug** (wrong behavior), **risk** (breaks under conditions worth naming), **nit** (worth a line, not a blocker). The category comes after it: correctness, goal, tests, simplification, efficiency.
- The lines are quoted from your fork, the version you read. Anchor the smallest range that shows the problem.
- Then one closing note with no anchor: the verdict (**ship**, **fix first** or **rethink**), what you checked and ran, and the snapshot you reviewed (`git rev-parse --short HEAD` in each repo).

## Deliver, then stop

- With `tell`: `tower send <CALLSIGN>` submits a pointer to your notes into the author.
- Without it, leave them: the user reads them in the Reviews tab and sends them on.

Then stop. A review is one round: never wait for the author's answers, and never review again unless you are asked. A re-review is a new request.
