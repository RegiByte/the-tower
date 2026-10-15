# Using the tower

Every Claude Code session the tower starts is a **worker** with a callsign (`HOLMES-42`), on the **floor** of its
project. Each worker knows the tower: the `tower` command is on its PATH and the `tower:handbook` skill tells it how
to use it. So most of what follows starts as a plain sentence to a worker. What it can do, you can do from the tower
page or the `tower` command, and the reverse.

Nothing here is a prescribed workflow. These are primitives; combine them the way your work goes.

## Setting up your floors

A **project** is a floor of the tower. It has one **hub**, the directory its sessions start in, and the **repos** it
spans, the other directories its workers work in. Only the hub configures a session: its `CLAUDE.md`, `.claude/`
skills and commands load; the repos are granted file access only (Claude's `additionalDirectories`), so their own
`CLAUDE.md` and skills stay out.

So the hub is where the project's brain lives. A common shape: the hub is a notes repo or the main repo of a
product, holding your notes, plans and project-wide `CLAUDE.md`, and the API, the frontend and the worker services
beside it are its repos, touched now and then. If a project is a single repo, it is the hub and `repos` is `[]`.
Shelf paths are relative to the hub.

> "Add a floor for my-app: the hub is ~/code/my-app, with ~/code/my-app-api and ~/code/my-app-web as its repos."
> "Put the notes folder on this floor's shelf."

The floors live in `~/.tower/config.json`, the one file you edit by hand (a worker edits it when you ask). The tower
reads it again on every save. `tower config check` reads it the way the tower does and prints each problem at its
key; `tower doctor` checks that and everything else the tower needs. Every key is in [config.md](config.md).

**Worktrees.** By default each new worker gets a git worktree of its own, cut in every repo of the floor at
`<repo>/.worktrees/<name>` on a branch `tower/<name>`, so parallel workers never step on each other's files. Turn it
off per floor (`worktrees.cutByDefault`), or pick per worker in the New worker dialog: a new worktree, one the floor
already has, or the main checkout. Ignored files a worktree needs (`.env`, local notes) can be linked into every cut
with `worktrees.links`.

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

A worker's terminal is Claude Code's own screen, so its keys are Claude's: drag to select and Ctrl+C copies (⌘C
doesn't; Claude also copies as you select unless its `copyOnSelect` setting is off), and Ctrl+V pastes text and images.

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

## Who's waiting on you

A worker that asks a question, holds a permission dialog, is stuck on a screen, or finished a turn you haven't answered
is **waiting on you**. The tower page lists them in order, notifies you and rings (settings, the gear); `N` or ⌥J
goes to the next one, and `?` shows every key. `tower app` puts the same tower in a Mac window of its own, with who
waits on you on its Dock icon and in the menu bar.

A worker left waiting a long time can have its conversation compacted while it waits: Claude Code's idle compaction
(2.1.299) summarizes a conversation of 200K tokens or more after about 54 minutes idle. The worker keeps its place and
its wait on you, but its next turn starts from the summary. `"idleCompaction": false` in `~/.claude/settings.json`
turns it off; the tower leaves it as Claude sets it.

## A worker's brief

A worker's **Brief** tab (⌃2) reads its last turns as a chat, your prompts and its answers, in every conversation it
held (after each `/clear`, and across resumes), without scrolling its terminal. Workers read the same thing:

> "What did HOLMES-42 last tell me?" · "Summarize what this floor's workers did today."

## Resume and carry on

Every session's log is kept, so a worker that ended (killed, sent home, its terminal closed) can be **resumed**: a
new session continuing the same Claude conversation. A floor's past workers are in its archive, by crew, each
resumable. When the host stops while workers are mid-turn (a restart, a crash), they show as stranded (stopped mid-turn, on
hover) and offer **carry on**: a resume with a prompt to pick up where they were.

> "Resume ODIN-07 and ask it to finish the migration."

From a terminal: `tower ls`, `tower resume <id>`.

## Tidy

Each floor's **Tidy** lists what can go: worktrees whose work landed, absorbed branches, review threads of landed
checkouts (filed, still readable), processes left by sessions no longer running, hires done with their purpose, and
old logs to archive (`retention.days`). Nothing goes until you press, all of it or one row at a time. Work that
never landed is only thrown away on purpose (**discard**), after a note on its thread names how to get it back.

> "What would Tidy remove on this floor?"

## Shells

Plain shells in a floor's directories, docked as tabs under the terminal (the shell button on a directory, or the
dock's `+`). They outlive the tower page: close the tab or restart the tower and the shell keeps running until you
end it or it exits.

## Stats and The Week

**Stats** in the sidebar reads the logs over any window: spend, tokens, turns, how long workers waited on you, how
many ran at once, the weekly budget's pace, and what landed on each project's default branch. **The Week**
(`/r/week/`) reads the budget week as a yearbook: totals, every worker by floor, the hours' rhythm, superlatives.

> "How much did this floor spend this week, and on what?"

Workers read the same numbers from the API (`GET /stats`).

## Tower 3D

A first-person tower with the tower page's full feature set: a floor per project, a desk per worker with its live
screen, the elevator between floors, the shelf along the wall and the drafts on a corkboard. Sit at a desk to drive
its worker through a real terminal. Build it once with `npm run tower3d`, then open `/r/tower3d/`, or put it on a
floor's shelf (`{ "label": "Tower 3D", "renderer": "tower3d" }`).

## Your own renderer

The tower page, Tower 3D and The Week (`/r/week/`, the budget week as a yearbook) are three renderers of the same board. Write your own, or copy one of them out of the
checkout and change it: [extending.md](extending.md) has the recipe, and every other way to extend the tower. A worker
can build one for you: "make a renderer that shows every floor as a kanban board".
