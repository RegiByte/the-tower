/**
 * The editing keys of a Mac text field, in every browser terminal. xterm.js sends a plain Enter for Shift+Enter, a
 * plain backspace for ⌘⌫ and ^H for Ctrl+⌫, and nothing for ⌘← / ⌘→. Each of these sends the readline control key
 * that both Claude Code's prompt and a shell read. ⌥⌫ is left to xterm: its ESC DEL already deletes a word in both. The
 * tower serves this module as `/termkeys.js`.
 */

/** The parts of a keydown a natural key depends on. */
export type TermKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>

type Chord = 'Shift' | 'Ctrl' | 'Meta'

/** Each natural key: the key and the only modifier held, the bytes it sends, and how renderers name it. */
export const NATURAL_KEYS: { key: string; chord: Chord; bytes: string; label: string; does: string }[] = [
  { key: 'Enter', chord: 'Shift', bytes: '\n', label: '⇧⏎', does: "a new line in a worker's prompt (Enter in a shell)" },
  { key: 'Backspace', chord: 'Ctrl', bytes: '\x17', label: '⌃⌫', does: 'delete the word before the cursor, as ⌥⌫ does' },
  { key: 'Backspace', chord: 'Meta', bytes: '\x15', label: '⌘⌫', does: 'delete to the start of the line' },
  { key: 'Delete', chord: 'Meta', bytes: '\x0b', label: '⌘⌦', does: 'delete to the end of the line' },
  { key: 'ArrowLeft', chord: 'Meta', bytes: '\x01', label: '⌘←', does: 'go to the start of the line' },
  { key: 'ArrowRight', chord: 'Meta', bytes: '\x05', label: '⌘→', does: 'go to the end of the line' },
]

const chordOf = (e: TermKey): string =>
  [e.shiftKey && 'Shift', e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.metaKey && 'Meta'].filter(Boolean).join('+')

/** The bytes a key sends in place of xterm's, or undefined when xterm's are right. */
export const naturalKey = (e: TermKey): string | undefined => {
  const chord = chordOf(e)
  return NATURAL_KEYS.find((k) => k.key === e.key && k.chord === chord)?.bytes
}

/**
 * A terminal's key handler (xterm's `attachCustomKeyEventHandler`): the renderer's `shortcut` first, then the natural
 * keys, sent through `send` on keydown and kept from xterm and the browser; every other key goes to xterm.
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
