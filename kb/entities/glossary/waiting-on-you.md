---
{
  "type": "term",
  "name": "Waiting on you",
  "summary": "A session held by a screen (blocked) or a question (needs_input), or holding an answer or failure that nobody has typed into the session since it arrived, unless the answer is a hire's to its running hirer's prompt; on the board, one wait per such session, in the order to go to them.",
  "in": "tower",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/bridge/status.ts#waitsOnSomeone", "hub/src/bridge/board.ts#attentionOf", "hub/src/bridge/board.ts#waitingOrder", "hub/src/shared/cards.ts#transitions", "hub/src/shared/cards.ts#nextWait", "hub/src/shared/cards.ts#heededWaits"]
}
---
[`waitsOnSomeone`](ref:hub/src/bridge/status.ts#waitsOnSomeone) decides from the log that a session waits; typing into
the session ends an answer's or a failure's wait. A `watching` session ([[watching-status]]) never waits: something it
started will wake it. Whom it waits on is the board's: an answer is read by whoever asked, so a hire's answer to its
hirer's prompt (`promptBy` on its latest conversation) waits on its hirer while the hirer runs. The card then has
`waiting: false` and `waitsOn` (the hirer's current card and callsign), its status word says "waiting on
<CALLSIGN>", and it leaves `board.waiting`, the rings, N and the counts. A screen, a question or a failure of a hire still
waits on you (only someone at its terminal answers those), as does its answer once its hirer stops running, or to a
prompt you typed it. Either way the card's attention ([`attentionOf`](ref:hub/src/bridge/board.ts#attentionOf)) is
`needs` for a screen or a question, `broken` for a failure, `ready` for an answer (decision [[attention-list]]). `board.waiting` lists one **wait** per waiting card
([`waitingOrder`](ref:hub/src/bridge/board.ts#waitingOrder)): `reason` (`blocked`, `asks`, `failed`, `done`, ranked
in that order, then by the longest wait), `since` (the card's `enteredAt`), `detail` (the screen's kind, or the tool it
asks to run) and `key`, `id@since`, which names that one wait: the worker's next wait has another (decision
[[attention-list]]).

What renderers do about waits is shared (`src/shared/cards.ts`, served as `/cards.js`), so every renderer acts on the
same events:

- [`transitions`](ref:hub/src/shared/cards.ts#transitions)`(prev, next)`: the waits that began and ended between two
  boards, nothing on the first board a renderer sees. Notifications, rings and pulses key on it.
- [`nextWait`](ref:hub/src/shared/cards.ts#nextWait)`(waits, visited, here)`: N and ⌥J go round the waits, each once a
  round, skipping the worker you are at.
- Dismissing (✕) a wait takes it out of the viewer's way until the worker waits again
  ([`heededWaits`](ref:hub/src/shared/cards.ts#heededWaits)): counts, N, rings, notifications, Tower 3D's lamps and
  edge arrows. It is the viewer's, never a fact: its keys live in `tower.store` (`waits.dismissed`), shared by their
  renderers in one browser. So does the ring setting (`waits.ring`: once, remind every 30 s, off), with a sound for a
  question (a screen, a tool, a failure) apart from one for an answer (`SOUNDS`, a score each renderer plays).
