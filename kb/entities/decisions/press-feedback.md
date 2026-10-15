---
{
  "type": "decision",
  "name": "Every press is answered: busy controls, toasts with an action, undo by putting back",
  "summary": "A control that asks the tower something is aria-busy until the reply (pressing in /press.js), found again by its identity through redraws; every button's pressed, held and busy states are drawn by design.css; toasts stack, time out, pause under the pointer or focus and may carry one action (/toasts.js); sending one worker home offers Resume, and deleting a draft is done at once with an Undo that puts its file back under its id (collection/restore).",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-15",
  "refs": [
    "hub/src/shared/press.ts#pressing",
    "hub/src/shared/press.ts#identityOf",
    "hub/src/shared/toasts.ts#toaster",
    "hub/src/shared/toasts.ts#sameToast",
    "hub/src/shared/toasts.ts#toastsCss",
    "hub/renderers/tower3d/src/main.ts#sendHome",
    "hub/src/shared/design.ts#designCss",
    "hub/src/shared/drafts.ts#discard",
    "hub/src/shared/drafts.ts#restore",
    "hub/src/collections.ts#restoreItem",
    "hub/src/shared/api.ts#API_VERSION",
    "hub/src/shared/cards.ts#spawnFormHtml",
    "hub/renderers/page/index.html",
    "hub/renderers/tower3d/src/main.ts",
    "hub/renderers/tower3d/src/main.ts#confirmed",
    "hub/renderers/tower3d/src/ui.ts#askingButton",
    "hub/src/shared/cards.ts#sendHomeAsk"
  ]
}
---
**Problem.** Presses went unanswered: no button had a pressed, held or in-flight look, verbs stayed live while
their request ran (a double press on Review hired two reviewers), a toast was one line the next one overwrote, with
nothing to do on it, a worker ended was three clicks from its Resume, and a deleted draft could not be taken back.

**Why.** A press with no answer gets pressed again, and every renderer meets the same moments, so the answers are
shared code ([[agents-have-every-capability]], [[renderer-is-disposable]]): a renderer written from scratch imports
them, and nothing it needs lives in the tower page.

**How.**
- [`pressing(control, request)`](ref:hub/src/shared/press.ts#pressing) runs a request for a press and keeps every
  control of the same identity `aria-busy` until it settles. The identity is the one focus is kept by through a
  redraw ([`identityOf`](ref:hub/src/shared/press.ts#identityOf)): the tag and the attributes naming what it does.
  A board redraw that replaces the button keeps it busy (a `MutationObserver`, connected only while something is in
  flight), and the same call drawn elsewhere is busy alike. A press of a busy control is ignored. A control that names
  nothing fails loudly, since it would mark every button. Every verb a renderer sends from a button presses through it.
- The new-worker form ([`spawnFormHtml`](ref:hub/src/shared/cards.ts#spawnFormHtml)) stays open while its Start is
  pressed: Start is busy until the spawn answers, the form closes on a new worker and shows a refusal in its own alert
  line, the prompt still in place, so a prompt the new worker already has is never kept as a draft.
- [`designCss`](ref:hub/src/shared/design.ts#designCss) draws every button's states, whatever the renderer's own
  look: `:active` sinks, `disabled` or `aria-disabled` (held, which stays focusable) fades, and `aria-busy` sweeps a
  bar along its foot in its own text colour, at full contrast; with reduced motion the bar stands still.
- [`toaster(element)`](ref:hub/src/shared/toasts.ts#toaster) makes an element the page's toast stack, a polite live
  region: a few at once, the oldest leaving first, each timing out (longer with an action), none leaving while the
  pointer or focus is on the stack. A toast told again while the same one shows
  ([`sameToast`](ref:hub/src/shared/toasts.ts#sameToast): the same words and action) moves to the end with its time
  anew and counts the times (`×2`). Every toast is as wide as the widest, so actions line up. An action is one button
  (`{ label, run }`) that closes its toast and runs. Tower 3D draws its toasts through it too.
- Send home still asks, with what ending a worker costs (`sendHomeAsk`): it ends a turn in flight, which no resume
  brings back. Once a worker is sent home alone, its toast offers Resume, the card's own `calls.resume`, read when
  pressed from the board or its floor's archive ([[board-archive]]): no renderer builds a call.
- Deleting a draft is done at once, and its toast offers Undo. `discard` answers what it deleted (the id and the
  text), and [`restore`](ref:hub/src/shared/drafts.ts#restore) puts it back through `collection/restore`
  ([`restoreItem`](ref:hub/src/collections.ts#restoreItem)): the file under its own id, so its tag, its place in the
  tray and its name on disk are what they were. The id is claimed with an exclusive create, so a restore never
  overwrites, and an id an item holds again is `refused`.
- A framed page may not open `confirm()`, so Tower 3D asks with a first press that arms a destructive button ("sure?",
  the page's question as its tip, the asks shared in `/cards.js` and `/items.js`) and a second press soon after runs it
  ([`confirmed`](ref:hub/renderers/tower3d/src/main.ts#confirmed)).

**Alternatives considered.**
- *Undo as `collection/create` with the same text*: a new id, so a new tag and place; the draft would come back as a
  copy.
- *A delete held back for the toast's lifetime*: the file would stay on disk, on the board and in every other renderer
  while this one shows it gone. "Deleting is the user's" names who deletes, not that a delete can't be undone.
- *`collection/write` recreating a missing item*: it refuses on purpose, so an editor's late autosave never brings
  back a draft deleted elsewhere. Putting back is its own verb.
- *`disabled` while in flight*: the focused button loses focus, and the keyboard lands at the page's start.
- *Toasts in `tower.js`*: tower.js is the API's client; how a renderer tells things is a served module it may skip.

**Impact.** `/press.js` and `/toasts.js` are served modules every renderer may import, and `collection/restore` a
verb. No renderer's press goes unanswered, and a draft deleted anywhere can be put back from its toast.
