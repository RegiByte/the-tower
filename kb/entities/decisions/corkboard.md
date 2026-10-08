---
{
  "type": "decision",
  "name": "Corkboard and carrying: drafts as notes in Tower 3D",
  "summary": "A floor keeping drafts shows them as notes on a corkboard; E takes one into your hand, H hands it to a worker (submit) or to the open desk (a hire on it), and the draft is deleted only once its words reach a session. Drafts are edited in a panel beside the world, by the same editor module the tower page uses.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-08",
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
    "hub/renderers/page/index.html",
    "hub/src/tower/server.ts#design"
  ]
}
---
**Problem.** Tower 3D could neither show nor send drafts ([[collections]]). The tower page had them, but a
prompt kept for later had no place in the building, and the open desk ([[workstations]]) had nothing to start
a worker on.

**Why.** The user keeps the next prompts for running work as drafts, then sends each to a worker or a new one.
In the building that reads as notes on a wall, taken to whoever should do the work. Editing has to work there
too, beside the world (the terminal and the brief open in a modal over it; a draft stays a narrow panel at the
side, the world still in view), without leaving for the tower page.

**How.**
- **One editor, two layouts.** The draft editor (create on first save, saves queued one after another,
  another writer's change taken unless the editor holds edits, a conflict held until settled (raised by the
  board's newer version, or by a write the tower refused because the file moved on), and on leaving
  unsettled the editor's edits kept as a new draft beside it, send only after a save) is [`src/shared/drafts.ts`](ref:hub/src/shared/drafts.ts): DOM-free, its collection reads and writes
  passed in. The tower page imports it as `/drafts.js` ([`design`](ref:hub/src/tower/server.ts#design) serves it
  beside `/design.js`); Tower 3D bundles it. Each keeps its own textarea, layout and autosave timer. The core
  never imports it: what drafts mean stays with renderers.
- **The corkboard** ([`corkFor`](ref:hub/renderers/tower3d/src/layout.ts#corkFor)): only on floors that declare
  `drafts`, on the left of the floor's shared wall ([[shared-wall]]), right of the elevator core. Notes fill rows from the top left, oldest first, as
  many as fit. Each is a paper card titled by its draft's first line (up to three lines) over its tag ([[item-tags]]), the text fetched once per `modifiedAt`
  ([`notes.ts`](ref:hub/renderers/tower3d/src/notes.ts), through the shared
  [`itemTitles`](ref:hub/src/shared/titles.ts#itemTitles) any collection's titles use); a [`NOTES`](ref:hub/renderers/tower3d/src/layers.ts#NOTES)
  layer keyed by project and id draws a note again when its title changes.
- **Carrying** is renderer state, `{ project, id }`, not kept across reloads: the file never moves, so a reload
  just puts the note back. The carried note stays in the layer, hidden (picking skips hidden objects), and its
  title is derived from the cache wherever it shows: the card in your hands and the offers.
- **Verbs** ([`OFFERS`](ref:hub/renderers/tower3d/src/acts.ts#OFFERS)), with H, a new key meaning "hand over
  what you carry":
  - note: E take it (hands empty), Q read and edit, held X throw away.
  - corkboard: E write a new draft; carrying one of this floor's notes, E puts it back.
  - a worker offering `submit`: H hands the note over. E still sits.
  - the open desk: H hires a worker on the note, and you stay on the floor; G opens the new-session dialog
    prefilled with it, and seats you at the new worker.
- **Sent, then deleted** ([`sendCarried`](ref:hub/renderers/tower3d/src/main.ts#sendCarried)): the text is read
  after the editor's last save, then submitted or spawned as `Launch.prompt`. Only a success deletes the draft
  and empties your hand. A failure keeps the note in hand.
- **The panel** ([`openDraftPanel`](ref:hub/renderers/tower3d/src/main.ts#openDraftPanel)) lies on the right
  like the reader: Carry, Start session (the dialog, prefilled), Delete (asks twice), ✕ or Esc; its head also
  reveals the draft's file in Finder or opens it in the user's editor ([[open-files]]). It saves as you
  type, on leaving, and before a carry or a send.

**Alternatives considered.**
- *E hands over at a worker.* E already sits at a worker; one key would mean two things depending on your
  hands. H is its own verb, offered only with a note in hand. H is also the overview key, but an aimed verb's
  key comes first, as for every key.
- *Q puts the note back.* Q means "look closer" everywhere; putting back is the corkboard's own use (E).
- *Read and carry only, editing in the tower page.* Leaving the building to fix one word breaks the flow, and a
  copied editor would drift from the page's on its trickiest part.
- *The carried title stored at take time.* A note taken before its text arrived kept `…` for good.
- *Notes for every collection.* Only drafts have verbs (spawn, submit); the board is generic over the
  collection's items, the verbs bound to drafts.

**Impact.** Phase 2 of the roadmap is done: drafts live in both renderers on one editor. `src/shared` now holds a
renderer-side module besides the design. Fixture boards carry drafts with their texts, and the frames walk ends
by taking a note to the open desk and putting it back. H joins the verb keys ([[verb-prompts]]); it later also
hands a worker the review notes new to it ([[review-threads]]).
