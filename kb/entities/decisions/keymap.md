---
{
  "type": "decision",
  "name": "One keymap: commands as data, defaults in the module, overrides in the config",
  "summary": "Every command a renderer runs from the keyboard is data in src/shared/keymap.ts (/keymap.js): an id, a scope (global, terminal, field), a group, what it does and its default chords. The config's keys replaces a command's chords by id (null unbinds it), checked by tower config check; the board carries the result as board.keys, so every renderer and every sheet follows the config live. ⌥Esc leaves a terminal, and ⌃1–4 show a worker's panes, from inside the terminal too.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-08",
  "reviewed": "2026-10-17",
  "refs": ["hub/src/shared/keymap.ts#COMMANDS", "hub/src/shared/keymap.ts#keysProblems", "hub/src/shared/keymap.ts#keymapOf", "hub/src/shared/keymap.ts#commandOf", "hub/src/shared/keymap.ts#keymapSheetHtml", "hub/src/shared/keymap.ts#keyshortcuts", "hub/src/shared/termkeys.ts#terminalKeymap", "hub/src/shared/termkeys.ts#deadKeys", "hub/src/shared/model.ts#configuredKeys", "hub/src/config-check.ts#configProblems", "hub/src/bridge/board.ts#Board", "hub/renderers/page/index.html#run", "hub/renderers/page/index.html#leaveTerminal", "hub/renderers/tower3d/src/main.ts#runCommand", "hub/docs/config.md"]
}
---
**Problem.** The keys lived in several places (shared constants, the page's own shortcuts and hand-written `?`
sheet, each field's listener, Tower 3D's main loop): the sheet drifted from the bindings, a sibling renderer had to
copy all of it, and nothing could be rebound. Inside a terminal no key moved focus out: a keyboard trap (WCAG 2.1.2),
Esc being Claude's.

**Why.** What a key does is data a renderer reads, not code it copies, and that is what makes the system
customizable. Overrides are the user's intent, so they live in the config, the one hand-edited file, checked like
every other key, and reach every renderer the way `user.name` does.

**How.**

- [`COMMANDS`](ref:hub/src/shared/keymap.ts#COMMANDS): `{ id, scope, group, does, chords }`. Scopes: `global`
  (anywhere, but a chord without Alt, Ctrl or Meta only while nothing types), `terminal` (focus in a terminal),
  `field` (a text field or an open dialog). The grammar of a chord is `keymap.ts`'s: a letter or digit is the physical
  key (so ⌥'s composed characters on a Mac don't matter), another character is matched by what it types, and Alt with
  a character is refused.
- The config's `keys` maps an id to a chord, a list or `null`; an override replaces the defaults.
  [`keysProblems`](ref:hub/src/shared/keymap.ts#keysProblems) is the check: bad syntax fails at `keys.<id>[n]`, an
  unknown id warns, and one chord on two commands that can fire in the same place fails at the override, naming the
  other. [`configuredKeys`](ref:hub/src/shared/model.ts#configuredKeys) throws the first failure as a config error, so
  the board says it ([[board-errors]]) until it is fixed; `tower config check` prints each at its path.
- `board.keys`: every command's chords, canonical, recomputed when the config changes. Renderers match keydowns with
  [`commandOf`](ref:hub/src/shared/keymap.ts#commandOf)`(board.keys, e, focus)` and map ids to handlers; a terminal
  takes [`terminalKeymap`](ref:hub/src/shared/termkeys.ts#terminalKeymap), which sends a natural key's bytes and
  hands any other command to the renderer, the key going on to xterm when the renderer did nothing with it. It also
  types the dead key WebKit folds into one keydown with the key after it, which xterm would drop
  ([`deadKeys`](ref:hub/src/shared/termkeys.ts#deadKeys)).
- Words come from the same data: [`keymapSheetHtml`](ref:hub/src/shared/keymap.ts#keymapSheetHtml) is the `?`
  sheet, grouped, saying where each chord works; `keysLabel` and `chordLabel` name chords;
  [`keyshortcuts`](ref:hub/src/shared/keymap.ts#keyshortcuts) is `aria-keyshortcuts`.
- `leave-terminal` (⌥Esc): focus goes back to the control it came from before the terminal, else the selected pane's
  tab, else the page. `pane-*` (⌃1–4) show the selected worker's pane, focusing its terminal or its tab. Neither is
  Claude's: ⌥Esc reaches it as Esc twice and Claude binds no ⌃ digit. A default must not eat a printable character on
  any common layout, which rules out ⌥ with a digit.
- Tower 3D reads the moves, `leave-terminal`, the panes and the fields' commands from `board.keys`, in the world, at a
  desk and in its terminal ([`runCommand`](ref:hub/renderers/tower3d/src/main.ts#runCommand)); its pause card lists its
  own walk keys over `keymapSheetHtml` of every command it runs.

**Alternatives considered.**

- Overrides in `tower.store`, per viewer: the user chose the config, the hand-edited intent every renderer and worker
  already reads, checked with the rest of it.
- Matching every chord by `code` (`Shift+Slash` for `?`): the sheet would name a key the user's layout may not have.
- Plain letters inside a terminal: they are Claude's typing. F6 to cycle panes: Chrome keeps it.
- A rebinding UI in the sheet: left for when someone asks; the config is the place for now.

**Impact.** `/keymap.js` and `board.keys` are part of the renderer API; `MOVE_KEYS` and `moveOfKey` stay, deprecated,
until the next major, and `terminalKeys` stays for renderers on the default keys. The `?` sheet can't drift from the
bindings.
