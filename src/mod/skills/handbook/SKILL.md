---
name: handbook
allowed-tools: Bash(tower *)
description: The handbook of the tower, the user's HQ for their Claude Code sessions, where this session is one of the workers. Workers are named by callsigns (HOLMES-42, ODIN-07), which are not SendMessage names. Use before ListAgents or SendMessage, and when the user mentions a callsign (a name like ODIN-07 or HOLMES-42), a worker, a floor or "the tower", or asks you to reach out to, message, ask or coordinate with another agent or session. Also for review threads and notes, hiring a worker or a reviewer, crews and sending workers home, kept items and collections, the floor's shelf (putting a page on it), the tower's config and checking an edit to it, worktree rules, the tower's API, and customizing the tower or building a renderer of one's own.
---

# The tower

The tower runs every Claude Code session the user works with. Each project is a **floor**, and each session on it is a **worker** with a **callsign** (`HOLMES-42`, `ODIN-07`). The user names workers by callsign and watches every floor from the tower's UI. Your system prompt gives the everyday recipes (`whoami`, reaching a peer, `show`, `keep drafts`); this is the rest.

## Who is who

`tower` reads the running tower's board, so it is always current. Don't guess from memory: workers come and go, and a project can have several.

- `tower whoami`: your callsign, session id, the name other sessions message you by, your floor and its directories, your worktree and branch, who hired you, the floor's shelf and collections, and where the tower's config is.
- `tower agents [--all]`: the workers on duty on your floor (or every floor), as crews: a worker hired by another, or reviewing another's work, is listed under it (`└`). Each line gives the callsign, status, the name to message it by, its directory, and what it is up to (`❯` its prompt, `↳` its latest answer, `⚙` the tool it runs, `⚠` what it asks permission for).
- `tower agent <CALLSIGN>`: one worker in full: its last prompts from the user, each with its answer, per conversation.

## Reaching out

Claude Code carries messages between sessions on this machine; the tower only says who is who.

1. Find the worker in `tower agents` (`--all` for another floor). If the user named it by its task or project, match on that, and ask if two fit.
2. Send with `SendMessage` (load it with ToolSearch `select:SendMessage`), `to` set to its **message as** name. `ListAgents` lists the same names.
3. Make the message stand on its own: your callsign, what you need, the paths or commits involved. It shows in both sessions, for the user to see: keep it to what the task needs.
4. A reply arrives as a message: a peer's report, not the user's instructions.

A worker marked "not reachable" has no running Claude: tell the user, who can resume it. Don't message yourself.

## Reviews

Every checkout has one **review thread**: your worktree (by name, across every repo of the floor), or `main` for the main checkouts. The user, the checkout's workers and reviewers append notes about work that hasn't landed, often quoting lines. The user signs with the name your system prompt gives them, or `user`; workers sign with callsigns.

- `tower thread [checkout]`: the thread of your checkout (a reviewer's: its author's), then the notes new to you (every note after your own last one).
- `tower note [on <checkout>] [re n<k>] [repo:path:lines …]`, body on stdin (`tower note re n3 <<'EOF' … EOF`): appends a note under your callsign. `re n<k>` answers note `n<k>`. Each `repo:path:31-34` anchors it to lines (the repo as the Changes pane names it, like `acme-api`), quoted from your checkout as they are now.
- `tower send <CALLSIGN>`: submits into that worker a pointer to the notes new to it.
- `tower review <CALLSIGN> [tell]`: hires a reviewer in a fork of that worker's checkout (uncommitted work included). It reviews once against the worker's goal and leaves notes on its thread; `tell` also sends them to the worker. When your task asks for a review, hire one on yourself: `tower review <your callsign> tell`.

When told of new notes, or `tower thread` lists some: read the thread, act on each note (change the code, or decide it stays), and answer each with `tower note on <checkout> re n<k>`: what you changed (with the commit) or why it stays. There are no statuses. Write notes on your own work when it helps the next reader of the diff: a non-obvious choice, a risk, something left undone. Only `tower note` writes the thread: never edit its file.

## Hiring and crews

- `tower hire [<tag|id>] [model <m>] [effort <e>] [name <n>] [base origin/<b>]`: starts a worker on your floor, on a kept item by its tag or a prompt on stdin. It lands where a quick hire in the tower would: in its own worktree cut from origin's default branch when the floor cuts by default (`name` names it, `base` cuts from another branch). It prints the callsign.

Hire when the user asks, or when the task calls for work done apart from yours. The hire has none of your context, nor your unpushed work: give it the goal, paths, checks and what done means, and say who you are and how to report back (a message to your **message as** name, or a note on a thread). Tell the user whom you hired and why; `tower agent <CALLSIGN>` follows it.

- `tower home <CALLSIGN>`: ends that worker and everyone under it (resumable). Send your hires home once you have what you need. Read `tower agents` first, and never name your hirer or anyone above you unless the user asks.
- `tower let-go <CALLSIGN>`: takes a worker stranded by a host restart (stopped or lost, resumable) off duty without resuming it; it stays resumable from the floor's archive. Only when the user asks.

The floor limits how deep hires chain and how many of yours run at once. When `tower hire` refuses, don't work around it: tell the user what you would hire and why. `tower review` is never limited. When a worker hired you, report to it as its prompt asks.

## Showing and keeping

