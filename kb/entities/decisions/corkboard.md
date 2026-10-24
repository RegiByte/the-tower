---
{
  "type": "decision",
  "name": "Corkboard and carrying: drafts as notes in Tower 3D",
  "summary": "A floor keeping drafts shows them as notes on a corkboard; E takes one into your hand, H hands it to a worker (submit) or to the open desk (a hire on it), and the draft is deleted only once its words reach a session. Drafts are edited in a panel beside the world, by the same editor module the tower page uses.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-24",
  "refs": [
    "hub/src/shared/drafts.ts",
    "hub/renderers/tower3d/src/layout.ts#corkFor",
    "hub/renderers/tower3d/src/cork.ts",
    "hub/renderers/tower3d/src/layers.ts#NOTES",
    "hub/renderers/tower3d/src/notes.ts",
    "hub/renderers/tower3d/src/acts.ts#OFFERS",
    "hub/renderers/tower3d/src/main.ts#sendCarried",
    "hub/renderers/tower3d/src/main.ts#openDraftPanel",
    "hub/renderers/tower3d/src/hands.ts#holdNote",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/src/tower/http.ts#design"
  ]
}
---
**Problem.** Tower 3D could neither show nor send drafts ([[collections]]): a prompt kept for later had no place in
the building, and the open desk ([[workstations]]) had nothing to start a worker on.

**Why.** The user keeps the next prompts for running work as drafts, then sends each to a worker or a new one.
In the building that reads as notes on a wall, taken to whoever should do the work. Editing has to work there
too, beside the world (a draft is a narrow panel at the side, the world still in view), without leaving for the
tower page.

**How.**
- **One editor, two layouts.** The draft editor's logic (saves queued, another writer's change taken unless the
  editor holds edits, a conflict held until settled, unsettled edits kept as a new draft on leaving, send only after
  a save) is [`src/shared/drafts.ts`](ref:hub/src/shared/drafts.ts): DOM-free, its collection reads and writes passed
  in. The tower page imports it as `/drafts.js` (served by [`design`](ref:hub/src/tower/http.ts#design)); Tower 3D
  bundles it. Each keeps its own textarea, layout and autosave timer. The core never imports it: what drafts mean
  stays with renderers.
- **The corkboard** ([`corkFor`](ref:hub/renderers/tower3d/src/layout.ts#corkFor)): only on floors that keep a
  `drafts` collection, on the left of the floor's shared wall ([[shared-wall]]). Each note is a paper card titled by
  its draft's first lines over its tag ([[item-tags]]), the text fetched once per `modifiedAt`
  ([`notes.ts`](ref:hub/renderers/tower3d/src/notes.ts), through the shared
  [`itemTitles`](ref:hub/src/shared/titles.ts#itemTitles)); a [`NOTES`](ref:hub/renderers/tower3d/src/layers.ts#NOTES)
  layer keyed by project and id draws a note again when its title changes.
- **Carrying** is renderer state, `{ project, id }`, not kept across reloads: the file never moves, so a reload
  just puts the note back. The carried note's title is derived from the cache wherever it shows.
- **Verbs** ([`OFFERS`](ref:hub/renderers/tower3d/src/acts.ts#OFFERS)), with H meaning "hand over what you carry":
  to a worker offering `submit`, or to the open desk, which hires a worker on the note.
- **Sent, then deleted** ([`sendCarried`](ref:hub/renderers/tower3d/src/main.ts#sendCarried)): the text is read
  after the editor's last save, then submitted or spawned as the prompt. Only a success deletes the draft and empties
  your hand; a failure keeps the note in hand.
- **The panel** ([`openDraftPanel`](ref:hub/renderers/tower3d/src/main.ts#openDraftPanel)) lies on the right like
  the reader, saving as you type, on leaving, and before a carry or a send; deleting offers Undo ([[press-feedback]]).

**Alternatives considered.**
- *E hands over at a worker.* E already sits at a worker; one key would mean two things depending on your
  hands. H is its own verb, offered only with a note in hand; an aimed verb's key comes before H's global use
  (the overview).
- *Q puts the note back.* Q means "look closer" everywhere; putting back is the corkboard's own use (E).
- *Read and carry only, editing in the tower page.* Leaving the building to fix one word breaks the flow, and a
  copied editor would drift from the page's on its trickiest part.
- *The carried title stored at take time.* A note taken before its text arrived kept `…` for good.
- *Notes for every collection.* Only drafts have verbs (spawn, submit).
