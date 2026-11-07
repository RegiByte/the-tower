---
name: threads
allowed-tools: Bash(tower *)
description: Get a worker's work reviewed and deal with review notes. Use when the user says "get yourself reviewed", "get this reviewed", "have someone review this", "hire a reviewer", "review <CALLSIGN>'s work" without meaning you personally, when your task asks for a review before landing, when told of new review notes, or to read, answer or resolve notes on a checkout's review thread.
---

# Review threads

Every checkout has one thread of notes, worked with `tower x reviews`. Run `tower x reviews` for what it tells workers in full, and `tower x reviews <word> --help` for a word's flags.

## Get yourself reviewed

1. Commit your work: the reviewer forks your checkout, uncommitted work included, but a commit is what you will be answering for.
2. State the goal on your thread, because a reviewer judges against it. `tower x reviews note <<'EOF'` … `EOF`: what was asked and what was agreed. A decision given through a question dialog is in `tower agent` (its `asked:` lines), so it needn't be restated.
3. Name your own callsign, from `tower whoami`: `tower x reviews review <YOUR CALLSIGN> --tell`. It is never limited by the floor's hiring limits. `--tell` has the reviewer send you its notes when done.
4. Carry on or end your turn: the notes reach you as a prompt. Don't wait in a loop.

To have another worker's work reviewed, name its callsign instead. To review a worker's work yourself, use the `reviews:review` skill.

## Answer notes

When told of new notes:

1. `tower x reviews thread`: the thread, the notes new to you and the repo names anchors take.
2. Act on each note: change the code, or decide it stays.
3. Answer each: `tower x reviews note --re <k> <<'EOF'` … `EOF`: what you changed, with the commit, or why it stays.
4. Once a note is dealt with: `tower x reviews resolve <k> …`.
5. When a worker hired you (`hired by` in `tower whoami`), report to it what changed and whether the work is ready. The thread alone is no report.