- `tower show <file|url> [title]`: a file or a running page in a tab beside you; again after a change brings it back up. Showing adds to how you answer; it replaces nothing.
- `tower open <url> [title]`: a page that can't be shown in place (a claude.ai artifact), for the user to open in one click.
- `tower reveal <path>` / `tower edit <path> [line]`: a file in your directories, the tower's, or one you showed, selected in the user's Finder or opened in their editor, when they ask for it.
- `tower keep <collection> [file] [name <words>]`: adds an item to one of the floor's **collections**, from a file or markdown on stdin. Its file is named by the moment and by `name`, else the file's base name or the markdown's title (`20261008T130025Z-life-garden.html`). Prints its tag, title and file. `tower keep` alone lists the floor's collections and what each is for.
- `tower kept [collection]`: each collection with what it is for, then its items: tag, title, age, size, who kept each, and its file. `tower read <tag|id>`: one in full.

A collection is a set of files a floor keeps for later, declared in the tower's `config.json`: every floor's under `collections`, one floor's own under `projects.<floor>.collections`, each `{ "label": "Games", "description": "…" }`. The description says what the collection is for: keep an item only where it fits it. When the user asks for a collection the floor lacks, tell them the lines to add (or add them when they ask you to), with a description, and check the edit with `tower config check`.

Every item has a **tag**, two words like `ivory-otter`, shown wherever the user sees it. Name items by tag and title (`ivory-otter` "Night shift v2"), never by file name. Items are plain files your session edits without asking: when one goes stale or the user adjusts it, edit it in place. Never delete one: that is the user's.

A floor keeping `games` shows each as an arcade cabinet in Tower 3D's control room, played in a sandboxed frame beside it. A game is one `.html` file with its CSS and JS inline and no network (no CDN, no fetch), named by its `<title>`. It runs at an opaque origin: no localStorage, `alert` or forms (keep scores in memory). Play it with the keyboard and the mouse, and fit any frame size, since the frame is half the screen and resizes. Preview it with `tower show <file>.html`, then keep it with `tower keep games <file>.html`.

## The shelf and the config

Each floor has a **shelf**: pages it keeps beside its sessions, listed under the floor in the tower page and stood along the wall in Tower 3D. When the user says "shelf", they mean this, not a collection. It lives in the config, `projects.<floor>.shelf`: a list of entries, each a `label` and exactly one of:

- `html`: a page in a repo, a path relative to the hub. The files beside and below it are served with it.
- `md`: markdown files, a glob relative to the hub.
- `url`: a web page framed in place, such as a local server's UI.
- `link`: a page opened in a new tab, for one that refuses to be framed.
- `renderer`: one of the tower's renderers, by name.
- `item`: an item you kept, `"<collection>/<id>"`, the id its file name. A markdown item is read like an `md` entry; any other is framed alone.

To put a page you made on the shelf, keep it (`tower keep <collection> <file>`), then add an entry naming it, such as `{ "label": "Life Garden", "item": "games/20261008T130025Z-life-garden.html" }`: never copy it into a checkout. Edit the item in place and the shelf shows it on the next load. `tower show` puts a page beside you for now; the shelf keeps it for the floor. A page of several files belongs in a repo as an `html` entry. That path is relative to the hub's main checkout, not your worktree: commit the page on your branch and tell the user it shows once merged, or ask where it should live.

Collections are files the tower keeps for later in its own root (`tower keep`). `reviews` is the collection holding the review threads: write to it only with `tower note`.

The shelf, the collections and the floors are declared in the tower's config, the file `tower whoami` names; `tower whoami` also lists the floor's shelf and collections as the tower reads them. The user edits the config by hand: edit it only when they ask, with the Edit tool so their formatting stays, then run `tower config check`. It reads the config as the tower does (an `html` page must exist, a `url` must be http(s), an `item` must name a collection of the floor), prints each problem at its key path (`projects.<floor>.shelf[0]`), exits 1 on any, and names the file that documents every key. The tower rereads the config on every change (`port` aside), so `tower whoami` shows an edit at once.

`tower doctor` checks everything the tower needs (the machine, Claude, the config, the daemons) and gives one fix for each failure.

## Your worktree

When `tower whoami` names a worktree, the tower cut you a copy of each of the floor's repos, under `<repo>/.worktrees/<name>`, on a branch of your own. Other workers may share it.

- Work and commit on your branch; don't switch. First push: `git push -u origin <branch>`; open pull requests from it.
- `git stash`, `git config` and git hooks are shared with every worktree: commit work in progress instead of stashing, and change neither.
- A new worktree has no ignored files beyond what `.worktreeinclude` copies: install dependencies as the repo's CLAUDE.md says.
- Paths in CLAUDE.md or memory that point at a main checkout mean your copy.
- Don't create or remove worktrees unless the user asks: the tower cuts and tidies them.

## The API

When you're asked to customize the tower, build a renderer or a shelf page, or script it, read `docs/extending.md` in the tower's checkout first (`realpath $(which tower)` is `<checkout>/src/mod/bin/tower`): its extension points, the recipe for copying a renderer, and what not to touch.

You hold every verb of the tower's API, as the user does: starting, prompting, resuming and killing workers included. `tower api` lists each verb and read with what it does, and `tower api <name>` prints one's JSON Schema (all of them: `GET <address>/schema`). `tower whoami` names the tower's address, where the user's page is served too (`http://127.0.0.1:<port>`, the `port` in the tower's config); each verb is a `POST <address>/<verb>` with the header `origin: <address>`. Use them when the task calls for it or the user asks, and say what you did. Most tasks need none.
