---
{
  "type": "decision",
  "name": "Workers edit the items they keep, in place, and never delete them",
  "summary": "Kept items are plain files a worker's session may edit without asking: a follow-up to a kept draft changes that draft, so the floor never holds two versions of one idea. Deleting stays the user's.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-05",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/shared/launch.ts#keptArgs", "hub/src/shared/launch.ts#towerBrief", "hub/src/shared/paths.ts#projectCollectionsPath", "hub/src/mod/skills/handbook/SKILL.md", "hub/src/directory.ts", "hub/src/shared/drafts.ts#follow"]
}
---
**Problem.** [[agent-keep]] let workers only add. When the user adjusted something a worker had already kept, the worker
kept a second draft, and the floor held two versions of one idea with nothing saying which was current. The rule
protected nothing: a worker's shell could always reach the files.

**Decision.**
- The brief ([`towerBrief`](ref:hub/src/shared/launch.ts#towerBrief)) says: to change a kept item, edit its file in
  place; never keep a second copy. The skill says it too, and adds: never delete an item. Throwing one away is
  the user's.
- The `tower` CLI gives every item's file (`tower kept`, `tower keep`), from the collection's `dir` on the board
  ([[item-tags]]).
- Every spawn and resume passes the project's collections directory as `--add-dir`
  ([`keptArgs`](ref:hub/src/shared/launch.ts#keptArgs)), so an edit there asks no permission. The directory holds no
  `.claude/`, so [[repos-file-access-only]]'s reason for `additionalDirectories` does not apply, and the flag is the
  client's: no host change. A project that has kept nothing yet has no directory; Claude starts anyway.
- No new verb. The renderers already take a change made on disk: an open draft with no edits shows the new text, and
  one with edits raises take theirs / keep mine ([`follow`](ref:hub/src/shared/drafts.ts#follow)).

**Alternatives considered.**
- *Keep "only add".* The duplicates above.
- *An edit verb on the API and the CLI.* The files are plain and the session's own tools edit them; a verb would add a
  protocol for what `Edit` already does.
- *Workers delete their own items too.* A worker could tidy away a draft the user meant to send: deleting stays a
  decision the user takes.

**Impact.** Who kept an item is still a fact (`keptBy`); who last edited it is not recorded. Edits through `Edit` write
in place rather than by rename; the board's rescan after changes settle covers it.
