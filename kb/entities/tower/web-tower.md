---
{
  "type": "system",
  "name": "Web tower",
  "summary": "The disposable web renderer: projects as floors, sessions as terminals, shells docked as tabs, and each project's shelf, on 127.0.0.1:4317.",
  "in": "tower",
  "reviewed": "2026-10-15",
  "refs": ["hub/renderers/page/index.html", "hub/src/shared/items.ts#collectionTrayHtml", "hub/src/shared/panels.ts#keepingFocus", "hub/src/shared/cards.ts#waitsBeganLine", "hub/src/shared/panels.ts#policiesHtml", "hub/src/shared/press.ts#pressing", "hub/src/shared/toasts.ts#toaster"]
}
---
Built to learn from and throw away ([[renderer-is-disposable]]): the [[tower-server]] turns the
[[live-system]] into a board and relays requests to the daemons. It holds no machinery. The skyline home
(projects as buildings, sessions as lit windows) is the seed of a spatial renderer. Its buildings stand in one row
and narrow to fit any number of floors, windows and signs scaled with them; a sign's name is cut to its building's
width and whole in its tooltip, as in the sidebar. A sidebar's shelf chips and trays keep to one line, cut the same way.
Spatial renderers live in `renderers/` on the same API: [[tower3d]] is the first-person one. The Week
([`renderers/week/`](ref:hub/renderers/week/week.js)) is a plain page over the same API: the budget week as a
yearbook, read from the board, `/stats` and each floor's archive ([[renderers-in-config]]).

The sidebar's rate limits fold into one chip naming the tightest limit and its percentage, toned as its meter is (quiet, filled broken past 85%), whose popover holds the meters, "as of", extra usage and the probes.

A worker's subagents hang under its sidebar line as satellites ([`satellitesOf`](ref:hub/src/shared/cards.ts#satellitesOf): those running, and those that ended a turn under 8 s ago, fading out; a fork marked with the branch glyph, a stopped one struck through), and its details list every run with its tokens and how it ended. A board push redraws the floors holding the selected row while any of it is in sight, so a move key's target stays in view.

A sidebar card's top row is its lamp, callsign, status word and time in state: the word ([`statusWord`](ref:hub/src/shared/cards.ts#statusWord), `statusTitle` on hover) gives way to an ellipsis and the time never does; an offer row's title gives way and its slot never does. A stranded card shows resume and let go over its last line while hovered or focused and not selected; selected, they are in the header alone. A hire nested under its hirer leaves out "hired by", and each crew below the first is indented only a little.

Every collection a floor declares has a tray under its workers ([[collection-trays]]): rows by title, tag, keeper and
age from `/items.js`, an item opened in the main pane read as its type, with its tag, Finder and editor buttons, a new
tab and a Delete asked first. Drafts and review threads keep their own trays on the same rows; threads Tidy filed are
a fold under the live ones. The shell dock's `+` starts a shell in any directory of a floor, the floor in view first.

Drafts are the page's own feature over the `drafts` collection ([[collections]]): each floor lists them under its
shelf, titled by their first line over their tag and keeper ([[item-tags]]), ✎ beside the floor's `+` starts one, and a draft opens in an editor in the main pane that saves as you type and takes
another writer's change unless it holds edits of its own; a save the tower refuses because the file moved on
becomes the same conflict. The editing is `/drafts.js`
([`src/shared/drafts.ts`](ref:hub/src/shared/drafts.ts)), shared with Tower 3D's draft panel ([[corkboard]]). A draft starts a session through the new-session dialog,
prefilled with its text (directory, model and effort picked there), or is submitted to a running worker, then is
deleted. A prompt typed into the dialog that closes without starting, or whose start fails, is kept as a draft, or in the draft it was
opened on. A session the page
starts opens once the board carries its card: the host answers before the tower has read the new log.

*The clipboard in frames* (2026-10-08). A frame that runs a floor's own page is sandboxed at an opaque origin, where
the browser's permissions policy blocks the Clipboard API unless the frame grants it: the shelf frame of an `html` or
`renderer` entry, an `html` item and a shown file each carry `allow="clipboard-write"` (a `url` frame already had
`clipboard-read; clipboard-write`), so a copy button inside, such as Tower 3D's on a logbook's prompts and answers,
works framed as it does top-level. Tower 3D grants the same on its own frames of shelf pages and shown files, so the
grant carries through when it is itself framed. Reading the clipboard stays with `url` frames.

*Reflow* (2026-10-08). The page holds at 200% zoom and at the largest Text size: under 900 px the sidebar is the rail
and the sidebar key (or ») opens it over the main pane until a worker is picked; the worker bar wraps rather than
clipping its callsign ([[design-system]]). Under the worker bar sits one tab row ([[shared-panels]]): its panes, then its showings scrolling sideways.
While it waits on you, a quiet "dismiss" beside its status takes that wait out of your way. The move keys (`prev-worker`, `next-worker`, `next-waiting`)
have no chips there: the keys sheet lists them, and the sidebar shows where they land. What the worker runs now is the terminal's, and the details' `now` row.

*Keyboard and screen readers* (2026-10-08). The page is the tower's accessible renderer: Tower 3D's pointer-lock walk
can't be. Every worker is a link to `#<id>`: a card's callsign, a lit or past window of the skyline, a lamp of the
collapsed rail and a past worker's callsign in the archive. The page opens what the hash names at load and again on
`hashchange` (a link, Back, the address bar); every view still writes its own hash in place. The selected worker's
link is `aria-current`. Its pane tabs are an ARIA tablist (←, →, Home and End move along them and show the pane), and
the terminal is `inert` while another pane lies over it, so Tab never falls into it unseen. Redraws give focus back to
the control that had it ([`keepingFocus`](ref:hub/src/shared/panels.ts#keepingFocus)), so a board arriving every few
seconds doesn't throw a keyboard back to the page's start. Every press that asks the tower something stays busy
until the reply, and toasts stack, some with an action: Resume after sending one worker home, Undo after deleting a draft
([[press-feedback]]). The toast stack is a polite live region that says every toast, and another says a line for each
wait that begins and isn't dismissed ([`waitsBeganLine`](ref:hub/src/shared/cards.ts#waitsBeganLine): "ENKI-26 is
waiting on you: done."), the worker you are watching included. Landmarks: the sidebar's `aside`, the floors' `nav`,
`main`; floor signs and the selected callsign are level-2 headings; every dialog is named; buttons drawn as a glyph
carry an `aria-label` and glyphs beside words are hidden from screen readers. Still mouse-only: picking lines for a
note in Changes, a showing tab's ↗ and ×, a shell tab's ×, a file's Finder and editor buttons (spans, so they can sit
inside a tab), live threads and shelf files in their lists, and the dock's grip (drafts and kept items are buttons).

*Policies* (2026-10-13). A floor that keeps policies shows a tray of their count, what is offered and what needs you,
which opens the shared policies panel in the main pane at `#policies/<floor>` ([[shared-panels]]). Its open offers that
you heed sit above its workers, each with Accept and ✕, counted beside the waits in the tally and the tab title, and N
goes to them after the workers waiting on you ([[attention-list]]). A worker a run started says so under its callsign,
"run 3 · Bug hunt", from `card.run`. Accept and Run now open the new worker once the board carries it.
