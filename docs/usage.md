# Using the tower

Every Claude Code session the tower starts is a **worker** with a callsign (`HOLMES-42`), on the **floor** of its
project. Each worker knows the tower: the `tower` command is on its PATH and the `tower:handbook` skill tells it how
to use it. So most of what follows starts as a plain sentence to a worker. What it can do, you can do from the tower
page or the `tower` command, and the reverse.

Nothing here is a prescribed workflow. These are primitives; combine them the way your work goes.

## Seeing what a worker made

> "Show me the page you just built."
> "Make a chart of the test timings and show it to me."

The worker runs `tower show <file|url>`, and the file or page opens in a tab beside its terminal. Showing it again
after a change brings it back up. In Tower 3D, `V` looks at the newest thing a worker showed you.

> "Open that file in my editor." · "Reveal the build output in Finder."

`tower edit` and `tower reveal`, with the editor set in the config.

## Hiring workers

> "Hire a worker to fix the flaky date tests, and have it report back to you."
> "Split this into three pieces and hire a worker for each."

A worker hires others with `tower hire`, each in its own git worktree when the floor cuts worktrees, within the
floor's `hiring` limits. Hires are listed under the worker that hired them (`tower agents`), report back to it, and
are sent home with `tower home <CALLSIGN>` when their work is in. From the tower page, the `+` on a floor starts a
worker, and a kept draft can start one too.

## Checking on a worker

> "Check on HOLMES-42: why has it been working for an hour?"
> "Ask ODIN-07 which branch its fix is on."

A worker reads another's recent prompts and answers with `tower agent <CALLSIGN>`, and messages it by the name
`tower agents` gives. You see the same in the brief (a worker's last turns) on the tower page.

## Reviews before anything merges

Every checkout (a worktree, or the main checkout) has a **review thread**: a markdown thread where you, the worker
and its reviewers discuss the work before it lands.

- From the tower page, open a worker's **Changes** tab, select lines and leave a note on them; the **Reviews** tab
  shows the thread.
- **Review** on a worker hires a reviewer: a worker in a fork of that checkout (uncommitted work included) that
  reviews once against the worker's goal and leaves notes on the thread.
- A worker can ask for one itself: "when you're done, get yourself reviewed" makes it run
  `tower review <its callsign> tell`, then answer each note.
- `tower note` writes a note, `tower thread` reads one, and `tower send <CALLSIGN>` points a worker at its new notes.

## Keeping things for later

> "Keep that idea as a draft, we'll do it next week."
> "Save this game you wrote to the floor's games."

**Collections** are folders of files a floor keeps: `drafts` (prompts waiting for a session), `reviews` (the
threads above), and any you declare, each with a description of what it's for. Workers add with `tower keep`;
every item gets a two-word tag to refer to it by (`ivory-otter`). A draft starts a worker from the tower page, or
`tower hire <tag>`. Declare your own collections in the config (notes, reports, templates…): the tower keeps the
files, and you and your workers decide what they mean.

## The shelf

A floor's **shelf** holds pages kept beside its sessions: a page the project builds, a set of markdown docs, a URL,
a kept item, or a renderer (Tower 3D can sit on a shelf, framed inside the tower page). Edit the config to add
entries, then `tower config check`. See [config.md](config.md).

## Your own renderer

The tower page and Tower 3D are two renderers of the same board. Declare your own in the config and it's served at
`/r/<name>/`, with the whole API through `/tower.js`. A worker can build one for you: "make a renderer that shows
every floor as a kanban board".
