---
{
  "type": "decision",
  "name": "One keymap: commands as data, defaults in the module, overrides in the config",
  "summary": "Every command a renderer runs from the keyboard is data in src/shared/keymap.ts (/keymap.js): an id, a scope (global, terminal, field), a group, what it does and its default chords. The config's keys replaces a command's chords by id (null unbinds it), checked by tower config check; the board carries the result as board.keys, so every renderer and every sheet follows the config live. ⌥Esc leaves a terminal, and ⌃⇧1–4 show a worker's panes, from inside the terminal too.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-29",
  "refs": ["hub/src/shared/keymap.ts#COMMANDS", "hub/src/shared/keymap.ts#keysProblems", "hub/src/shared/keymap.ts#keymapOf", "hub/src/shared/keymap.ts#commandOf", "hub/src/shared/keymap.ts#frameCommandOf", "hub/src/tower/frame-keys.js", "hub/src/tower/http.ts#serveSandboxed", "hub/src/shared/shelf-page.ts#FromPage", "hub/renderers/page/page.js#frameKey", "hub/src/shared/keymap.ts#keymapSheetHtml", "hub/src/shared/keymap.ts#keyshortcuts", "hub/src/shared/keymap.ts#keysHint", "hub/src/shared/termkeys.ts#terminalKeymap", "hub/src/shared/termkeys.ts#deadKeys", "hub/src/shared/model.ts#configuredKeys", "hub/src/config-check.ts#configProblems", "hub/src/bridge/board.ts#Board", "hub/renderers/page/page.js#run", "hub/renderers/page/screen.js#leaveTerminal", "hub/renderers/tower3d/src/main.ts#runCommand", "hub/docs/config.md", "hub/src/shared/keymap.ts#addedKeys", "hub/src/shared/keymap.ts#addedCommandOf"]
}
---
**Problem.** The keys lived in several places (shared constants, the page's shortcuts and hand-written `?` sheet,
each field's listener, Tower 3D's main loop): the sheet drifted from the bindings, a sibling renderer had to copy
all of it, and nothing could be rebound. Inside a terminal no key moved focus out: a keyboard trap (WCAG 2.1.2), Esc
being Claude's.

**Why.** What a key does is data a renderer reads, not code it copies, and that is what makes the system
customizable. Overrides are the user's intent, so they live in the config, the one hand-edited file, checked like
every other key, and reach every renderer the way `user.name` does.

