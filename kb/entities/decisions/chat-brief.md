---
{
  "type": "decision",
  "name": "The brief reads as a chat, drawn inline by every renderer",
  "summary": "A worker's brief is drawn top to bottom in time, the latest exchange at the bottom: the user's prompts as bubbles on one side, Claude's answers on the other, each with its time and how long Claude took (answeredAt, derived from the log). Words are markdown through markdownHtml, inline in both renderers with no frame, fences highlighted and copyable; long words fold with a CSS-only show all; each viewer picks rendered or raw in tower.store, offered in the brief and in the settings popover. Review notes render through markdownHtml too.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-08",
  "refs": [
    "hub/src/shared/brief.ts#briefHtml",
    "hub/src/shared/brief.ts#briefCss",
    "hub/src/shared/brief.ts#expandedSaid",
    "hub/src/shared/brief.ts#saidText",
    "hub/src/shared/brief.ts#BRIEF_MARKDOWN_KEY",
    "hub/src/shared/brief.ts#BriefView",
    "hub/src/shared/settings.ts#markdownSection",
    "hub/src/shared/markdown.ts#markdownCss",
    "hub/src/shared/markdown.ts#fenceText",
    "hub/src/shared/highlight.ts#fenceLang",
    "hub/src/shared/highlight.ts#highlightCss",
    "hub/src/shared/panels.ts#reviewsHtml",
    "hub/src/bridge/turns.ts#Turn",
    "hub/renderers/page/index.html",
    "hub/renderers/tower3d/src/ui.ts#logbookHtml",
    "hub/renderers/tower3d/src/main.ts#chooseBriefMarkdown",
    "hub/scripts/contrast.ts"
  ],
  "links": [
    { "to": "brief-turns", "verb": "extends", "carries": "turns drawn oldest first, with answeredAt" },
    { "to": "markdown-safe", "verb": "uses", "carries": "markdownHtml as said, inline; markdownCss" },
    { "to": "shared-panels", "verb": "extends", "carries": "review note bodies as markdown" },
    { "to": "logbook", "verb": "extends", "carries": "the Logbook draws the same chat" }
  ]
}
---
**Problem.** The brief read backwards and raw. Inside a conversation the turns ran latest first, so an answer sat
above its question above the previous answer. Long answers had no fold and pushed earlier turns far down. Nothing
could be copied. On the tower page the brief lived in an `allow-same-origin` frame, redrawn whole on each turn of a
working worker, its folds and scroll recovered by reading the frame's document; Tower 3D showed escaped raw markdown,
since its desk panel has no script-less frame. Review notes were raw markdown in both. A turn did not say when Claude
answered.

