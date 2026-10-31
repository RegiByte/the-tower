---
{
  "type": "decision",
  "name": "Workers keep and edit items in their floor's collections; who kept one is a fact in its log",
  "summary": "tower keep adds a file to one of the floor's collections through the renderer API and logs tower.keep in the worker's own log, which the board joins onto the item as keptBy; a worker edits an item it or anyone kept in place, never keeping a second copy, and deleting one stays the user's.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-05",
  "reviewed": "2026-10-31",
  "refs": [
    "hub/src/directory.ts#keepContent",
    "hub/src/directory.ts#keepArgs",
    "hub/src/directory.ts#collectionLine",
    "hub/src/directory.ts#collectionLines",
    "hub/src/directory.ts#overviewLines",
    "hub/src/shared/titles.ts#titleIn",
    "hub/src/bridge/facts.ts#Kept",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/bridge/board.ts#KeptBy",
    "hub/src/bridge/board.ts#keepers",
    "hub/src/shared/launch.ts#keptArgs",
    "hub/src/shared/launch.ts#towerBrief",
    "hub/src/shared/paths.ts#projectCollectionsPath",
    "hub/extensions/drafts/client/drafts.ts#follow",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/renderers/tower3d/src/ui.ts#draftHeadHtml"
  ]
}
---
**Problem.** The user asks workers to leave prompts for a later session, and ideas come up mid-task that are worth
keeping but not worth chasing now. A worker could write into `collections/` with its own shell, but nothing told it
where, what was already there, or that the place existed; an item said nothing about where it came from; and a
worker that could only add kept a second version when the user adjusted something it had kept, so the floor held two
versions of one idea with nothing saying which was current.

**Decision.**
- Three commands on the mod's `tower` ([[agent-directory]]), on the worker's own floor:
  `tower keep <collection> [file] [name <words>]` (a file, its extension the item's type, or markdown on stdin; the
  item's id carries a slug of `name`, else of the file's base name or the markdown's title, [[collections]]; `tower
  keep` alone lists the floor's collections with what each is for), `tower kept [collection]` (alone, each
  collection's item count and its latest few; with a collection, every item: tag, title, age, size, keeper and file,
  [[item-tags]]) and `tower read <tag|id>`.
- `keep` creates the item with the renderer API's `collection/create` ([[collections]]), then calls the
  tower's `fact` verb, `{name: 'keep', value: {project, collection, id}}`, which logs `{hook_event_name: 'tower.keep',
  project, collection, id}` in the worker's own log, as `tower.show` goes ([[agent-show]]). Two acts: a link that
  guards what is kept wraps `collection/create`; one that refuses the fact leaves the item kept and unannounced. The bridge folds it into `facts.kept` with the conversation the worker was in, and the board joins
  every session's `kept` onto the floor's items: an item carries `keptBy {session, callsign, conversation?}`. An item
  made any other way (the tower, an editor, a shell) has none. Both renderers name the keeper.
- Titles are derived where they are shown: a markdown or text item's first line, an html item's `<title>`. Nothing
  about an item is stored beside it.
- To change a kept item, a worker edits its file in place and never keeps a second copy; it never deletes one:
  throwing an item away is the user's. The brief ([`towerBrief`](ref:hub/src/shared/launch.ts#towerBrief)) and the
  handbook say so. The brief also says to keep off-goal ideas and later prompts with `tower keep drafts` and carry on
  ([[brief-first]]).
- Every spawn and resume passes the project's collections directory as `--add-dir`
  ([`keptArgs`](ref:hub/src/shared/launch.ts#keptArgs)), so an edit there asks no permission. The directory holds no
  `.claude/`, so [[repos-file-access-only]]'s reason for `additionalDirectories` does not apply, and the flag is the
  client's: no host change. A project that has kept nothing yet has no directory; Claude starts anyway.
- No edit verb: the renderers take a change made on disk. An open draft with no edits shows the new text, and one
  with edits raises take theirs / keep mine ([`follow`](ref:hub/extensions/drafts/client/drafts.ts#follow)).

**Alternatives considered.**
- *Metadata beside each item (a sidecar, frontmatter, an item as a folder).* Titles, types and times are derived,
  provenance is a fact, and markdown and html describe themselves.
- *Provenance written by the tower on create.* The tower doesn't know which session asked, and a fact about a session
  belongs in its log ([[logs-are-facts]]).
- *Workers only add.* The duplicates above; and it protected nothing, since a worker's shell can always reach the files.
- *An edit verb on the API and the CLI.* The files are plain and the session's own tools edit them.
- *Workers delete their own items too.* A worker could tidy away a draft the user meant to send.

**Consequences.** `create` and `tower.keep` are two writes: if the second fails, the item exists with no keeper. A
deleted item's `tower.keep` stays in the log and joins nothing. Who kept an item is a fact; who last edited it is not
recorded.