**How.**
- [`COMMANDS`](ref:hub/src/shared/keymap.ts#COMMANDS): `{ id, label, scope, group, does, chords }`, `label` its name in a few words as a palette lists it, `does` what it does as the `?` sheet says it. Scopes: `global`
  (anywhere, but a chord without Alt, Ctrl or Meta only while nothing types), `terminal`, `field` (a text field or an
  open dialog). A letter or digit in a chord is the physical key, so ⌥'s composed characters on a Mac don't matter;
  another character is matched by what it types, and Alt with a character is refused.
  A command may have no default chord: `spawn`, the new-worker form on the floor or the draft in focus, is what a view
  runs through `kit.run` and the config may bind; the `?` sheet lists only commands with chords, and the palette
  leaves `spawn` to each floor's own entry.
- The config's `keys` maps an id to a chord, a list or `null`, replacing the defaults.
  [`keysProblems`](ref:hub/src/shared/keymap.ts#keysProblems) is the check: bad syntax and one chord on two commands
  that can fire in the same place fail, an unknown id warns.
  [`configuredKeys`](ref:hub/src/shared/model.ts#configuredKeys) throws the first failure as a config error, so the
  board says it ([[board-errors]]); `tower config check` prints each at its path.
- Extensions' commands and views take chords too, by `<cap>/<name>`: their manifests' `keys` as defaults, the
  config's `keys` for that id over them, checked by `keysProblems` given the running extensions' ids.
  [`addedKeys`](ref:hub/src/shared/keymap.ts#addedKeys) drops a default that would fire with a keymap chord, a chord
  a renderer `keeps`, one the config set or another extension's default (both then), each a problem on its
  extension, so load order never decides; [`addedCommandOf`](ref:hub/src/shared/keymap.ts#addedCommandOf) matches
  them as global chords, on the subject in focus ([[ui-model]]).
- `board.keys` carries every command's chords, recomputed when the config changes. Renderers match keydowns with
  [`commandOf`](ref:hub/src/shared/keymap.ts#commandOf) and map ids to handlers; a terminal takes
  [`terminalKeymap`](ref:hub/src/shared/termkeys.ts#terminalKeymap), which sends a natural key's bytes and hands any
  other command to the renderer, the key going on to xterm when the renderer did nothing with it. It also types the
  dead key WebKit folds into the next keydown, which xterm would drop
  ([`deadKeys`](ref:hub/src/shared/termkeys.ts#deadKeys)).
- Words come from the same data: [`keymapSheetHtml`](ref:hub/src/shared/keymap.ts#keymapSheetHtml) is the `?` sheet,
  [`keysHint`](ref:hub/src/shared/keymap.ts#keysHint) is a control's tip (`Esc outside a terminal or a text field`), so
  every button a command runs names its chords as the config binds them, and
  [`keyshortcuts`](ref:hub/src/shared/keymap.ts#keyshortcuts) is `aria-keyshortcuts`.
- `shell-here` (⌃`) goes between the selected worker's terminal and a shell in its directory, read from the board's
  shells by cwd; xterm sends no bytes for ⌃`, so neither a shell nor Claude sees it. `palette` (⌘K) lists the global
  commands by `label` with their chords, so it teaches the keymap ([[command-palette]]).
- `leave-terminal` (⌥Esc) returns focus to where it was before the terminal
  ([`leaveTerminal`](ref:hub/renderers/page/screen.js#leaveTerminal)), and `pane-*` (⌃⇧1–4) show the selected worker's
  panes, from inside the terminal too. Neither is Claude's: ⌥Esc reaches it as Esc twice and Claude binds no ⌃⇧ digit. macOS takes ⌃ digits for its desktops, which is why the panes carry ⇧.
  A default must not eat a printable character on any common layout, which rules out ⌥ with a digit.
- Keys pressed in a frame the renderer drew reach its keymap, so ⌘K, Escape and the pane chords work from a shown file,
  a shelf page or a kept item. A document frame (a srcdoc the renderer wrote, `allow-same-origin` and never scripts:
  [[markdown-safe]]) is the renderer's own, and it listens on the frame's document at each load. A script frame (an
  html file the tower serves sandboxed, a framed renderer) runs [`/frame-keys.js`](ref:hub/src/tower/frame-keys.js),
  which the tower appends to every html page it serves sandboxed
  ([`serveSandboxed`](ref:hub/src/tower/http.ts#serveSandboxed)) and `/tower.js` runs first: a key none of the page's
  handlers took (`preventDefault`), typing in a field excepted, is posted to the parent as `{ t: 'key' }`
  ([`FromPage`](ref:hub/src/shared/shelf-page.ts#FromPage)), with no token. The page hears it only from the frame
  drawn with scripts that holds focus (`e.source` is `document.activeElement`'s window), never a `url` frame's, and
  neither kind behind a modal ([`frameKey`](ref:hub/renderers/page/page.js#frameKey)). A frame's key runs a global
  command alone ([`frameCommandOf`](ref:hub/src/shared/keymap.ts#frameCommandOf)), resolved as a field's when its
  target took typing, so no frame starts a session or types into a terminal. A script frame's message is a claim any
  page can make, so it can time a chord into the user's typing: the first Enter typed into a field or a terminal
  after a forwarded key ran something is held back, with a toast, until a click. Tower 3D takes the keys it answers,
  so framed it doesn't also step the tower page, and lets go of the mouse when its window loses focus: Chrome keeps a
  frame's pointer lock while the palette a forwarded ⌘K opened takes focus, and Escape would go to the lock.
- Tower 3D runs the moves, the panes and `leave-terminal` from `board.keys` in the world, at a desk and in its
  terminal ([`runCommand`](ref:hub/renderers/tower3d/src/main.ts#runCommand)), and lists them on its pause card with
  `keymapSheetHtml`.

**Alternatives considered.**
- Overrides in `tower.store`, per viewer: the user chose the config, the hand-edited intent every renderer and worker
  already reads, checked with the rest of it.
- Matching every chord by `code` (`Shift+Slash` for `?`): the sheet would name a key the user's layout may not have.
- Plain letters inside a terminal: they are Claude's typing. F6 to cycle panes: Chrome keeps it.
- A rebinding UI in the sheet: the config is where intent lives.

- Forwarding keys over a channel each frame sets up with a token: source identity and focus decide what is heard,
  and the relay's pairing stays as it was. Serving framed html at the tower's origin to hear its keys: it would call
  the API as the tower.

**Impact.** `/keymap.js` and `board.keys` are part of the renderer API, and the `?` sheet can't drift from the
bindings. Every page the tower frames forwards its global keys with nothing to add; a page that handles a key calls
`preventDefault` to keep it. A remote `url` frame is the gap: nothing is injected there, and it is not heard. `MOVE_KEYS` and `moveOfKey` in `/cards.js` are deprecated in their favour until the API's next major.
