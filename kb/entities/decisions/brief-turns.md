---
{
  "type": "decision",
  "name": "The brief shows a conversation's last turns, read from the logs when asked for",
  "summary": "A worker's brief lists the saved conversations of every session it ran as, each with its session and its last brief.pairs turns (a user prompt with Claude's latest answer to it); they are derived from the session logs (and a resume's sources) when /conversations/<id> is read, never kept in facts or on the board, and every renderer draws the earlier sessions folded through one shared view.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/bridge/turns.ts#turnsByConversation", "hub/src/bridge/turns.ts#lastTurns", "hub/src/bridge/turns.ts#briefOf", "hub/src/bridge/turns.ts#BriefSession", "hub/src/bridge/board.ts#LineageSession", "hub/src/shared/brief.ts#briefParts", "hub/src/shared/brief.ts#briefHtml", "hub/src/shared/brief.ts#shownFrom", "hub/src/shared/brief.ts#briefCss", "hub/src/shared/brief.ts#openFolds", "hub/src/shared/model.ts#briefConfig", "hub/src/tower/server.ts#conversations", "hub/src/directory.ts#threadLines", "hub/test/turns.test.ts"],
  "links": [
    { "to": "tower-server", "verb": "reads", "carries": "the session logs of a conversation's resume chain, on each GET /conversations/<id>" },
    { "to": "system-root", "verb": "reads", "carries": "config.json's brief.pairs, project over top level over 2" }
  ]
}
---
**Problem.** The Brief showed one prompt and one answer per conversation: the fold overwrites both, so after a
long session what had been asked and answered before the last turn was unreachable without resuming it, though the
log holds every turn.

**Why.** The Brief exists to see what happened after the terminal is closed. A session usually runs a long
curated prompt, a long working turn and a result, then a short ask to save and its reply: the last two turns are
the useful window.

**Decision.** `GET /conversations/<id>` serves each conversation with `turns`: the last `brief.pairs` (config, the
project's over the top level's, default 2) turns, oldest first, each a user prompt (`prompt.submit` of the user's
own origins) with the latest main-loop `turn.complete` answer until the next prompt; a turn with no answer is still
being worked on. They are read from the log by [`turnsByConversation`](ref:hub/src/bridge/turns.ts#turnsByConversation),
and a resumed conversation continues from its source session's log, read only while the count falls short. Every
renderer draws them latest first (the tower page and Tower 3D briefs, `tower agent`).

**Alternatives considered.**
- *Fold every turn into `Conversation`.* Rejected: full prompt text of every turn of every session would sit in
  memory and in each fold, for something read when a brief opens. The log is the stored fact ([[logs-are-facts]]).
- *Put the turns on the board.* Rejected: the board is pushed on every change and already carries every card
  ([[board-archive]]).
- *Cut by characters or time.* Rejected: a turn is the unit the user reads; a count is predictable.

*The worker's lineage* (2026-10-07, API version 16). A brief held only the session's own conversations: one an
earlier session of the worker held and nobody continued (session 1 worked on A, `/clear`ed to B; session 2 resumed
B) was lost from view, and nothing said which session a conversation or a showing came from.
[`briefOf`](ref:hub/src/bridge/turns.ts#briefOf) now walks the worker's
[`lineage`](ref:hub/src/bridge/chains.ts#lineage) up to the session asked for: its own conversations first, then
each earlier session's, the latest session first, a session's conversations in order. Each carries its `session`
([`BriefSession`](ref:hub/src/bridge/turns.ts#BriefSession): `{id, callsign, startedAt}`). A brief read for an
earlier session holds that session and the ones before it. Every lineage session holds a saved conversation (the
one the next resumed), so a session's place, "session 2 of 3", is counted from the brief alone.
- *One view, in shared code* ([`brief.ts`](ref:hub/src/shared/brief.ts), served as `/brief.js`):
  [`briefParts`](ref:hub/src/shared/brief.ts#briefParts) groups a brief by session, and
  [`briefHtml`](ref:hub/src/shared/brief.ts#briefHtml) draws the session read for in full and each earlier one as a
  `<details>`, closed when drawn, labelled "session 2 of 3 · Oct 6, 21:40 · 1 conversation". A conversation that
  resumes or is resumed by a session in the brief names it by number. The renderer hands in `said`, how a prompt or an
  answer is set: the tower page renders markdown in its sandboxed frame, Tower 3D escapes plain text in its desk panel's
  Logbook and its reader ([[logbook]]). One stylesheet, [`briefCss`](ref:hub/src/shared/brief.ts#briefCss). A redraw keeps the folds the viewer
  opened: the renderer reads them from what it drew ([`openFolds`](ref:hub/src/shared/brief.ts#openFolds)) and hands
  them to the view as `open` (the tower page redraws on every turn of a working worker, Tower 3D's logbook reader on
  every board). The tower page's frame is sandboxed `allow-same-origin` without `allow-scripts`, so the page reads
  its document (folds, and the scroll it keeps for the same worker) while nothing in it runs. Folds are not kept
  past the open brief.
- *Showings say their session.* `card.lineage` ([`LineageSession`](ref:hub/src/bridge/board.ts#LineageSession), oldest
  first) lists the sessions a worker ran as; [`shownFrom`](ref:hub/src/shared/brief.ts#shownFrom) marks a showing's tab
  `s1` with the full label in its title, while the worker has run as more than one.
- `tower agent` prints the current session's conversations in full and one line per earlier session.
- The tower memoizes each log for one read: a lineage brief reads every session's log once.
- *Alternatives.* A `worker` view on the board (settled against with the user, 2026-10-07: the bridge derives the
  lineage). Dropping the turns a resumed conversation reaches back for when the session they came from is in the
  brief: the current session would show "nothing asked yet" right after a resume, with the turns folded away; an
  earlier session's fold repeats them, which is what that session held.

**Consequences.** Opening a brief reads one log per session in the worker's lineage and in each conversation's chain, as `/screen` already does.
`prompt` and `answer` stay as the latest of the whole conversation, which the board and cards use. The reply of
`conversations/<id>` gained `turns` without a version bump: readers that ignore it are unchanged. The lineage moved the
API to version 16: an older renderer would draw earlier sessions' conversations as the current one's.
