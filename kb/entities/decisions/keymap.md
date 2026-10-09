---
{
  "type": "decision",
  "name": "One keymap: commands as data, defaults in the module, overrides in the config",
  "summary": "Every command a renderer runs from the keyboard is data in src/shared/keymap.ts (/keymap.js): an id, a scope (global, terminal, field), a group, what it does and its default chords. The config's keys replaces a command's chords by id (null unbinds it), checked by tower config check; the board carries the result as board.keys, so every renderer and every sheet follows the config live. ⌥Esc leaves a terminal, and ⌃1–4 show a worker's panes, from inside the terminal too.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/keymap.ts#COMMANDS", "hub/src/shared/keymap.ts#keysProblems", "hub/src/shared/keymap.ts#keymapOf", "hub/src/shared/keymap.ts#commandOf", "hub/src/shared/keymap.ts#keymapSheetHtml", "hub/src/shared/keymap.ts#keyshortcuts", "hub/src/shared/termkeys.ts#terminalKeymap", "hub/src/shared/termkeys.ts#deadKeys", "hub/src/shared/model.ts#configuredKeys", "hub/src/config-check.ts#configProblems", "hub/src/bridge/board.ts#Board", "hub/renderers/page/index.html#run", "hub/renderers/page/index.html#leaveTerminal", "hub/renderers/tower3d/src/main.ts#runCommand", "hub/docs/config.md"]
}
---
**Problem.** The keys lived in five places: `MOVE_KEYS` in `cards.ts`, `NATURAL_KEYS` in `termkeys.ts`, the page's
`shortcut()` and its hand-written `?` sheet, each field's own listener, and Tower 3D's `main.ts`. The sheet drifted
from the bindings, a sibling renderer had to copy all of it, and nothing could be rebound. Inside a terminal no key
moved focus out: a keyboard trap (WCAG 2.1.2), Esc being Claude's.

**Why.** A keymap is the kind of thing that makes the system customizable (the user's words): what a key does is
data a renderer reads, not code it copies. Overrides are the user's intent, so they live in the config, the one
hand-edited file, checked like every other key, and reach every renderer the way `user.name` does.

**How.**

- [`COMMANDS`](ref:hub/src/shared/keymap.ts#COMMANDS): `{ id, scope, group, does, chords }`. Scopes: `global`
  (anywhere, but a chord without Alt, Ctrl or Meta only while nothing types), `terminal` (focus in a terminal),
  `field` (a text field or an open dialog). Ids: `prev-worker`, `next-worker`, `next-waiting`, `home`, `sidebar`,
  `help`, `pane-terminal`, `pane-brief`, `pane-changes`, `pane-reviews`, `leave-terminal`, the six natural keys
  (`newline`, `delete-word`, …), `save-draft`, `submit`, `cancel-pick`.
- A chord is modifiers (`Alt`, `Ctrl`, `Meta`, `Shift`) and one key: a letter or digit (the physical key, so ⌥'s
  composed characters on a Mac don't matter), a `KeyboardEvent.code`, or one other character matched by what it
  types, Shift ignored (`?`). Alt with a character is refused: ⌥ changes the character.
- The config's `keys` maps an id to a chord, a list or `null`; an override replaces the defaults.
  [`keysProblems`](ref:hub/src/shared/keymap.ts#keysProblems) is the check: bad syntax fails at `keys.<id>[n]`, an
  unknown id warns (ignored, often a typo), and one chord on two commands that can fire in the same place fails at
  the override, naming the other. [`configuredKeys`](ref:hub/src/shared/model.ts#configuredKeys) throws the first
  failure as a config error, so the board says it ([[board-errors]]) until it is fixed; `tower config check` prints
  each at its path.
- `board.keys`: every command's chords, canonical, recomputed when the config changes. Renderers match keydowns with
  [`commandOf`](ref:hub/src/shared/keymap.ts#commandOf)`(board.keys, e, focus)` and map ids to handlers; a terminal
  takes [`terminalKeymap`](ref:hub/src/shared/termkeys.ts#terminalKeymap), which sends a natural key's bytes and
  hands any other command to the renderer, the key going on to xterm when the renderer did nothing with it. Before
  any of that it types what WebKit (Safari, Tower.app's WKWebView) reports as one keydown: a dead key and the key
  after it that didn't compose with it ([`deadKeys`](ref:hub/src/shared/termkeys.ts#deadKeys), `'s` on a Brazilian
  or US International layout), of which xterm types only the first character. A window being typed into has already
  typed the dead key through its composition, so only the rest goes; Chrome composes both and never sends such a key.
- Words come from the same data: [`keymapSheetHtml`](ref:hub/src/shared/keymap.ts#keymapSheetHtml) is the `?`
  sheet, grouped, saying where each chord works; `keysLabel` and `chordLabel` name chords (`⌥↓`);
  [`keyshortcuts`](ref:hub/src/shared/keymap.ts#keyshortcuts) is `aria-keyshortcuts`.
- `leave-terminal` (⌥Esc): focus goes back to the control it came from before the terminal, else the selected pane's
  tab, else the page. `pane-*` (⌃1–4) show the selected worker's pane, focusing its terminal or its tab. Checked
  live on Claude Code 2.1.295: xterm sends ⌥Esc as ESC ESC, which clears Claude's prompt like Esc twice (still
  there), and Claude binds no ⌃ digit. ⌃1–4 send xterm's legacy control bytes (⌃3 an ESC, ⌃4 `^\\`, a quit
  signal in a shell), so a default there costs nothing typed. ⌥1–4 were the first choice and were dropped in review:
  ⌥3 types `#` on a British layout, ⌥2 `€` on several European ones, and a default must not eat a printable
  character in Claude's prompt or a note. A character chord and a key chord that are one key on a US layout (`?`,
  `Shift+Slash`) warn: the check can't know the layout.
- Tower 3D reads the moves, `leave-terminal`, the panes and the fields' commands from `board.keys`, in the world,
  at a desk and in its terminal ([`runCommand`](ref:hub/renderers/tower3d/src/main.ts#runCommand)): `pane-*` picks
  a desk's tab (Terminal focused, Logbook, Changes, Reviews) or the logbook reader's Screen and Logbook; `submit`,
  `save-draft` and `cancel-pick` drive its spawn dialog, draft and note form. Its pause card lists its own walk keys
  (WASD, H, M, P, …) and under them `keymapSheetHtml` over every command it runs (all but the page's `home`,
  `sidebar` and `help`).

**Alternatives considered.**

- Overrides in `tower.store`, per viewer (the a11y audit's proposal): the user chose the config, the hand-edited
  intent every renderer and worker already reads, checked with the rest of it.
- Matching every chord by `code` (`Shift+Slash` for `?`): the sheet would name a key the user's layout may not have.
- Plain letters inside a terminal: they are Claude's typing. F6 to cycle panes: Chrome keeps it.
- A rebinding UI in the sheet: left for when someone asks; the config is the place for now.

**Impact.** `/keymap.js` and `board.keys` are API minors (1.11); `MOVE_KEYS` and `moveOfKey` stay, deprecated,
until the next major, and `terminalKeys` stays for renderers on the default keys. A new top-level config key, `keys`
(`docs/config.md`). The `?` sheet can't drift from the bindings again.
