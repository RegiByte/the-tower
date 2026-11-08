---
{
  "type": "decision",
  "name": "The brief: a worker's last turns across its lineage, each with Claude's steps, read from the logs when asked, drawn as a chat",
  "summary": "A worker's brief lists the saved conversations of every session it ran as, each with its session and its last brief.pairs turns (a user prompt or another worker's message, what Claude did on the way: its words between tool calls, each tool call in one line, the messages it sent, and its latest answer, with when each was given); they are derived from the session logs when /conversations/<id> is read, never kept in facts or on the board, and a conversation reads whole, or one tool call in full, on demand. One shared view draws it inline in every renderer as a chat in time order: the earlier sessions folded at the top, prompts and answers as bubbles, steps between them, long ones folded, markdown rendered or raw by the viewer's choice.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-11-07",
  "refs": [
    "hub/src/bridge/turns.ts#turnsByConversation",
    "hub/src/bridge/turns.ts#turnsOf",
    "hub/src/bridge/turns.ts#stepsOf",
    "hub/src/bridge/turns.ts#Step",
    "hub/src/bridge/turns.ts#toolLine",
    "hub/src/bridge/turns.ts#toolCallOf",
    "hub/src/bridge/turns.ts#wholeConversation",
    "hub/src/bridge/messages.ts#deliveries",
    "hub/src/shared/brief.ts#toolCallHtml",
    "hub/src/shared/brief.ts#openTools",
    "hub/src/shared/brief.ts#withWhole",
    "hub/src/shared/brief.ts#wholeHolds",
    "hub/src/shared/brief.ts#joinedWholes",
    "hub/src/shared/brief.ts#withWholesRead",
    "hub/src/shared/brief.ts#toolCallSettled",
    "hub/src/shared/brief.ts#saidWhat",
    "hub/src/tower/http.ts#conversation",
    "hub/src/tower/http.ts#toolCall",
    "hub/src/tail.ts#hookEvents",
    "hub/src/bridge/turns.ts#briefOf",
    "hub/src/bridge/turns.ts#Turn",
    "hub/src/bridge/turns.ts#BriefSession",
    "hub/src/bridge/turns.ts#PeerFrom",
    "hub/src/bridge/messages.ts#delivered",
    "hub/src/bridge/messages.ts#receipts",
    "hub/src/bridge/board.ts#LineageSession",
    "hub/src/shared/brief.ts#briefParts",
    "hub/src/shared/brief.ts#briefHtml",
    "hub/src/shared/brief.ts#BriefView",
    "hub/src/shared/brief.ts#shownFrom",
    "hub/src/shared/brief.ts#resumedIdle",
    "hub/src/shared/brief.ts#briefCss",
    "hub/src/shared/brief.ts#openFolds",
    "hub/src/shared/brief.ts#expandedSaid",
    "hub/src/shared/brief.ts#saidText",
    "hub/src/shared/brief.ts#saidOf",
    "hub/src/shared/brief.ts#BRIEF_MARKDOWN_KEY",
    "hub/src/shared/settings.ts#markdownSection",
    "hub/src/shared/markdown.ts#markdownCss",
    "hub/src/shared/markdown.ts#fenceText",
    "hub/src/shared/highlight.ts#fenceLang",
    "hub/src/shared/highlight.ts#highlightCss",
    "hub/extensions/reviews/client/panel.ts#reviewsHtml",
    "hub/src/shared/model.ts#briefConfig",
    "hub/src/tower/http.ts#conversations",
    "hub/src/directory.ts#threadLines",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/renderers/tower3d/src/ui.ts#logbookHtml",
    "hub/renderers/tower3d/src/main.ts#chooseBriefMarkdown",
    "hub/test/turns.test.ts"
  ],
  "links": [
    { "to": "tower-server", "verb": "reads", "carries": "the session logs of a worker's lineage and each conversation's resume chain, on each GET /conversations/<id>, a conversation whole on GET /conversations/<id>/<conversation>, and one call on GET /conversations/<id>/tool/<call>" },
    { "to": "system-root", "verb": "reads", "carries": "config.json's brief.pairs, project over top level over 2" },
    { "to": "markdown-safe", "verb": "uses", "carries": "markdownHtml as said, inline; markdownCss" },
    { "to": "shared-panels", "verb": "extends", "carries": "review note bodies as markdown" },
    { "to": "logbook", "verb": "extends", "carries": "the Logbook draws the same brief" }
  ]
}
---
**Problem.** The brief is where the user reads what a worker did after its terminal is closed. The fold keeps only a
conversation's latest prompt and answer, so what was asked and answered before the last turn, in an earlier session
of the same worker, or by another worker's message, is unreachable without resuming it, though the logs hold every
turn. And a dialogue read latest first, raw, unfoldable and uncopyable reads badly.

