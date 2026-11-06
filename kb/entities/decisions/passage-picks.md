---
{
  "type": "decision",
  "name": "Text picked in a shown document is a passage subject, read from the page and acted on over the frame",
  "summary": "A selection in a markdown document drawn by sections or a text file drawn as written (a showing, a kept item, a shelf file) becomes a passage subject once it stops changing: the page reads the frame's selection on each animation frame, since nothing in the frame is heard, and a shared machine (/picks.js) says when it settles. The passage carries its words, its sections and its source lines (read from comments sectionsHtml writes before each block), is lit by a CSS highlight, and the page draws what acts on it (passage.acts) in a box over the frame. The bundled passages extension's composer types a prompt about it into the worker that showed the document.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-05",
  "reviewed": "2026-11-05",
  "refs": [
    "hub/src/shared/picks.ts",
    "hub/src/shared/picks.ts#PICK_HANDLERS",
    "hub/src/shared/picks.ts#SETTLE_MS",
    "hub/src/shared/markdown.ts#sectionsHtml",
    "hub/src/shared/markdown.ts#SOURCE_MARK",
    "hub/src/shared/markdown.ts#linesPicked",
    "hub/src/shared/subjects.ts#Passage",
    "hub/src/shared/subjects.ts#passageSubject",
    "hub/src/shared/subjects.ts#parentOf",
    "hub/src/views/sections.ts#drawSections",
    "hub/src/views/passages.ts#pickPassages",
    "hub/src/views/passages.ts#offsetIn",
    "hub/src/views/text.ts#mount",
    "hub/src/shared/picks.ts#textLines",
    "hub/src/shared/extensions.ts#RESERVED",
    "hub/renderers/page/renderer.json",
    "hub/extensions/passages/extension.json",
    "hub/extensions/passages/client/composer.ts#askPrompt",
    "hub/extensions/passages/client/composer.ts#mount",
    "hub/scripts/webkit.ts"
  ],
  "links": [
    { "to": "markdown-safe", "verb": "follows", "carries": "nothing of the renderer's in the frame, nothing heard there" },
    { "to": "agent-show", "verb": "extends", "carries": "a showing's passages" },
    { "to": "machines", "verb": "follows", "carries": "/picks.js" },
    { "to": "ui-model", "verb": "extends", "carries": "the passage viewer subject and the passage.acts region" },
    { "to": "extensions", "verb": "uses", "carries": "the passages extension's composer view" }
  ]
}
---
**Problem.** A user reading a plan or a report a worker showed wants to answer one part of it: "this paragraph is
wrong", "expand this". To do that they had to copy the words, switch to the worker's terminal, paste them and say
which file and where. The section commands in the gutter ([[markdown-safe]]) act on a whole section, not on a
sentence the user picked.

