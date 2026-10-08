---
{
  "type": "decision",
  "name": "Changes: a worker's diff read from git, and viewed marks per file version",
  "summary": "The tower reads what a worker changed in its repos from git on request (since its branch's base in a worktree, since its upstream on a branch that has one, since HEAD elsewhere), the page re-reads it every 30 s while the view is open and when a turn ends, and a file marked viewed stays viewed only until its diff changes; the marks live in the viewer's browser, shared by every renderer through tower.store.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/changes.ts#changesIn", "hub/src/bridge/diff.ts#parseDiff", "hub/src/tower/server.ts#changes", "hub/renderers/page/index.html", "hub/src/tower/tower.js", "hub/src/shared/panels.ts#changesHtml", "hub/test/diff.test.ts"],
  "links": [
    { "to": "tower-server", "verb": "uses", "carries": "GET /changes/<id>: each of the session's repos with its files and hunks" }
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

**Impact.** The tower page has a Changes pane beside Terminal and Brief, and Tower 3D the same view at a desk, with a viewed/total tally on its tab.
It is the surface review threads anchor notes to: its line numbers pick lines for a note ([[review-threads]]). Marks are per browser: another browser or machine
starts unread.
