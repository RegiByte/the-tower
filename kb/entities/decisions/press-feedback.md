---
{
  "type": "decision",
  "name": "Every press is answered: busy controls, toasts with an action, undo by putting back",
  "summary": "A control that asks the tower something is aria-busy until the reply (pressing in /press.js), found again by its identity through redraws; every button's pressed, held and busy states are drawn by design.css; toasts stack, time out, pause under the pointer or focus and may carry one action (/toasts.js); Kill offers Resume, and deleting a draft is done at once with an Undo that puts its file back under its id (collection/restore).",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-09",
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
**Problem.** The affordances audit of 2026-10-08 (F9, F14, F2, F6) found presses nobody answered. No button had a
pressed, held or in-flight look; Resume, Review, Tidy, End and the worktree verbs stayed live while their request ran,
and a double press on Review hired two reviewers (a per-page `pressOnce` fixed Resume and Review alone, by
`disabled`, which threw the keyboard's focus to the page's start). A toast was one line, the next one overwriting it,
and could carry nothing to do. After Kill the worker left the floor for the archive, its Resume three clicks away.
Deleting a draft asked `confirm()` and could not be taken back.

**Why.** A press with no answer gets pressed again, and every renderer meets the same moments, so the answers are
shared code ([[agents-have-every-capability]], [[renderer-is-disposable]]): a renderer written from scratch imports
them, and nothing it needs lives in the tower page.

**How.**
- [`pressing(control, request)`](ref:hub/src/shared/press.ts#pressing) runs a request for a press and keeps every
  control of the same identity `aria-busy` until it settles. The identity is the one focus is kept by through a
  redraw ([`identityOf`](ref:hub/src/shared/press.ts#identityOf), moved here from `/panels.js`): the tag and the
  attributes naming what it does. A board redraw that replaces the button keeps it busy (a `MutationObserver`,
  connected only while something is in flight), and the same call drawn elsewhere (a card's ↻ and the bar's Resume)
  is busy alike. A press of a busy control is ignored. A control that names nothing fails loudly, since it would mark
  every button. Bar buttons name whom they act on (`data-of="<id>"`). The tower page presses through it for resume,
  review, kill, send home, let go, resume all (one press over every resume, busy to the last reply), tidy (all and per row), the worktree verbs (discard as a destructive press, [[discard]]), what landing changed, ending leftovers, notes and sending them, shells
  and the editor.
- The new-worker form ([`spawnFormHtml`](ref:hub/src/shared/cards.ts#spawnFormHtml), both renderers) stays open while
  its Start is pressed: Start is busy until the spawn answers, Esc and Cancel wait for it, the form closes on a new
  worker and shows a refusal in its own alert line (`data-spawn-error`), the prompt still in place to fix and start
  again. A form closed while Start was in flight would have kept as a draft a prompt the new worker already had.
- [`designCss`](ref:hub/src/shared/design.ts#designCss) draws every button's states, whatever the renderer's own
  look: `:active` sinks a pixel, `disabled` or `aria-disabled` (held, which stays focusable) fades to .45, and
  `aria-busy` sweeps a bar along its foot in its own text colour, still at full contrast; with reduced motion the bar
  stands still. Inactive controls are outside WCAG's contrast rule, and the bar adds no colour pair to `tool:contrast`.
- [`toaster(element)`](ref:hub/src/shared/toasts.ts#toaster) makes an element the page's toast stack, a polite live
  region: up to four at once, the oldest leaving first, 4 s each or 8 s with an action, none leaving while the pointer
  or focus is on the stack. A toast told again while the same one shows
  ([`sameToast`](ref:hub/src/shared/toasts.ts#sameToast): the same words and the same action's label) is merged into
  it: it moves to the end with its time anew, its action the newest, and counts the times (`×2`), so pressing a key
  that finds nothing leaves one toast. The stack is one column as wide as its widest toast, so edges, counts and
  actions line up in place of each toast centring on its own. An action is one button (`{ label, run }`) that closes
  its toast and runs.
- Kill still asks, with what killing costs (`KILL_COST`): it ends a turn in flight, which no resume brings back. Once
  killed, its toast offers Resume, the dead card's own `calls.resume`, read when pressed from the board or, once the
  board has left it out, from its floor's archive ([[board-archive]]): no renderer builds a call.
- Deleting a draft is done at once, with no question, and its toast offers Undo. `discard` answers what it deleted
  (the id and the text the file held), and [`restore`](ref:hub/src/shared/drafts.ts#restore) puts it back through
  `collection/restore` ([`restoreItem`](ref:hub/src/collections.ts#restoreItem)): the file under its own id, so its
  tag, its place in the tray and its name on disk are what they were. The id is claimed with an exclusive create, so
  a restore never overwrites, and an id an item holds again is `refused`. API 1.17.

**Alternatives considered.**
- *Undo as `collection/create` with the same text*: a new id, so a new tag and a new place in the tray; the draft
  would come back as a copy, which an "Undo" would misname.
- *A delete held back for the toast's 8 s*: the file would still be on disk, on the board and in every other
  renderer while this one shows it gone, and closing the tab inside the window would keep it. "Deleting is the
  user's" names who deletes, not that a delete can't be undone: the user deletes and the user puts back, and the tower
  says what happened at each step.
- *`collection/write` recreating a missing item*: it refuses on purpose, so an editor's late autosave never brings
  back a draft deleted elsewhere. Putting back is its own verb, asked for by name.
- *`disabled` while in flight*: the focused button loses focus, and the keyboard lands at the page's start.
- *Busy as a pulse of the whole button*: its words would fade below AA while it pulses.
- *Identical by words alone*: "Deleted X" with Undo and a plain "Deleted X" would merge, and one would lose or gain a
  button. *A count with the first toast's place kept*: the newest would not be last, and the stack reads oldest first.
- *A stack aligned on one edge, each toast its own width*: a ragged right edge, with the actions at different places.
- *Toasts in `tower.js`*: tower.js is the API's client; how a renderer tells things is a served module it may skip.

**Impact.** `/press.js` and `/toasts.js` are new served modules, `collection/restore` a new verb (API 1.17), and
`discard` in `/drafts.js` now answers what it deleted. Tower 3D draws its toasts through `/toasts.js` too, raised
above its HUD: sending a worker home (its hold, or the desk's second press) toasts with Resume, read from the board
or its floor's archive, and a draft deleted from its editor or thrown away from the corkboard (held X, its text read
first) toasts with Undo through `restore`; the editor's Delete no longer asks. Its other destructive buttons press through `/press.js` too:
a shelf page may not open `confirm()`, so each asks where the page confirms with a first press that arms it,
"sure?" with the page's question as its tip (`sendHomeAsk`, `reapAsk`, `killShellAsk`, `letGoAsk`, `resumeAllAsk`,
`tidyRowAsk`, `tidyAllAsk`, `deleteAsk`, shared in `/cards.js` and `/items.js`), and the second press within 3 s
runs busy until the reply; ending one leftover process acts at once, as on the page.
