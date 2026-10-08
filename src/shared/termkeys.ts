/**
 * The editing keys of a Mac text field, in every browser terminal. xterm.js sends a plain Enter for Shift+Enter, a
 * plain backspace for ⌘⌫ and ^H for Ctrl+⌫, and nothing for ⌘← / ⌘→. Each of these sends the readline control key
 * that both Claude Code's prompt and a shell read. ⌥⌫ is left to xterm: its ESC DEL already deletes a word in both. The
 * tower serves this module as `/termkeys.js`.
 */

import { chordLabel, commandOf, COMMANDS, type Keys } from './keymap.ts'

/** The parts of a keydown a natural key depends on. */
export type TermKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>

type Chord = 'Shift' | 'Ctrl' | 'Meta'

/** The bytes each natural key's command (`/keymap.js`) sends. */
const BYTES: Record<string, string> = {
  newline: '\n', 'delete-word': '\x17', 'delete-to-start': '\x15', 'delete-to-end': '\x0b', 'line-start': '\x01', 'line-end': '\x05',
}

/** Each natural key at its default chord: its command, the key and the only modifier held, the bytes it sends, and how renderers name it. */
export const NATURAL_KEYS: { id: string; key: string; chord: Chord; bytes: string; label: string; does: string }[] = Object.entries(BYTES).map(([id, bytes]) => {
  const command = COMMANDS.find((c) => c.id === id)!
  const [chord, key] = command.chords[0].split('+') as [Chord, string]
  return { id, key, chord, bytes, label: chordLabel(command.chords[0]), does: command.does }
})

const chordOf = (e: TermKey): string =>
  [e.shiftKey && 'Shift', e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.metaKey && 'Meta'].filter(Boolean).join('+')

/** The bytes a key sends in place of xterm's, or undefined when xterm's are right. */
export const naturalKey = (e: TermKey): string | undefined => {
  const chord = chordOf(e)
  return NATURAL_KEYS.find((k) => k.key === e.key && k.chord === chord)?.bytes
}

/**
 * A terminal's key handler (xterm's `attachCustomKeyEventHandler`) driven by the keymap: a key that runs a command with
 * focus in a terminal (`commandOf`, over the `keys` the board holds now) runs it on keydown and is kept from xterm and
 * the browser. A natural key's command sends its bytes through `send`; any other goes to `run`, which returns whether
 * it did something, and the key goes on to xterm when it did not. Every other key goes to xterm.
 */
export const terminalKeymap =
  (keys: () => Keys, run: (id: string, e: KeyboardEvent) => boolean, send: (bytes: string) => void) =>
  (e: KeyboardEvent): boolean => {
    const id = commandOf(keys(), e, 'terminal')
    if (!id) return true
    if (e.type !== 'keydown') return false
    if (Object.hasOwn(BYTES, id)) send(BYTES[id])
    else if (!run(id, e)) return true
    e.preventDefault()
    return false
  }

/**
 * A terminal's key handler at the default natural keys (xterm's `attachCustomKeyEventHandler`): the renderer's
 * `shortcut` first, then the natural keys, sent through `send` on keydown and kept from xterm and the browser; every
 * other key goes to xterm. `terminalKeymap` follows the config's keys.
 */
export const terminalKeys =
  (shortcut: (e: KeyboardEvent) => boolean, send: (bytes: string) => void) =>
  (e: KeyboardEvent): boolean => {
    if (shortcut(e)) return false
    const bytes = naturalKey(e)
    if (bytes === undefined) return true
    if (e.type === 'keydown') (e.preventDefault(), send(bytes))
    return false
  }
