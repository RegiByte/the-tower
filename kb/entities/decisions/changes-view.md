---
{
  "type": "decision",
  "name": "Changes: a worker's diff read from git, and viewed marks per file version",
  "summary": "The tower reads what a worker changed in its repos from git on request (since its branch's base in a worktree, since its upstream on a branch that has one, since HEAD elsewhere), every renderer re-reads it every 30 s while the view is open and when a turn ends, through one shared machine, and a file marked viewed stays viewed only until its diff changes; the marks live in the viewer's browser, shared by every renderer through tower.store.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-30",
  "refs": ["hub/src/bridge/checkouts.ts#checkoutState", "hub/src/changes.ts#changesIn", "hub/src/shared/api.ts#QUERIES", "hub/src/shared/changes-reads.ts#viewedKey", "hub/src/shared/changes-reads.ts#liveScope", "hub/src/bridge/diff.ts#parseDiff", "hub/src/bridge/diff.ts#withBefore", "hub/src/shared/changes-panel.ts#readsWhole", "hub/src/tower/http.ts#changes", "hub/src/worktrees.ts#againstFor", "hub/src/shared/changes-panel.ts#markedChangesHtml", "hub/src/views/changes.ts#mount", "hub/src/shared/changes-lines.ts#splitRows", "hub/src/shared/changes-panel.ts#treeHtml", "hub/src/shared/words.ts#wordRanges", "hub/test/diff.test.ts", "hub/src/shared/changes-reads.ts#changesHandlers", "hub/src/shared/changes-reads.ts#readChanges"],
  "links": [
    { "to": "tower-server", "verb": "uses", "carries": "GET /changes/<id>?scope: each of the session's repos with its commits since its base, and its files and hunks as the scope shows them" }
  ]
}
---
**Problem.** Reviewing what a worker did meant leaving the tower for an editor or GitHub, with no way to know which
files you have read while the agent keeps working.

**Decision.** [`changesIn`](ref:hub/src/changes.ts#changesIn) reads each of a session's dirs that is a repo, on every
request, never kept:
- **Since what** ([`againstFor`](ref:hub/src/worktrees.ts#againstFor)). On a branch the tower cut (it has
  `branch.<b>.towerBase`), since the merge-base with that base, or with origin's default once the base is gone (the
  same fallback as [[absorbed]]). On any other branch with an upstream (a main checkout tracking `origin/main`), since
  the merge-base with the upstream, so a commit not yet pushed is still work to review and a note anchored to it stays
  anchored ([[review-threads]]). Anywhere else, since `HEAD`. One `git diff <since>` against the working tree covers
  commits, staged and unstaged; untracked files are diffed one by one against `/dev/null`, up to a cap. Files outside
  the repos aren't seen.
- **As data.** [`parseDiff`](ref:hub/src/bridge/diff.ts#parseDiff) turns git's output into files with their hunks,
  lines kept with git's marks. Every config of the user's that changes what `git diff` prints is set back on the
  command line.
- **Highlighting.** A hunk highlighted alone reads wrong when it starts inside a comment or a string. Each hunk of a
  modified or renamed file carries `before`, the unchanged lines above it cut from the file's new side
  ([`withBefore`](ref:hub/src/bridge/diff.ts#withBefore)), read under caps; a file past them goes without. A hunk takes
  the whole side's colours only where what it carries in from above is a comment, or a string or fence that closes
  within it ([`readsWhole`](ref:hub/src/shared/changes-panel.ts#readsWhole)): highlight.js misreads some code and never closes
  what it opened, which would colour every hunk below.
- **When.** Only while a worker's Changes are open: on open, on a poll (`CHANGES_POLL_MS`), and when the
  worker's status leaves `working`. Claude edits through scripts as often as through its edit tools, so no tool event
  is a reliable trigger. Every renderer reads them through [`changesHandlers`](ref:hub/src/shared/changes-reads.ts#changesHandlers),
  a machine on `/loop.js` that a renderer tells, on each draw, whose Changes are open (held reads,
  [[renderer-shared-modules]]).
- **Viewed.** Each file carries a hash of its diff. A mark is `(path → hash)` per repo dir, kept with `tower.store`
  ([[renderer-api]]), so every renderer in a browser sees the same marks: when the worker touches the file again its
  hash moves and the file reopens. Marks are per browser.
- **Scopes.** All since the base is the whole of the work; a reviewer often wants a slice. The read takes a `scope`:
  `all`, `uncommitted` (the working tree since `HEAD`) or a commit's hash (that commit against its first parent), and
  each repo carries its `commits` since the base; a hash that isn't one of them shows nothing, so no ref but those
  reaches git. A scope that no longer exists falls back to All ([`liveScope`](ref:hub/src/shared/changes-reads.ts#liveScope)).
  Each scope keeps its own marks ([`viewedKey`](ref:hub/src/shared/changes-reads.ts#viewedKey)), since a file's diff differs
  between them. Notes anchor to the working tree's line numbers, so a commit's scope picks no lines.
- **Layouts.** Unified or split ([`splitRows`](ref:hub/src/shared/changes-lines.ts#splitRows) lays rows side by side as
  indexes into the unified rows, so picking, the note box and anchors are the unified ones), and a tree of the changed
  files beside the diffs ([`treeHtml`](ref:hub/src/shared/changes-panel.ts#treeHtml)), both the viewer's choices kept in
  `tower.store`.
- **Words.** An edited line has the words it changed marked: [`wordRanges`](ref:hub/src/shared/words.ts#wordRanges)
  diffs a removed line and the added line beside it by code token, bounded since it runs on the page's thread.
- **Landed or gone.** Once a worker's work no longer goes on (`card.checkoutState`, [[review-threads]]), its Changes
  say so in place of an empty diff: landed on its base (for [[carried]] work, with what landing changed), or the
  worktree removed. A diff git still reads is shown under that line, its lines pickable only while the checkout is
  live.

Every renderer draws it through the shared Changes panel ([[shared-panels]]): the tower page as `tower/changes`
([`mount`](ref:hub/src/views/changes.ts#mount)), a tab beside Terminal and Brief, Tower 3D at a desk. Lines are marked
by what extensions add to the card (`marks`, the reviews extension's notes), and its line numbers pick lines, a
`lines` subject, under which the renderer draws what acts on them (`lines.acts`: a review's note box, [[ui-model]]).
Lines are pickable where something acts on them. The view reads the worker's diff and nothing else: where a review
note's quote stands among the changes is the reviews extension's own read ([[review-threads]]). Each file opens in
Finder or the editor ([[open-files]]).

**Alternatives considered.**
- Since `HEAD` on main: every local commit emptied the diff and turned notes anchored to those lines outdated.
- Refresh on Edit/Write tool events: misses every change made by a script.
- A per-worker diff in a shared main checkout, from the files its tool events name: git can't attribute a change to a
  worker, and tool events miss scripted edits. The diff belongs to the checkout.
- Marks as a collection: they are one viewer's reading state, not files kept for later.
- Marks in each page's own `localStorage`: a framed page has none (opaque origin), and renderers wouldn't share them.
- Marking words by a character diff: it marks fragments of code tokens.
