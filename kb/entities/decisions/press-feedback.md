---
{
  "type": "decision",
  "name": "Every press is answered: busy controls, toasts with an action, undo by putting back",
  "summary": "A control that asks the tower something is aria-busy until the reply (pressing in /press.js), found again by its identity through redraws; every button's pressed, held and busy states are drawn by design.css; toasts stack, time out, pause under the pointer or focus and may carry one action (/toasts.js); sending one worker home offers Resume, and deleting a draft is done at once with an Undo that puts its file back under its id (collection/restore).",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-23",
  "refs": [
    "hub/src/shared/press.ts#pressing",
    "hub/renderers/page/dialogs.js#dialogs",
    "hub/src/shared/press.ts#identityOf",
    "hub/src/shared/toasts.ts#toaster",
    "hub/src/shared/toasts.ts#sameToast",
    "hub/src/shared/toasts.ts#toastsCss",
    "hub/renderers/tower3d/src/main.ts#sendHome",
    "hub/src/shared/design.ts#designCss",
    "hub/src/shared/drafts.ts#discard",
    "hub/src/shared/drafts.ts#restore",
    "hub/src/collections.ts#restoreItem",
    "hub/src/shared/cards.ts#spawnFormHtml",
    "hub/renderers/page/worker.js#resumeSentHome",
    "hub/src/shared/spawn.ts#spawnHandlers",
    "hub/renderers/tower3d/src/main.ts#confirmed",
    "hub/renderers/tower3d/src/ui.ts#askingButton",
    "hub/src/shared/cards.ts#sendHomeAsk"
  ]
}
---
**Problem.** Presses went unanswered: buttons had no pressed, held or in-flight look, verbs stayed live while their
request ran (a double press hired two reviewers), a toast was one line the next overwrote, a worker sent home was
three clicks from its Resume, and a deleted draft could not be taken back.

**Why.** A press with no answer gets pressed again, and every renderer meets the same moments, so the answers are
shared code ([[agents-have-every-capability]], [[renderer-is-disposable]]): a renderer written from scratch imports
them.

**How.**
- [`pressing(control, request)`](ref:hub/src/shared/press.ts#pressing) keeps every control of the same identity
  `aria-busy` until the request settles, and ignores a press of a busy one. The identity is the tag and the
  attributes naming what the control does ([`identityOf`](ref:hub/src/shared/press.ts#identityOf)), so a button a
  board redraw replaces, or the same call drawn elsewhere, is busy alike. A control that names nothing fails loudly,
  since it would mark every button of its tag.
- The new-worker form ([`spawnFormHtml`](ref:hub/src/shared/cards.ts#spawnFormHtml)) stays open while Start is busy,
  closes on a new worker and shows a refusal in its own alert line with the prompt still in place, so a prompt a
  worker already has is never kept as a draft. Starting is a state of its machine
  ([`spawnHandlers`](ref:hub/src/shared/spawn.ts#spawnHandlers)), and Start's `aria-busy` is drawn from it; a start
  that fails after the browser closed the form anyway (a second Esc) opens it again on its error.
- [`designCss`](ref:hub/src/shared/design.ts#designCss) draws every button's states whatever the renderer's look:
  pressed, held (`disabled` or `aria-disabled`, which stays focusable) and busy, still under reduced motion.
- [`toaster(element)`](ref:hub/src/shared/toasts.ts#toaster) makes an element a polite live region of stacked toasts
  that time out, pause while the pointer or focus is on them, and may carry one action that closes its toast and
  runs. A toast told again while it shows ([`sameToast`](ref:hub/src/shared/toasts.ts#sameToast)) moves to the end
  and counts the times. Tower 3D draws its toasts through it too.
- Send home still asks, saying what it costs ([`sendHomeAsk`](ref:hub/src/shared/cards.ts#sendHomeAsk)): a turn in
  flight is lost. A worker sent home alone gets a toast offering Resume: the card's own `resume` call, read when
  pressed from the board or its floor's archive ([[board-archive]]), so no renderer builds a call.
- Deleting a draft is done at once, and its toast offers Undo. `discard` answers the id and text it deleted, and
  [`restore`](ref:hub/src/shared/drafts.ts#restore) puts the file back under its own id through `collection/restore`
  ([`restoreItem`](ref:hub/src/collections.ts#restoreItem)), so its tag, its place and its name are what they were.
  The id is claimed with an exclusive create: a restore never overwrites, and an id taken again is refused.
- The tower page asks in a dialog of its own, drawn from the design's tokens, never the browser's `confirm()`
  ([`dialogs`](ref:hub/renderers/page/dialogs.js#dialogs)), its go-ahead button named for the verb.
- A framed page may not open `confirm()`, so Tower 3D's destructive buttons arm on a first press ("sure?", the
  shared ask as its tip) and run on a second soon after ([`confirmed`](ref:hub/renderers/tower3d/src/main.ts#confirmed),
  [`askingButton`](ref:hub/renderers/tower3d/src/ui.ts#askingButton)).

**Alternatives considered.**
- *Undo as `collection/create` with the same text*: a new id, so a new tag and place; the draft comes back a copy.
- *A delete held back for the toast's lifetime*: the file stays on disk and on the board, and every other renderer
  shows it while this one shows it gone.
- *`collection/write` recreating a missing item*: it refuses on purpose, so an editor's late autosave never brings
  back a draft deleted elsewhere. Putting back is its own verb.
- *`disabled` while in flight*: the focused button loses focus, and the keyboard lands at the page's start.
- *Toasts in `tower.js`*: tower.js is the API's client; how a renderer tells things is a served module it may skip.

**Impact.** `/press.js` and `/toasts.js` are served modules every renderer may import, and `collection/restore` is a
verb.
