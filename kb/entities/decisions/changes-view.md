---
{
  "type": "decision",
  "name": "Changes: a worker's diff read from git, and viewed marks per file version",
  "summary": "The tower reads what a worker changed in its repos from git on request (since its branch's base in a worktree, since its upstream on a branch that has one, since HEAD elsewhere), the page re-reads it every 30 s while the view is open and when a turn ends, and a file marked viewed stays viewed only until its diff changes; the marks live in the viewer's browser, shared by every renderer through tower.store.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/bridge/reviews.ts#checkoutState", "hub/src/changes.ts#changesIn", "hub/src/shared/api.ts#QUERIES", "hub/src/shared/panels.ts#viewedKey", "hub/src/shared/panels.ts#liveScope", "hub/src/bridge/diff.ts#parseDiff", "hub/src/tower/server.ts#changes", "hub/renderers/page/index.html", "hub/src/tower/tower.js", "hub/src/shared/panels.ts#changesHtml", "hub/src/shared/panels.ts#splitRows", "hub/src/shared/words.ts#wordRanges", "hub/test/diff.test.ts"],
  "links": [
    { "to": "tower-server", "verb": "uses", "carries": "GET /changes/<id>?scope: each of the session's repos with its commits since its base, and its files and hunks as the scope shows them" }
  ]
}
---
**Problem.** Reviewing what a worker did meant leaving the tower for an editor or GitHub. A Conductor user's
favourite part of its review tab is a *Viewed* toggle per file that folds the file away, so you know what you have
and haven't read while the agent keeps working.

