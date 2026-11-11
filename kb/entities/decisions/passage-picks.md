---
{
  "type": "decision",
  "name": "Text picked in a shown document is a passage subject, read from the page and acted on over the frame",
  "summary": "A selection in a markdown document drawn by sections, a text file drawn as written (a showing, a kept item, a shelf file), or a shown html page that reports it through /frame-picks.js, becomes a passage subject once it stops changing: the page reads the frame's selection on each animation frame, since nothing in the frame is heard, and a shared machine (src/shared/picks.ts) says when it settles. The passage carries its words, its sections and its source lines (read from comments sectionsHtml writes before each block), is lit by a CSS highlight, and the page draws what acts on it (passage.acts) in a box over the frame. The bundled quote extension's composer types a prompt about it into the worker that showed the document.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-05",
  "reviewed": "2026-11-11",
  "refs": [
    "hub/src/shared/picks.ts",
    "hub/src/shared/picks.ts#PICK_HANDLERS",
    "hub/src/shared/picks.ts#SETTLE_MS",
    "hub/src/shared/markdown.ts#sectionsHtml",
    "hub/src/shared/source-lines.ts#sourceMark",
    "hub/src/shared/source-lines.ts#SOURCE_MARK",
    "hub/src/shared/source-lines.ts#linesPicked",
    "hub/src/shared/passage.ts#Passage",
    "hub/src/shared/passage.ts#passageSubject",
    "hub/src/lib/board.ts",
    "hub/src/shared/subjects.ts#parentOf",
    "hub/src/shared/view-sections.ts#drawSections",
    "hub/src/shared/view-passages.ts#pickPassages",
    "hub/src/shared/view-passages.ts#offsetIn",
    "hub/src/views/text.ts#mount",
    "hub/src/views/html.ts#mount",
    "hub/src/shared/view-passages.ts#reportedSource",
    "hub/src/tower/frame-picks.js",
    "hub/src/shared/source-lines.ts#textLines",
    "hub/src/shared/extensions.ts#RESERVED",
    "hub/renderers/page/renderer.json",
    "hub/extensions/quote/extension.json",
    "hub/extensions/quote/client/composer.ts#askPrompt",
    "hub/extensions/quote/client/composer.ts#mount",
    "hub/scripts/webkit.ts"
  ],
  "links": [
    { "to": "markdown-safe", "verb": "follows", "carries": "nothing of the renderer's in the frame, nothing heard there" },
    { "to": "agent-show", "verb": "extends", "carries": "a showing's passages" },
    { "to": "machines", "verb": "follows", "carries": "the pick machine (src/shared/picks.ts)" },
    { "to": "ui-model", "verb": "extends", "carries": "the passage viewer subject and the passage.acts region" },
    { "to": "extensions", "verb": "uses", "carries": "the quote extension's composer view" }
  ]
}
---
**Problem.** A user reading a plan or a report a worker showed wants to answer one part of it: "this paragraph is
wrong", "expand this". To do that they had to copy the words, switch to the worker's terminal, paste them and say
which file and where. The section commands in the gutter ([[markdown-safe]]) act on a whole section, not on a
sentence the user picked.