**Why.** A session usually runs a long curated prompt, a long working turn and a result, then a short ask and its
reply: the last turns are the useful window. A worker is its lineage of sessions, not one session. Since
[`markdownHtml`](ref:hub/src/shared/markdown.ts#markdownHtml) is safe by construction ([[markdown-safe]]), every
renderer can draw the brief alike, inline.

**Decision.**
- *Turns, from the logs.* `GET /conversations/<id>` ([`conversations`](ref:hub/src/tower/http.ts#conversations))
  serves each conversation with its last `brief.pairs` turns ([`briefConfig`](ref:hub/src/shared/model.ts#briefConfig)),
  oldest first, and `earlier` when it holds turns before them. A turn ([`Turn`](ref:hub/src/bridge/turns.ts#Turn)) is a
  user prompt or a message another worker sent, with Claude's latest main-loop answer before the next prompt; a turn
  with no answer is still being worked on. [`turnsByConversation`](ref:hub/src/bridge/turns.ts#turnsByConversation)
  reads them from the log, and [`turnsOf`](ref:hub/src/bridge/turns.ts#turnsOf) continues a resumed conversation into
  its source session's log only while the count falls short. Every read of a brief, a conversation or a tool call
  parses only the log's hook lines ([`hookEvents`](ref:hub/src/tail.ts#hookEvents)), all they fold from: the
  terminal's output, most of a log's bytes, is skipped unparsed, so a read stays cheap on a long session.
  [`wholeConversation`](ref:hub/src/bridge/turns.ts#wholeConversation) gives every turn of one conversation, at
  `GET /conversations/<id>/<conversation>` ([`conversation`](ref:hub/src/tower/http.ts#conversation)). `tower agent`
  prints the brief, and where a conversation's `earlier` is set, the exact `tower agent <CALLSIGN> <conversation>` that
  prints every turn, oldest first: a reviewer takes a worker's goal from it, and the goal is often before the last
  turns. An earlier session's conversations each get that command, since it shows none of their turns. The prompt
  opening a hired worker's first conversation is named as its hirer's: `promptBy` covers only a latest prompt.
- *Steps, since 1.133.* A turn carries `steps` ([`Step`](ref:hub/src/bridge/turns.ts#Step)), what Claude did between
  its prompt and its answer, read from the log by [`stepsOf`](ref:hub/src/bridge/turns.ts#stepsOf): its words between
  tool calls (`turn.step`'s `answer`), each main-loop tool call in one line
  ([`toolLine`](ref:hub/src/bridge/turns.ts#toolLine): its telling field, a path relative to the session's folder)
  with how it ended (`tower.tool.result`, `tower.tool.abandoned`) and how long it ran (`PostToolUse`), and each message
  it sent another worker (`session.send`, its recipient named through
  [`deliveries`](ref:hub/src/bridge/messages.ts#deliveries); its `SendMessage` call is not drawn again). A step's calls
  are logged before its words, since they run while Claude streams: the fold puts the words first. The answer is not a
  step. A subagent's events stay out, its steps counted on the `Agent` call that started it (`agent.spawn`). A call
  reads in full on demand at `GET /conversations/<id>/tool/<call>` ([`toolCallOf`](ref:hub/src/bridge/turns.ts#toolCallOf),
  [`toolCall`](ref:hub/src/tower/http.ts#toolCall)): its input as logged, its permission check, how it ended, its
  error. The tool's output is not in the log (the host leaves it out), so it is not served. A question dialog
  (`AskUserQuestion`) is the exception that carries its answer in the input: Claude logs `answers` (question to label
  chosen) and `annotations` only in `PostToolUse`'s `tool_input`, so its line reads each question, led by its header, with the
  answer and the user's note on one line and never clipped, `unanswered` while none is logged, a call whose `questions`
  is no array taking the generic line, and the full read prefers `PostToolUse`'s input once it
  arrived. `tower agent` prints a turn's dialog lines between its prompt and its answer, so a reviewer sees decisions
  made in a dialog.
- *Workers' messages are turns.* A prompt of peer origin whose text is a delivery from another Claude session
  ([`delivered`](ref:hub/src/bridge/messages.ts#delivered)) opens a turn carrying `from`
  ([`PeerFrom`](ref:hub/src/bridge/turns.ts#PeerFrom)): the sender's callsign, and its session when
  [`receipts`](ref:hub/src/bridge/messages.ts#receipts) finds it. Peer turns count toward `brief.pairs` like any other
  (a predictable count; a coordinator whose instruction scrolls out raises `pairs`). Task notifications, idle notices
  and subagent hand-backs open no turn. A conversation's `prompt`, on the board and cards, stays the user's.
- *The worker's lineage.* [`briefOf`](ref:hub/src/bridge/turns.ts#briefOf) walks the worker's
  [`lineage`](ref:hub/src/bridge/chains.ts#lineage) up to the session asked for, each conversation carrying its
  `session` ([`BriefSession`](ref:hub/src/bridge/turns.ts#BriefSession)). Every lineage session holds a saved
  conversation (the one the next resumed), so "session 2 of 3" is counted from the brief alone. `card.lineage`
  ([`LineageSession`](ref:hub/src/bridge/board.ts#LineageSession)) lists the sessions a worker ran as, and
  [`shownFrom`](ref:hub/src/shared/brief.ts#shownFrom) marks a showing with the session it came from.
- *One view, in shared code* ([`brief.ts`](ref:hub/src/shared/brief.ts), `/brief.js`):
  [`briefParts`](ref:hub/src/shared/brief.ts#briefParts) groups a brief by session and
  [`briefHtml`](ref:hub/src/shared/brief.ts#briefHtml) draws it in time order as a chat: earlier sessions folded at the
  top, then the session read for. A resume never given a prompt says so
  ([`resumedIdle`](ref:hub/src/shared/brief.ts#resumedIdle)). The user's prompts, workers' messages and Claude's
  answers are bubbles of their own kind; a hired worker's launch prompt is headed by its hirer. A turn's steps sit
  between its prompt and its answer: Claude's words as quiet text, a message it sent as a bubble to its recipient, a
  tool call as a `<details>` line that, opened, the renderer reads once and draws with
  [`toolCallHtml`](ref:hub/src/shared/brief.ts#toolCallHtml), kept once it ended
  ([`toolCallSettled`](ref:hub/src/shared/brief.ts#toolCallSettled): one still running is read again as it is drawn
  open); a run of five or more calls folds to its count, naming
  those that failed, were denied or stopped. "earlier turns" on a conversation reads it whole, drawn in place
  ([`withWhole`](ref:hub/src/shared/brief.ts#withWhole)) and joined to each later read's last turns of it
  ([`joinedWholes`](ref:hub/src/shared/brief.ts#joinedWholes)): a turn once past never changes, so its turns before
  those, then those, are the conversation whole as of that read, with no read of its own. Only when a read's last turns
  start past every turn the whole holds, turns having come between, is it read whole again
  ([`withWholesRead`](ref:hub/src/shared/brief.ts#withWholesRead), the one read step both renderers share); one that
  fails to read is let go and said, and the brief is drawn as read. So a worker at work, its
  latest turn moving with each tool call and message, keeps it whole and what the viewer expanded in it open. The
  earlier `keptWholes` and `wholeHolds` (1.161) stay served for renderers that use them. A
  tool call opened while it runs is drawn as last read until it is read again. A
  brief shown is read again whenever its card's status, tool, conversations or their additions move
  ([`briefKey`](ref:hub/src/shared/brief.ts#briefKey)), in the page's Brief and Tower 3D's logbook alike. A message to a subagent is its `SendMessage` call, its
  address no worker's. Each bubble copies
  its text as written, read from the reply the renderer holds ([`saidText`](ref:hub/src/shared/brief.ts#saidText),
  [`saidWhat`](ref:hub/src/shared/brief.ts#saidWhat) naming it),
  never from the html. A long prompt or answer folds to its start in CSS alone; the brief's latest answer never folds, and stays shown in
  full once a later turn comes ([`expandedSaid`](ref:hub/src/shared/brief.ts#expandedSaid)), so what arrives folds
  nothing the viewer reads.
  A renderer passes `adds` to draw what extensions contribute to a conversation (its badges, its actions) on that
  conversation's heading, and `acts` (since 1.118) what is offered on a prompt, an answer, or Claude's words or message
  on the way (`said`, side `step.<n>` since 1.133, [[ui-model]]) beside
  its copy, each by the key [`saidOf`](ref:hub/src/shared/brief.ts#saidOf) gives it: the view is pure and draws
  nothing when they are not given.
- *Rendered or raw* is a viewer's choice in `tower.store`
  ([`BRIEF_MARKDOWN_KEY`](ref:hub/src/shared/brief.ts#BRIEF_MARKDOWN_KEY),
  [`markdownSection`](ref:hub/src/shared/settings.ts#markdownSection)): view state, not config
  ([[renderer-is-disposable]]). Rendered, it is `markdownHtml` with highlighted fences
  ([`fenceLang`](ref:hub/src/shared/highlight.ts#fenceLang), [`fenceText`](ref:hub/src/shared/markdown.ts#fenceText),
  [`markdownCss`](ref:hub/src/shared/markdown.ts#markdownCss), [`highlightCss`](ref:hub/src/shared/highlight.ts#highlightCss));
  a review note's body is drawn the same way in the shared Reviews panel
  ([`reviewsHtml`](ref:hub/extensions/reviews/client/panel.ts#reviewsHtml)).
- *Inline in every renderer.* The tower page draws it in its Brief pane, Tower 3D in its desk's
  [Logbook](ref:hub/renderers/tower3d/src/ui.ts#logbookHtml) ([[logbook]]), and `tower agent` prints the current
  session's conversations in full ([`threadLines`](ref:hub/src/directory.ts#threadLines)) and one line per earlier
  session. A redraw keeps what the viewer opened, read back from what it drew
  ([`openFolds`](ref:hub/src/shared/brief.ts#openFolds), [`expandedSaid`](ref:hub/src/shared/brief.ts#expandedSaid),
  [`openTools`](ref:hub/src/shared/brief.ts#openTools)), kept no longer than the open brief. The page's Brief reads
  again as the worker calls each tool (`card.tool` moves), so steps arrive while it works.

**Alternatives considered.**
- *Fold every turn into `Conversation`.* Full prompt text of every turn of every session would sit in memory and in
  each fold, for something read when a brief opens. The log is the stored fact ([[logs-are-facts]]).
- *Put the turns, or a `worker` view, on the board.* The board is pushed on every change and already carries every
  card ([[board-archive]]); the bridge derives the lineage.
- *Cut by characters or time.* A turn is the unit the user reads; a count is predictable.
- *Keep the brief in a frame and wire copy and folds from the parent.* Needs `allow-same-origin`, and every control
  is wired twice. The guarantee rests on `markdownHtml` and its test.
- *The text to copy in a data attribute.* Every prompt and answer twice in the html; the renderer holds the reply.
- *Steps on the board, or every call's input in the brief.* A call's input runs to a hundred KB (a `Write`'s content);
  a line each is small, the input is read when opened.
- *A tool's output, from Claude's transcript.* Couples the tower to Claude's private file format; the input and how it
  ended say what a call did, and nobody asked for more.

**Consequences.** Opening a brief reads one log per session in the worker's lineage and in each conversation's chain,
as `/screen` does. `prompt` and `answer` stay the latest of the whole conversation, which the board and cards use. A
renderer that draws `markdownHtml` or the Reviews panel adds `markdownCss` and wires `data-copy-code`.