**Why.** The brief is where the user reads what a worker did after the terminal closes; it is a dialogue, and reads
best as one. Once [`markdownHtml`](ref:hub/src/shared/markdown.ts#markdownHtml) made markdown safe by construction
([[markdown-safe]]), the frame was the only reason the two renderers drew it differently.

**Decision** (the user's answers to the brief audit, 2026-10-08, D1–D7):
- *D1, order.* The brief runs in time: the earlier sessions folded at the top, oldest first, then the session read
  for, its conversations in order and each conversation's turns oldest first. Opening a brief scrolls to its end; a
  redraw stays at the end when the viewer was there.
- *Bubbles.* [`briefHtml`](ref:hub/src/shared/brief.ts#briefHtml) draws a turn as a prompt on the right ("YOU · 18:35",
  or the hirer's name on a hired worker's launch prompt, from `promptBy`) and Claude's answer stretched on the left
  ("CLAUDE · 18:41 · took 6m 12s"), "working on it" with the working lamp on the brief's latest prompt while the
  worker's status is working (the renderer passes `working`), "no answer" on any other unanswered prompt (one
  interrupted, a past session's). Each bubble has a copy button (`data-copy-said`, keyed by session, conversation and
  turn, since a resumed conversation's turns are drawn again in the session that resumed it); the renderer reads the text
  as written from the reply it holds ([`saidText`](ref:hub/src/shared/brief.ts#saidText)), never from the html.
- *D2, rendered or raw.* A viewer's choice in `tower.store` under
  [`BRIEF_MARKDOWN_KEY`](ref:hub/src/shared/brief.ts#BRIEF_MARKDOWN_KEY), rendered unless set: a segmented control at
  the brief's top and a section of the settings popover
  ([`markdownSection`](ref:hub/src/shared/settings.ts#markdownSection)), both `data-brief-markdown`. View state, not
  config ([[renderer-is-disposable]]).
- *D4, inline.* Both renderers put the brief in an element: the tower page's `#brief`, Tower 3D's desk Logbook and its
  reader. The page draws it with `drawPanel` (replaced only when the html changes); what a viewer opened is read back
  from what was drawn, the earlier sessions' folds ([`openFolds`](ref:hub/src/shared/brief.ts#openFolds)) and the long
  words shown in full ([`expandedSaid`](ref:hub/src/shared/brief.ts#expandedSaid)).
- *D5, when Claude answered.* A turn carries `answeredAt`, the time of the `turn.complete` that set its answer
  ([`Turn`](ref:hub/src/bridge/turns.ts#Turn)), read from the log like the rest of it. Prompts from peers (a hired
  worker's later instructions by `SendMessage`) as their own kind of bubble are deferred: they change what a turn is.
- *D6, folds.* A prompt or answer over 1,500 characters or 30 lines is folded to its start with a "show all" that is a
  checkbox and CSS alone; the brief's latest answer never folds. The thresholds are constants.
- *D7, notes.* A review note's body is drawn through `markdownHtml` in the shared Reviews panel
  ([`reviewsHtml`](ref:hub/src/shared/panels.ts#reviewsHtml)), so both renderers show it formatted.
- *Code.* `markdownHtml` draws each fence as a `<figure class="code">` with its syntax marked by
  [`fenceLang`](ref:hub/src/shared/highlight.ts#fenceLang) and `highlightLines`, and a `data-copy-code` button
  ([`fenceText`](ref:hub/src/shared/markdown.ts#fenceText) reads its code); its links open a tab of their own, since
  the words now sit in the renderer's page, and a single line break is kept (`breaks`, as in a comment on GitHub: a
  review note's first line, a prompt typed over lines). [`markdownCss`](ref:hub/src/shared/markdown.ts#markdownCss) sets words
  under `.md`, with the syntax colours of [`highlightCss`](ref:hub/src/shared/highlight.ts#highlightCss), shared
  with the Changes and Reviews panels.

**Alternatives considered.**
- *Keep the frame, wire copy and folds from the parent.* Defence in depth, but `allow-same-origin` stays, Tower 3D still
  can't render markdown, and every control is wired twice. The guarantee rests on `markdownHtml` and its test instead.
- *A raw toggle on each bubble.* The choice is the viewer's for every brief; one control at the top says so.
- *The text to copy in a data attribute.* Every prompt and answer twice in the html; the renderer holds the reply.
- *Folds as config (`brief.fold`).* Nobody asked for it; a constant until someone does.
- *Conversations latest first, turns oldest first.* Scrolling to the end would land in the oldest conversation.

**Impact.** API 1.11: `briefHtml` takes optional `expanded`, `markdown` and `working` (an older call draws rendered
with nothing expanded and nothing at work), `/brief.js`, `/markdown.js` and `/settings.js` gain exports, a turn gains `answeredAt`. A renderer that
draws `markdownHtml` or the Reviews panel adds `markdownCss` beside `panelsCss` and wires `data-copy-code`. Contrast:
a prompt bubble's words and inline code are measured by `npm run tool:contrast`; links and "show all" in a prompt
bubble take the ink, since the accent on its tint falls short of AA in the light scheme.
