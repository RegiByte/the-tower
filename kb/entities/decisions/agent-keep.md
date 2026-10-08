---
{
  "type": "decision",
  "name": "A worker adds to its floor's collections, and who kept an item is a fact in its log",
  "summary": "tower keep adds a file to one of the floor's collections through the renderer API and logs tower.keep in the worker's own log; the board joins those facts onto items as keptBy, so every renderer says which worker kept an item and from which conversation. Workers only add; what is kept is the user's.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-05",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/directory.ts#keepContent", "hub/src/directory.ts#keepArgs", "hub/src/directory.ts#collectionLine", "hub/src/directory.ts#collectionLines", "hub/src/shared/titles.ts#titleIn", "hub/src/bridge/facts.ts#Kept", "hub/src/bridge/facts.ts#factsAfter", "hub/src/bridge/board.ts#KeptBy", "hub/src/bridge/board.ts#keepers", "hub/src/shared/launch.ts#towerBrief", "hub/src/mod/skills/handbook/SKILL.md", "hub/renderers/page/index.html", "hub/renderers/tower3d/src/ui.ts#draftHeadHtml"]
}
---
**Problem.** The user asks workers to leave prompts for a later session, and ideas come up mid-task that are worth
keeping but not worth chasing now. A worker could write into `collections/` with its own shell, but nothing told it
where, what was already there, or that the place existed; and an item said nothing about where it came from.

**Decision.**
- Three commands on the mod's `tower` ([[agent-directory]]), on the worker's own floor:
  `tower keep <collection> [file] [name <words>]` (a file, its extension the item's type, or markdown on stdin; the
  item's id carries a slug of `name`, else of the file's base name or the markdown's title, [[collections]]; `tower
  keep` alone lists the floor's collections with what each is for),
  `tower kept [collection]` (each item's title, age, size and who kept it; tag and file since [[item-tags]]) and
  `tower read <id>`.
- `keep` creates the item with the renderer API's `collection/create` ([[collections]]), then posts
  `{hook_event_name: 'tower.keep', project, collection, id}` to the host's hooks socket, as `tower.show` goes
  ([[agent-show]]). No host change.
- The bridge folds it into `facts.kept` with the conversation the worker was in. The board joins every session's
  `kept` onto the floor's items by `project/collection/id`: an item carries `keptBy {session, callsign,
  conversation?}`. An item made any other way (the tower, an editor, a shell) has none: its maker is unknown.
- Titles are derived where they are shown: a markdown or text item's first line, an html item's `<title>`. Nothing
  about an item is stored beside it.
- Workers only add (reversed for edits by [[workers-edit-kept-items]]). The skill says never to edit or delete items, its own included: a kept item is the user's to
  edit, send or throw away. A worker's shell can still reach the files: the command is the agreed way, not a lock.
- The tower brief says to keep off-goal ideas and later prompts with `tower keep drafts` and carry on ([[brief-first]]), and to make
  pages as local html files shown with `tower show`, publishing a claude.ai artifact only when asked (a link is all
  the tower can do with one).
- Both renderers name the keeper: the tower page beside the draft's title and in the editor's head (linked to the
  worker), Tower 3D on the aimed note and the draft panel.

**Alternatives considered.**
- *Metadata beside each item (a sidecar, frontmatter, an item as a folder).* Rejected: titles, types and times are
  derived, provenance is a fact, and the one thing neither covers, a description of a media file, has no use yet.
  Markdown and html describe themselves.
- *Provenance written by the tower on create.* Rejected: the tower doesn't know which session asked, and a fact
  about a session belongs in its log ([[logs-are-facts]]).
- *Agents edit or delete their own items.* Rejected by the user: the pile is theirs to curate. Editing was later
  accepted ([[workers-edit-kept-items]]).

**Consequences.** `create` and `tower.keep` are two writes: if the second fails, the item exists with no keeper. A
deleted item's `tower.keep` stays in the log and joins nothing. Media items wait until a use needs them.
