---
{
  "type": "decision",
  "name": "Changes: a worker's diff read from git, and viewed marks per file version",
  "summary": "The tower reads what a worker changed in its repos from git on request (since its branch's base in a worktree, since its upstream on a branch that has one, since HEAD elsewhere), the page re-reads it every 30 s while the view is open and when a turn ends, and a file marked viewed stays viewed only until its diff changes; the marks live in the viewer's browser, shared by every renderer through tower.store.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-17",
  "refs": ["hub/src/bridge/reviews.ts#checkoutState", "hub/src/changes.ts#changesIn", "hub/src/shared/api.ts#QUERIES", "hub/src/shared/panels.ts#viewedKey", "hub/src/shared/panels.ts#liveScope", "hub/src/bridge/diff.ts#parseDiff", "hub/src/bridge/diff.ts#withBefore", "hub/src/shared/panels.ts#readsWhole", "hub/src/tower/server.ts#changes", "hub/renderers/page/index.html", "hub/src/tower/tower.js", "hub/src/shared/panels.ts#changesHtml", "hub/src/shared/panels.ts#splitRows", "hub/src/shared/words.ts#wordRanges", "hub/test/diff.test.ts"],
  "links": [
    { "to": "tower-server", "verb": "uses", "carries": "GET /changes/<id>?scope: each of the session's repos with its commits since its base, and its files and hunks as the scope shows them" }
  ]
}
---
**Problem.** Reviewing what a worker did meant leaving the tower for an editor or GitHub, with no way to know which
files you have read while the agent keeps working.

**Decision.** [`changesIn`](ref:hub/src/changes.ts#changesIn) reads each of a session's dirs that is a repo:
- **Since what.** On a branch the tower cut (it has `branch.<b>.towerBase`), since the merge-base with that base,
  or with origin's default once the base is gone (the same fallback as [[absorbed]]). On any other branch with an
  upstream (a main checkout tracking `origin/main`), since the merge-base with the upstream, so a commit not yet pushed
  is still work to review and a note anchored to it stays anchored ([[review-threads]]). Anywhere else, since `HEAD`.
  One `git diff <since>` against the working tree covers commits, staged and unstaged; untracked files are diffed
  one by one against `/dev/null`, up to a cap (the rest are counted). Files outside the repos aren't seen.
- **As data.** [`parseDiff`](ref:hub/src/bridge/diff.ts#parseDiff) turns git's output into files with their
  hunks, lines kept with git's marks. Binary files and very long diffs keep their counts and drop their hunks. Every
  config of the user's that changes what `git diff` prints is set back on the command line.
- **Highlighting.** A hunk highlighted alone reads wrong when it starts inside a comment or a string. Each hunk of a
  modified or renamed file carries `before`, the unchanged lines since the hunk before it
  ([`withBefore`](ref:hub/src/bridge/diff.ts#withBefore)), cut from the file's new side: the working tree's file read
  to its last hunk, or a commit's blobs by id through one `git cat-file --batch`. Which files are read is told by their
  hunk headers first, under caps per file and per read on lines and characters (a minified line above a hunk is
  megabytes); a file past them, or whose text isn't what git diffed (a filter, an edit since), goes without. The panel
  highlights each hunk alone, and each side whole with `before`, and a hunk takes the whole's colours only where what it
  carries in from above is a comment, or a string or fence that closes within it
  ([`readsWhole`](ref:hub/src/shared/panels.ts#readsWhole)): highlight.js misreads some code (Markdown's stray `*`, a
  regex in a template's `${}`) and never closes what it opened, which carried through every hunk below.
- **When.** Only while a worker's Changes are open: on open, on a poll, and when the worker's status leaves
  `working`. Claude edits through scripts as often as through its edit tools, so no tool event is a reliable trigger.
- **Viewed.** Each file carries a hash of its diff. A mark is `(path → hash)` per repo dir, kept with `tower.store`
  ([[renderer-api]]), so every renderer in a browser sees the same marks: when the worker touches the file again its
  hash moves and the file reopens. A viewed file folds; the viewer can unfold it, or fold any other, for this view
  only. Marks are per browser.
- **Scopes.** All since the base is the whole of the work; a reviewer often wants a slice. The read takes a `scope`:
  `all`, `uncommitted` (the working tree since `HEAD`) or a commit's hash (that commit against its first parent).
  Each repo carries its `commits` since the base and `shows`; a hash that isn't one of them shows nothing, so no ref
  but those reaches git. The picker is drawn only while some repo has commits since its base; the choice is the
  viewer's per worker and falls back to All once it no longer exists
  ([`liveScope`](ref:hub/src/shared/panels.ts#liveScope)). Each scope keeps its own marks
  ([`viewedKey`](ref:hub/src/shared/panels.ts#viewedKey)), since a file's diff differs between them. Notes anchor to
  the working tree's line numbers, so a commit's scope picks no lines and an anchor opened from Reviews switches back
  to All.
- **Layouts.** Unified or split, the viewer's choice kept in `tower.store`; [`splitRows`](ref:hub/src/shared/panels.ts#splitRows)
  lays rows side by side as indexes into `fileRows`, so picking, the note box and anchors are the unified ones.
- **Words.** An edited line has the words it changed marked: [`wordRanges`](ref:hub/src/shared/words.ts#wordRanges)
  diffs a removed line and the added line beside it by code token. A pair sharing under half its characters
  (`WORDS_ALIKE`) was rewritten and a very long line (`WORDS_LONGEST`) is data: neither is marked; the diff is bounded
  (`WORDS_EDITS`) because it runs on the page's thread.
- **Landed or gone.** Once a worker's work no longer goes on (`card.checkoutState`, [[review-threads]]), its Changes
  say so in place of an empty diff: landed on its base (for [[carried]] work, how many copies were edited, with what
  landing changed), or the worktree removed. A diff git still reads is shown under that line, its lines pickable only
  while the card offers `note` ([[board-verbs]]).

Every renderer draws it through the shared Changes panel ([[shared-panels]]): the tower page as a pane beside
Terminal and Brief, Tower 3D at a desk. Its line numbers pick lines for a note; each file opens in Finder or the
editor ([[open-files]]).

**Alternatives considered.**
- Since `HEAD` on main: every local commit emptied the diff and turned notes anchored to those lines outdated.
- Refresh on Edit/Write tool events: misses every change made by a script.
- A per-worker diff in a shared main checkout, from the files its tool events name: git can't attribute a change to a
  worker, and tool events miss scripted edits. The diff belongs to the checkout.
- Marks as a collection: they are one viewer's reading state, not files kept for later.
- Marks in each page's own `localStorage`: a framed page has none (opaque origin), and renderers wouldn't share them.
- Marking words by a character diff: it marks fragments of code tokens.
