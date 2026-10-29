---
{
  "type": "decision",
  "name": "A worker shows the user things beside itself, as facts in its log",
  "summary": "tower show puts a file a worker wrote, or a web page, in front of the user, and tower open asks them to open a page in a browser tab; each is an tower.show event in the worker's own log, folded onto its card, and every renderer draws them beside the worker that showed them.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-29",
  "refs": ["hub/src/directory.ts#shownOf", "hub/src/tower/dispatch.ts#logFact", "hub/src/shared/api.ts#VERBS", "hub/src/bridge/facts.ts#Shown", "hub/src/bridge/facts.ts#factsAfter", "hub/src/bridge/board.ts#Card", "hub/src/bridge/board.ts#shownBy", "hub/src/bridge/chains.ts#lineage", "hub/src/shelf.ts#shownServes", "hub/src/tower/http.ts#shownFile", "hub/src/shared/worker-details.ts#shownTitle", "hub/src/shared/launch.ts#towerBrief", "hub/src/mod/skills/handbook/SKILL.md", "hub/renderers/page/index.html", "hub/renderers/page/page.js", "hub/renderers/page/worker.js#renderShown", "hub/renderers/tower3d/src/showing.ts#posterOf", "hub/renderers/tower3d/src/desk.ts#holdUp", "hub/renderers/tower3d/src/gallery.ts", "hub/test/fixtures/shown.jsonl", "hub/test/fixtures/lineage-heir.jsonl"]
}
---
**Problem.** A worker that wrote a report, a plan or a page had no way to put it in front of the user except
naming a path in its answer. Opening that path was their job, somewhere else, and the result lost its tie to the
worker that made it.

**Decision.**
- Two commands on the mod's `tower` ([[agent-directory]]): `tower show <file|url> [title]` and
  `tower open <url> [title]`. A file must exist and is resolved to its real path, links followed, so a file a worker saves through a link in its worktree (a notes folder shared with the main checkout) outlives the worktree; `open` takes only http(s).
- The command calls the tower's `fact` verb, `{name: 'show', value: {kind, target, title?}}`, as the session
  (`tower-session`); the tower appends `{hook_event_name: 'tower.show', kind, target, title?}` to the session's own
  log through the host's `fact` ([[let-go]]), the event a [[tower-mod]] event would be ([[hook-events]]). Through the
  dispatch since API 1.106, it is wrapped and listed like every verb ([[extensions]]): an `around` link on
  `tower/fact` sees every showing. The tower must be up; the tower page need not be open. Only a running worker logs
  a fact, and only about itself.
- `kind` takes the shelf's words: `file` (drawn in place), `url` (framed in place), `link` (opened in a browser
  tab: one that refuses framing, such as a claude.ai artifact).
- The tower brief (`launch.ts`) says that the user watches from the tower and that every file or page written for
  them to read gets `tower show`, again after a change ([[brief-first]]). The `tower:handbook` skill says the rest. Showing adds to how a worker answers or
  publishes, and replaces neither.
- The bridge folds them into `facts.shown`, oldest first. Showing a target again moves it last with a new `at`,
  so a renderer shows the file as it is now, again. The card carries `shown`, `at` in epoch ms.
- A worker keeps what it showed across resumes: `card.shown` holds the showings of every session the worker ran
  as ([[resume]], [`lineage`](ref:hub/src/bridge/chains.ts#lineage)), each with the `session` that showed it,
  which is the one `/shown/<session>/<path>` serves it by. A target shown again in a later session moves last.
  While the worker has run as more than one session, both renderers mark a showing's tab with its session (`s1`,
  "session 1 of 2 · Oct 6, 21:40" in its title) from `card.lineage` ([[brief-turns]]).
- What a worker made and didn't show is derived beside it: `card.pages` lists each html file the worker wrote
  (`Write`), at its first write, with `shown` true when the worker showed that path.
- `GET /shown/<id>/<path>` serves a file the session showed, anything beside or below an html file it showed
  (the shelf's rule), or an image beside or below a markdown one ([[blob-reads]]), none of it hidden: no file whose
  path below the page's folder has a part starting with `.` ([`shownServes`](ref:hub/src/shelf.ts#shownServes)).
  It is served with the shelf's CSP `sandbox` (a video with `nosniff` instead, which both renderers play in a
  `<video>` with controls).
- Who can read it bounds the route, more than what it serves. The answer carries no CORS header, so a page at
  another origin can load it as an `<img>` or a frame but never read it; the tower answers only its own Host names,
  so DNS rebinding gets a 403 ([[agents-have-every-capability]]); a shown page runs at an opaque origin and reads
  nothing of the tower. Only pages at the tower's origin (renderers and `/run` pages, which the user declared) and
  the user's own browser tab read it. The session id is no secret and needs to be none. What is left to bound is
  how much one showing opens to those readers: a page shown from a home or a repo's root would open `.ssh`, `.aws`,
  `.git` and `.env` with it, and no page pulls those in. Links below the folder are followed, so a page's assets
  linked in from elsewhere still load.
- The tower page adds a tab per showing beside the worker's other tabs, opening a new one when you are on that
  worker and notifying when you are not; markdown renders, an image fits the pane, any other file is framed as
  served, and a `link` is one Open ↗, since a browser opens no tab by itself. × closes a showing for this viewer
  (kept in the browser); a new showing of it comes back. A showing left for another tab stays drawn, hidden, so it
  is as it was left when its tab is picked again: its scroll, a video's place, a page's own state (the eight shown
  last, in this browser tab). A hidden video is paused; a hidden page keeps running, its timers, requests and sound
  included, since a sandboxed frame can only be dropped, not paused. Since API 1.98 a showing is a subject, `shown:<card>/<at>`,
  a file's carrying its read path and media type ([[extensions]]): what extensions add to it is drawn beside the tabs
  while it is open.
- Tower 3D draws the latest on a second monitor on the worker's desk and opens every showing as a tab of the desk
  panel ([[tower3d]]); each floor's gallery hangs its latest showings, off-duty workers' included ([[shared-wall]]).

**Alternatives considered.**
- *A `TowerVerb` relayed to open pages.* With no page open, or after a reload, the showing is gone. A
  showing is a fact about a session, and facts live in its log ([[logs-are-facts]]).
- *Showings stay with the session that showed them.* The user sees a resume of a worker as the same worker, and a
  resumed worker would come back with empty tabs while the gallery named its stopped predecessor.
- *Snapshot the file's content when shown.* Logs stay small, and a worker updates a file and shows it
  again.
- *Serve only the types a page can pull in* (the tower's web types). A page at an opaque origin pulls in audio,
  AVIF or PDF frames the tower serves as `application/octet-stream`, and secrets are named by where they live more
  than by their extension.
- *Refuse links that leave the page's folder.* Breaks pages whose assets are linked in, and guards against no reader
  the origin doesn't already stop.
- *A tower verb that opens things on the user's machine, for showing.* Not needed: showing puts the page beside the
  worker. Opening a file in the user's Finder or editor has its own verbs, `tower reveal` and `tower edit`
  ([[open-files]]).

**Consequences.** Showing an html file exposes its directory and below, its hidden files and folders apart, to
pages at the tower's origin; an html shelf entry, which the user declares, still serves everything below its page. A file deleted after it was shown answers `not_found`. Closing a showing is per browser
in the tower page; Tower 3D keeps no ×, and what it has opened is kept with its spot.
