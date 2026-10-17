---
{
  "type": "decision",
  "name": "A worker shows the user things beside itself, as facts in its log",
  "summary": "tower show puts a file a worker wrote, or a web page, in front of the user, and tower open asks them to open a page in a browser tab; each is an tower.show event in the worker's own log, folded onto its card, and every renderer draws them beside the worker that showed them.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-16",
  "refs": ["hub/src/directory.ts#shownOf", "hub/src/directory.ts#postToHost", "hub/src/bridge/facts.ts#Shown", "hub/src/bridge/facts.ts#factsAfter", "hub/src/bridge/board.ts#Card", "hub/src/bridge/board.ts#shownBy", "hub/src/bridge/chains.ts#lineage", "hub/src/shelf.ts#shownServes", "hub/src/tower/server.ts#shownFile", "hub/src/shared/cards.ts#shownTitle", "hub/src/shared/launch.ts#towerBrief", "hub/src/mod/skills/handbook/SKILL.md", "hub/renderers/page/index.html", "hub/renderers/tower3d/src/showing.ts#posterOf", "hub/renderers/tower3d/src/desk.ts#holdUp", "hub/renderers/tower3d/src/gallery.ts", "hub/test/fixtures/shown.jsonl", "hub/test/fixtures/lineage-heir.jsonl"]
}
---
**Problem.** A worker that wrote a report, a plan or a page had no way to put it in front of the user except
naming a path in its answer. Opening that path was their job, somewhere else, and the result lost its tie to the
worker that made it.

**Decision.**
- Two commands on the mod's `tower` ([[agent-directory]]): `tower show <file|url> [title]` and
  `tower open <url> [title]`. A file must exist and is resolved to its real path, links followed, so a file a worker saves through a link in its worktree (a notes folder shared with the main checkout) outlives the worktree; `open` takes only http(s).
- The command posts `{hook_event_name: 'tower.show', kind, target, title?}` to the host's hooks socket under the
  session's own id, as the [[tower-mod]]'s events go ([[hook-events]]). The host logs it like any event: no host
  change, and the tower page need not be open.
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
  (the shelf's rule), or an image beside or below a markdown one ([[blob-reads]]), with the shelf's CSP `sandbox`
  (a video with `nosniff` instead, which both renderers play in a `<video>` with controls).
- The tower page adds a tab per showing beside the worker's other tabs, opening a new one when you are on that
  worker and notifying when you are not; markdown renders, an image fits the pane, any other file is framed as
  served, and a `link` is one Open ↗, since a browser opens no tab by itself. × closes a showing for this viewer
  (kept in the browser); a new showing of it comes back.
- Tower 3D draws the latest on a second monitor on the worker's desk and opens every showing as a tab of the desk
  panel ([[tower3d]]); each floor's gallery hangs its latest showings, off-duty workers' included ([[shared-wall]]).

**Alternatives considered.**
- *A `TowerVerb` relayed to open pages.* With no page open, or after a reload, the showing is gone. A
  showing is a fact about a session, and facts live in its log ([[logs-are-facts]]).
- *Showings stay with the session that showed them.* The user sees a resume of a worker as the same worker, and a
  resumed worker would come back with empty tabs while the gallery named its stopped predecessor.
- *Snapshot the file's content when shown.* Logs stay small, and a worker updates a file and shows it
  again.
- *A tower verb that opens things on the user's machine, for showing.* Not needed: showing puts the page beside the
  worker. Opening a file in the user's Finder or editor has its own verbs, `tower reveal` and `tower edit`
  ([[open-files]]).

**Consequences.** Showing an html file exposes its directory and below to the tower's loopback port, as an html
shelf entry does. A file deleted after it was shown answers `not_found`. Closing a showing is per browser
in the tower page; Tower 3D keeps no ×, and what it has opened is kept with its spot.