**Decision.**
- *A passage is a viewer subject* ([`passageSubject`](ref:hub/src/shared/passage.ts#passageSubject) in `/lib/board.js`, API 1.170),
  like `lines` picked in a worker's Changes: never on the board, a child of the showing or item the document is
  ([`parentOf`](ref:hub/src/shared/subjects.ts#parentOf)). Its [`Passage`](ref:hub/src/shared/passage.ts#Passage)
  holds the quote as the document draws it (also its `body`, typed `text/plain`, so anything that reads a subject's
  text reads it) and its source lines, nothing more: no heading nor sections, since the quote and the lines place it
  in any file, and nothing that acts on a passage read them. For a showing of a file it also holds the worker's card and the file's real path.
- *Two kinds of document, one capture.* [`pickPassages`](ref:hub/src/shared/view-passages.ts#pickPassages) holds
  everything about picking in a frame where nothing runs: the selection read, the machine, the highlight, the box and
  its region. A view hands it its frame and says where a range is in its own terms (`Where`). `tower/document` and
  `tower/shelf` (by `drawSections`) say block lines; [`tower/text`](ref:hub/src/views/text.ts#mount),
  which draws plain text, source code and JSON as written, says exact lines: its frame's text is the file's, so the
  characters before each end of the range ([`offsetIn`](ref:hub/src/shared/view-passages.ts#offsetIn)) give the lines
  ([`textLines`](ref:hub/src/shared/source-lines.ts#textLines)), and the quote keeps its indentation.
- *Source lines are data the document carries.* [`sectionsHtml`](ref:hub/src/shared/markdown.ts#sectionsHtml)
  writes a comment `src:<from>-<to>` ([`sourceMark`](ref:hub/src/shared/source-lines.ts#sourceMark)) before each
  top-level block's html, counted from the tokens' `raw`. The view walks the frame's comments against the picked
  range, and [`linesPicked`](ref:hub/src/shared/source-lines.ts#linesPicked) takes the last mark before the start and the
  last one up to the end. A comment changes nothing a reader sees, and a block whose html leaves an element open (a
  `<details>`) still draws as before. The lines are block-level: the quote pins down the words. The marks are the
  core's own: `sectionsHtml` is in the library ([[library]]), and its contract is html that draws the sections, the
  rest unspecified, so the mark's shape can change in any version and `linesPicked` and `SOURCE_MARK` stay internal.
- *The selection is read, not heard.* Nothing in a document frame calls a listener in WebKit ([[markdown-safe]]), so
  there is no `mouseup` or `selectionchange`. On each animation frame while the document is seen, the view reads the
  frame's selection from the page (`allow-same-origin`). It tells the machine a signature of
  the selection's ends, or none while it is collapsed or holds only white space.
- *When a selection is a pick is a shared machine* ([`picks.ts`](ref:hub/src/shared/picks.ts), [[machines]]). A
  selection unchanged for [`SETTLE_MS`](ref:hub/src/shared/picks.ts#SETTLE_MS) is picked. Since there is no
  `mouseup`, that delay is what separates a drag from a finished pick. The pick is held until it is let go: by
  `drop` (the box is `done`, or a press lands outside it on the page), or by the selection collapsing (a click in the
  document). A pick moves no focus: nothing in the box takes it as it opens or as the board redraws it, so the
  focus and the selection stay where the user left them and the passage can be copied (Cmd+C) as it is. The user
  clicks into the box to act, as into Claude's own prompt, and focus moving there leaves the frame's selection as it
  was. A held pick that a new selection grows
  out of (keys extending it) puts the box aside until the new one settles.
- *Nothing of the renderer's goes in the frame.* The passage is lit by the CSS Custom Highlight API, registered on
  the frame's window from the page (`::highlight(tower-passage)`), so the document's DOM is untouched. The frame's
  `::selection` takes the same color: Chrome paints the selection of a frame that lost the focus (to the box) in its
  own dark grey over the highlight, which on a dark code block hid the pick. What acts on
  it is the `passage.acts` region (commands and one view at `row` scale, like `lines.acts`), drawn in a box in the
  page's own document positioned over the frame: under the passage, or over it where there is no room below, kept
  within the frame as it scrolls. A view there dispatches a bubbling `done` to let the pick go, as the reviews
  composer does under picked lines.
- *Acting on a passage is an extension's.* The bundled `quote` extension's
  [`composer`](ref:hub/extensions/quote/client/composer.ts#mount) types a prompt into the worker that showed the
  document, through the core's `submit` (queued while it works), from a prompt the user clicks into (it takes the
  focus on no pick, so it never stands between the user and copying the passage), prose quoted as a blockquote and code in a fence
  named by the file's extension, as
  [`askPrompt`](ref:hub/extensions/quote/client/composer.ts#askPrompt) writes it: the file and its lines, the
  passage quoted, then the user's words. It says why it takes no prompt instead of offering one when the worker
  doesn't take one now, when no worker showed the document, or when the quote is past 4,000 characters. It is named
  for what it does, quoting a passage to a worker, and leaves the noun `passage` to the core's subject, which other
  extensions may act on too; `ask` is a name the core keeps ([`RESERVED`](ref:hub/src/shared/extensions.ts#RESERVED)).
- *A page that runs its own scripts reports its selection* ([`reportedSource`](ref:hub/src/shared/view-passages.ts#reportedSource)).
  A shown html page runs at an origin of its own (`allow-scripts`, no `allow-same-origin`), so the page can't read
  its frame. The tower appends [`/frame-picks.js`](ref:hub/src/tower/frame-picks.js) to every html file it serves
  sandboxed, beside `/frame-keys.js`: it hears the page's own `selectionchange`, scroll and resize, and sends
  `{t: 'pick', token, sig, quote, rect}`, or `{t: 'pick', token}` for none; the
  tower sends `{t: 'unpick'}` to let it go. Since any script in the page can send the same, the words are the page's
  word, and four things bound what it can do. Only [`tower/html`](ref:hub/src/views/html.ts#mount) listens, and only
  for a showing of a file: an address a worker showed is `tower/link`'s, framed from its own server, with no tower
  script in it. It hears only its own frame's window. Only the document the frame holds at its first load: on the
  frame's first `load` the tower sends it a random token (`{t: 'picks', token}`), which every pick must carry, and a second `load`
  (a link followed, a script sending the frame elsewhere, a reload) ends it, failing closed. The token closes the
  window before that `load`, when a document navigated to could already post: it never had the token, and every
  document in a sandboxed frame has the same opaque origin, so its origin can't tell them apart. A page that sends
  the frame elsewhere before its own load ends (`location.replace`, a meta refresh) hands the token to where it sent
  it; that is the page's own choice, as its words are its word. And a new selection
  only while the frame holds the focus, as a pick made by hand does: otherwise a script selecting on a timer would
  open the box over what the user was doing elsewhere. A new selection heard without the
  focus lets go of the one heard before, so a pick still settling when the user clicks away doesn't open. The pick held is followed as it
  moves or ends wherever the focus is, so the box keeps up with the page's scroll. The passage has no lines,
  and nothing marks it as the page's: the `quote` composer draws the same box as for any passage, the words left
  unshown, so a page's script could report other words than those selected and they would go with the prompt unseen.
  The user chose one box for every file over showing a page's words, and a field nothing read was dropped with it.
  Since the token comes only once the frame has loaded, the page says its selection again when it arrives: one made
  while it still loaded is heard then.
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
- *Serving the pick machine as `/picks.js`, and the source marks from `/markdown.js`.* The root modules are
  deprecated and 2.0 removes them, and nothing outside the core needs either: the core's views import
  [`picks.ts`](ref:hub/src/shared/picks.ts) and [`source-lines.ts`](ref:hub/src/shared/source-lines.ts) by source,
  and the subject is published only in the library's `/lib/board.js`, kept apart from `subjects.ts`, which `/cards.js`
  re-exports.
- *Preset prompts (Explain, Rewrite) beside the text box.* The user asked for one prompt of their own.
- *Collecting notes on passages into a review thread.* That fits reviewing a long document in one go, and the
  reviews extension could add a view `on: ["passage"]` for it. A direct prompt came first.

**Consequences.** Every markdown document and text file a view draws reads its frame's selection while seen, at the
cost of one selection read per animation frame. A long selection's text is read once per change. The box covers part
of the document while a pick is held. A shown html page's passage is the page's word, sent as it said it; a page that draws its text on a canvas or takes the selection for itself offers none, and following any link
in it ends its passages until the view draws it again. Tower 3D and The Week draw no `passage.acts`, so a passage
there acts on nothing.
