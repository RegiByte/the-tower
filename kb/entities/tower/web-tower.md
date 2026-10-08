---
{
  "type": "system",
  "name": "Web tower",
  "summary": "The disposable web renderer: projects as floors, sessions as terminals, shells docked as tabs, and each project's shelf, on 127.0.0.1:4317.",
  "in": "tower",
  "reviewed": "2026-10-08"
}
---
Built to learn from and throw away ([[renderer-is-disposable]]): the [[tower-server]] turns the
[[live-system]] into a board and relays requests to the daemons. It holds no machinery. The skyline home
(projects as buildings, sessions as lit windows) is the seed of a spatial renderer.
Spatial renderers live in `renderers/` on the same API: [[tower3d]] is the first-person one.

Drafts are the page's own feature over the `drafts` collection ([[collections]]): each floor lists them under its
shelf, titled by their first line over their tag and keeper ([[item-tags]]), and a draft opens in an editor in the main pane that saves as you type and takes
another writer's change unless it holds edits of its own; a save the tower refuses because the file moved on
becomes the same conflict. The editing is `/drafts.js`
([`src/shared/drafts.ts`](ref:hub/src/shared/drafts.ts)), shared with Tower 3D's draft panel ([[corkboard]]). A draft starts a session through the new-session dialog,
prefilled with its text (directory, model and effort picked there), or is submitted to a running worker, then is
deleted. A session the page
starts opens once the board carries its card: the host answers before the tower has read the new log.