**Decision.**
- *A passage is a viewer subject* ([`passageSubject`](ref:hub/src/shared/subjects.ts#passageSubject), API 1.154),
  like `lines` picked in a worker's Changes: never on the board, a child of the showing or item the document is
  ([`parentOf`](ref:hub/src/shared/subjects.ts#parentOf)). Its [`Passage`](ref:hub/src/shared/subjects.ts#Passage)
  holds the quote as the document draws it (also its `body`, typed `text/plain`, so anything that reads a subject's
  text reads it), the sections it touches, the first one's heading, and the source lines of the blocks it starts and
  ends in. For a showing of a file it also holds the worker's card and the file's real path.
- *Two kinds of document, one capture.* [`pickPassages`](ref:hub/src/views/passages.ts#pickPassages) holds
  everything about picking in a frame where nothing runs: the selection read, the machine, the highlight, the box and
  its region. A view hands it its frame and says where a range is in its own terms (`Where`). `tower/document` and
  `tower/shelf` (by `drawSections`) say sections and block lines; [`tower/text`](ref:hub/src/views/text.ts#mount),
  which draws plain text, source code and JSON as written, says exact lines: its frame's text is the file's, so the
  characters before each end of the range ([`offsetIn`](ref:hub/src/views/passages.ts#offsetIn)) give the lines
  ([`textLines`](ref:hub/src/shared/picks.ts#textLines)), and the quote keeps its indentation.
- *Source lines are data the document carries.* [`sectionsHtml`](ref:hub/src/shared/markdown.ts#sectionsHtml)
  writes a comment `src:<from>-<to>` ([`SOURCE_MARK`](ref:hub/src/shared/markdown.ts#SOURCE_MARK)) before each
  top-level block's html, counted from the tokens' `raw`. The view walks the frame's comments against the picked
  range, and [`linesPicked`](ref:hub/src/shared/markdown.ts#linesPicked) takes the last mark before the start and the
  last one up to the end. A comment changes nothing a reader sees, and a block whose html leaves an element open (a
  `<details>`) still draws as before. The lines are block-level: the quote pins down the words.
- *The selection is read, not heard.* Nothing in a document frame calls a listener in WebKit ([[markdown-safe]]), so
  there is no `mouseup` or `selectionchange`. On each animation frame while the document is seen, the view reads the
  frame's selection from the page (`allow-same-origin`). It tells the machine a signature of
  the selection's ends, or none while it is collapsed or holds only white space.
- *When a selection is a pick is a shared machine* ([`/picks.js`](ref:hub/src/shared/picks.ts), [[machines]]). A
  selection unchanged for [`SETTLE_MS`](ref:hub/src/shared/picks.ts#SETTLE_MS) is picked. Since there is no
  `mouseup`, that delay is what separates a drag from a finished pick. The pick is held until it is let go: by
  `drop` (the box is `done`, or a press lands outside it on the page), or by the selection collapsing (a click in the
  document). Focus moving to the box leaves the frame's selection as it was. A held pick that a new selection grows
  out of (keys extending it) puts the box aside until the new one settles.
- *Nothing of the renderer's goes in the frame.* The passage is lit by the CSS Custom Highlight API, registered on
  the frame's window from the page (`::highlight(tower-passage)`), so the document's DOM is untouched. What acts on
  it is the `passage.acts` region (commands and one view at `row` scale, like `lines.acts`), drawn in a box in the
  page's own document positioned over the frame: under the passage, or over it where there is no room below, kept
  within the frame as it scrolls. A view there dispatches a bubbling `done` to let the pick go, as the reviews
  composer does under picked lines.
- *Acting on a passage is an extension's.* The bundled `passages` extension's
  [`composer`](ref:hub/extensions/passages/client/composer.ts#mount) types a prompt into the worker that showed the
  document, through the core's `submit` (queued while it works), prose quoted as a blockquote and code in a fence
  named by the file's extension, as
  [`askPrompt`](ref:hub/extensions/passages/client/composer.ts#askPrompt) writes it: the file, its lines and heading,
  the passage quoted, then the user's words. It says why it takes no prompt instead of offering one when the worker
  doesn't take one now, when no worker showed the document, or when the quote is past 4,000 characters. It couldn't
  be named `ask`, a name the core keeps ([`RESERVED`](ref:hub/src/shared/extensions.ts#RESERVED)).
- `tool:webkit` took a `--drag` ([`webkit.ts`](ref:hub/scripts/webkit.ts)), real AppKit mouse events, to check a
  selection in WebKit, where it matters.

**Alternatives considered.**
- *`allow-scripts` in document frames, with a listener relaying the selection.* A document's raw HTML would run, and
  [[markdown-safe]] keeps it from running.
- *Reading the selection on a page `pointerup`.* A press inside the frame never reaches the page, and keys can extend
  a selection too.
- *Wrapping the passage in a `<mark>`.* That writes into the document, shifts what the next pick reads, and has to
  be undone exactly.
- *Placing the box in the gutter.* The gutter is 168px wide, too narrow for a prompt, and its rows are placed by
  sections.
- *Preset prompts (Explain, Rewrite) beside the text box.* The user asked for one prompt of their own.
- *Collecting notes on passages into a review thread.* That fits reviewing a long document in one go, and the
  reviews extension could add a view `on: ["passage"]` for it. A direct prompt came first.

**Consequences.** Every markdown document and text file a view draws reads its frame's selection while seen, at the
cost of one selection read per animation frame. A long selection's text is read once per change. The box covers part
of the document while a pick is held. A shown html page runs at an origin of its own and can't be read from the page,
so it has no passages: it would need its own script, `/frame-keys.js`, to send its selection up, and the words it
sent would be the page's to forge. Tower 3D and The Week draw no `passage.acts`, so a passage there acts on nothing.
