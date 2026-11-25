---
{
  "type": "decision",
  "name": "Pins: a worker pinned as a conversation worth coming back to, a bundled extension over a system stream",
  "summary": "The bundled pins extension pins a worker with a note on why, through its verbs (`pin`, `unpin`) and their CLI words. Pins live in its own system stream, so its board fold lists every pin, archived workers included, for its section view in the page's board.sections; a card fold adds a `pinned` badge and a Pin or Unpin action; a read lists pins across floors with their session ids.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-25",
  "reviewed": "2026-11-25",
  "refs": [
    "hub/extensions/pins/extension.json",
    "hub/extensions/pins/server.ts",
    "hub/extensions/pins/pins.ts#step",
    "hub/extensions/pins/pins.ts#pinsOf",
    "hub/extensions/pins/client/section.ts#mount",
    "hub/extensions/pins/client/section.ts#tab",
    "hub/src/shared/extensions.ts#BUNDLED"
  ],
  "links": [
    {
      "to": "extensions",
      "verb": "uses",
      "carries": "a system stream, verbs and a read with CLI words, card and board folds, a section view"
    },
    {
      "to": "sidebar-regions",
      "verb": "uses",
      "carries": "a list-scale view in board.sections, its tally from the tab export"
    },
    {
      "to": "renderer-is-disposable",
      "verb": "follows",
      "carries": "a want built as an extension, every part reachable from any renderer and the CLI"
    },
    {
      "to": "agents-have-every-capability",
      "verb": "follows",
      "carries": "pin, unpin and list as CLI words a worker types"
    }
  ]
}
---
**Problem.** A user who wants to return to a conversation months later, such as the one that made an artifact, had no
way to mark it. Once its worker went home, it was one card among many in a floor's archive.

**Why.** It is one want among many, so it is an extension ([[extensions]], [[renderer-is-disposable]]), bundled so the
page offers it from the start. A pin has to be listed once its worker went home, since that is when it is needed.

**How.**

- **The store** is the extension's system stream `pins`: `p` a worker pinned (`session`, the `project` it ran on,
  `note`), `u` one unpinned ([`step`](ref:hub/extensions/pins/pins.ts#step)). The floor is part of the pin fact,
  since the board holds only live cards and a board fold has no other way to find an archived worker's floor. A
  second `p` of the same session replaces the first.
- **Verbs** `pin {session?, note?}` and `unpin {session?}`, system-scoped, take the calling worker's session when
  none is named ([`server.ts`](ref:hub/extensions/pins/server.ts)). `pin` refuses a session no log holds, `unpin` one
  that isn't pinned, each naming where to look. A worker types `tower x pins pin --note '<why>'`.
- **The read** `list` (CLI word `list`) answers every pin, newest first, with its callsign, floor, session and note
  ([`pinsOf`](ref:hub/extensions/pins/pins.ts#pinsOf)), and prints one line each.
- **The board fold** puts the same list at `board.x.pins.pins`, callsigns resolved through `callsignOf`, so archived
  workers keep their name. The **card fold** adds a `pinned` badge, the note as its hint, and the Pin or Unpin action,
  which the page draws on the worker's row, its header and its ⋯ menu.
- **The section** `pins/section` ([`mount`](ref:hub/extensions/pins/client/section.ts#mount)) is a `list`-scale view
  on the board, drawn in the page's `board.sections` ([[sidebar-regions]]): one row per pin with the floor's chip,
  the note and the age. A row displays `card:<session>`, which the page finds in the archive once the worker went
  home, and its × calls `unpin`. Its [`tab`](ref:hub/extensions/pins/client/section.ts#tab) is the count, or none
  while nothing is pinned, which leaves the section undrawn.

**Alternatives considered.**

- *A writable fact in the worker's own log* (the first draft). The pin would travel with the session, but a board fold
  reads facts only on a card, so the section could list only live workers unless the core grew facts on the board
  fold or a read the board subscribes to. The stream needs no core change.
- *A kept item about the conversation.* A collection item already links back to the worker that kept it, but it is a
  document, not a mark on a worker, and a worker that kept nothing has none.
- *A pin icon in place of the badge.* Wanted later, once badges can carry icons.

**Impact.** One bundled capability, `pins`, an API minor: a user's extension of that id is refused until renamed.
Nothing in the core changed beyond its name in [`BUNDLED`](ref:hub/src/shared/extensions.ts#BUNDLED).