**Decision.** [`changesIn`](ref:hub/src/changes.ts#changesIn) reads each of a session's dirs that is a repo:
- **Since what.** On a branch the tower cut (it has `branch.<b>.towerBase`), since the merge-base with that base,
  or with origin's default once the base is gone (the same fallback as [[absorbed]]). On any other branch with an
  upstream (a main checkout tracking `origin/main`), since the merge-base with the upstream, so a commit not yet pushed
  is still work to review and a note anchored to it stays anchored ([[review-threads]]). Anywhere else, since `HEAD`.
  One `git diff <since>` against the working tree covers commits, staged and unstaged; untracked files are diffed
  one by one against `/dev/null` (up to 300; the rest are counted). Files outside the repos aren't seen.
- **As data.** [`parseDiff`](ref:hub/src/bridge/diff.ts#parseDiff) turns git's output into files with their
  hunks, lines kept with git's marks; renderers number lines from each hunk's start. Binary files and files past
  2000 changed lines keep their counts and drop their hunks. Every config of the user's that changes what
  `git diff` prints is set back on the command line.
- **When.** Only while a session's Changes pane is open: read on open, every 30 s, and when the worker's status
  leaves `working`. Claude edits through scripts as often as through its edit tools, so no tool event is a
  reliable trigger.
- **Viewed.** Each file carries a hash of its diff. A mark is `(path → hash)` per repo dir, kept with
  `tower.store` under `viewed:<dir>` ([[renderer-api]]): when the worker touches the file again its hash moves and
  the file reopens. A viewed file folds; the viewer can unfold it (or fold any other) for this page only.

- **Landed or gone** (2026-10-08). Once a worker's work no longer goes on (`card.checkoutState`, [[review-threads]]),
  its Changes say so in place of an empty diff: "Landed on `<base>`" (with when its thread was filed, and for work
  [[carried]] "N edited" with a link to what landing changed, `data-landing-of`), or "Worktree removed". A diff git still reads (a squash leaves one against the old merge-base) is shown under that line, its lines
  no longer pickable: picking is drawn only while the card offers `note` ([[board-verbs]]).

**Alternatives considered.**
- Since `HEAD` on main (the first version): every local commit emptied the diff, and turned every note anchored to
  those lines outdated.
- Refresh on Edit/Write tool events: misses every change made by a script.
- A per-worker diff in a shared main checkout, from the files its tool events name: git can't attribute a change
  to a worker, and the tool events miss scripted edits too. The diff belongs to the checkout.
- Marks as a collection: they are one viewer's reading state, not files kept for later; and the three kinds of
  stored state stay three.
- Marks in each page's own `localStorage`: a framed page has none (opaque origin), and Tower 3D would never see
  what the tower page marked. `tower.store` keeps one copy per browser for every renderer.

**Tower 3D (2026-10-06).** The desk panel's Changes tab is the same view as the page's, drawn by the shared
panels ([[shared-panels]]): hunks, folds, Viewed (written to `tower.store`, so either renderer sees the other's marks),
line picking, the note box and noted lines. In both, each hunk's code is syntax-coloured on the diff's washes, and each
file opens in Finder or the user's editor ([[open-files]]). It is read on open, every 30 s while it or the Reviews tab is open, and on
↻. A review anchor opens it scrolled to its line.

**Split (2026-10-09).** A diff draws unified (one column, removals above the lines added in their place) or split
(the old side on the left, the new on the right), the viewer's choice from Unified · Split in the panel's head
(`data-changes-layout`), kept with `tower.store` under `changes.layout`, so every renderer opens on the last one chosen.
[`splitRows`](ref:hub/src/shared/panels.ts#splitRows) lays a file's rows side by side as indexes into `fileRows`: a
context line on both sides, each run of removed lines beside the run of added lines after it, the shorter side
empty. Each cell keeps its row's index, so picking, the note box and anchors are the unified ones, unchanged; a
drag from one side to the other picks the rows between them in unified order. Long lines wrap in split, where
scrolling a half alone would part the sides. The head with the layout stays at the top while the diff scrolls, each file's header stuck just below it.

**Words (2026-10-09).** An edited line has the words it changed marked, as GitHub does, in both layouts. The pairs are
`splitRows`' (a removed line beside the added line after it); an unpaired line has none.
[`wordRanges`](ref:hub/src/shared/words.ts#wordRanges) diffs a pair by token (a word of letters with their combining marks, digits, `_` and `$`,
a run of whitespace, any other character alone) with jsdiff's `diffArrays`, and gives each side's changed characters,
changed tokens apart only by whitespace joined. A pair sharing less than half its characters (whitespace aside,
`WORDS_ALIKE`) was rewritten, and a line over 1000 characters (`WORDS_LONGEST`) is data or minified: neither is
marked. On this repo's last 300 commits, pairs under half alike were mostly rewrites and those above mostly edits,
and 99% of edited lines are under 650 characters. The share is counted in characters, so a short line whose one
word changed (`x = foo` → `x = bar`) reads as rewritten and is not marked. The diff is drawn on first sight of a file,
on the page's thread, so it is bounded: it gives up past half a pair's tokens changed, or past 100 (`WORDS_EDITS`),
and the pair is left unmarked. Unbounded, 200 rewritten lines of 1000 characters took 5 s; bounded, 150 ms. In the
same history an edited line changed a median of 9 tokens, and 2 of 2419 more than 100.

**Compare (2026-10-09).** All since the base is the whole of the work; a reviewer often wants a slice of it. The read
takes a `scope` (`QUERIES['changes/<id>']`): `all` (the default, as above), `uncommitted` (the working tree since
`HEAD`, untracked files with it: what the worker hasn't committed yet), or a commit's hash, that commit's own diff
against its first parent. Each repo carries `commits`, the commits since its base newest first (up to 200), whatever
the scope, and `shows`, which it drew; a hash that isn't one of a repo's `commits` shows nothing there, so no ref
but those reaches git. The panel's head has the picker (`data-changes-scope`: All changes, Uncommitted, then each
commit, under its repo's name when more than one repo has some), drawn only while some repo has commits since its
base: in a worktree that has committed, or a main checkout with unpushed commits, the same two places the base
already counts from. Without commits, all *is* uncommitted, so there is nothing to choose. The choice is the
viewer's for that worker, kept in the renderer's memory: a worker opens on All, and a commit no repo lists any
more (rebased, amended) falls back to it ([`liveScope`](ref:hub/src/shared/panels.ts#liveScope)).
- **Marks per scope.** A file's diff differs between scopes, so each keeps its own marks
  ([`viewedKey`](ref:hub/src/shared/panels.ts#viewedKey): `viewed:<dir>` for all, `viewed:<dir>@uncommitted`,
  `viewed:<dir>@<commit>`). One key for all would let a commit's marks prune or overwrite all's. A commit's marks
  hold for good, as the commit does.
- **No notes on a commit.** Notes anchor to line numbers of the working tree ([[review-threads]]); a commit's new side
  is the file as it was then. On a commit, no lines are picked and none are marked noted, and an anchor opened from
  Reviews switches back to All. Uncommitted's new side is the working tree, so it picks and marks as All does. The
  Reviews panel reads anchor states from an All read only.

**Impact.** The tower page has a Changes pane beside Terminal and Brief, and Tower 3D the same view at a desk, with a viewed/total tally on its tab.
It is the surface review threads anchor notes to: its line numbers pick lines for a note, one by a click or a range
within a hunk by a drag or ⇧-click ([[review-threads]], [[shared-panels]]). Marks are per browser: another browser or machine
starts unread.
