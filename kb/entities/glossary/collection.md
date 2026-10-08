---
{
  "type": "term",
  "name": "Collection",
  "summary": "A kind of files a project keeps in the system root, declared in the config for every project or for one; the tower lists, reads, writes and deletes its items, and renderers decide what they mean.",
  "in": "tower",
  "reviewed": "2026-10-08"
}
---
An item is any file at `collections/<project>/<collection>/<id>`; its file name is its id, and it is called by its
tag ([[item-tags]]). Drafts (prompts not yet
sent) are one collection, sent by a renderer with `spawn` or `submit` ([[collections]]). Not to be confused with a
[[shelf]] `md` entry: those files live in the project's hub and belong to its repo. A shelf `item` entry names one
item, which stays here ([[shelf-items]]).
