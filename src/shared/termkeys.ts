/**
 * The editing keys of a Mac text field, in every browser terminal. xterm.js sends a plain Enter for Shift+Enter, a
 * plain backspace for ⌘⌫ and ^H for Ctrl+⌫, nothing for ⌘← / ⌘→, and ESC [1;3D / ESC [1;3C for ⌥← / ⌥→, which a shell's
 * default keymap leaves unbound. Each of these sends the readline key that both Claude Code's prompt and a shell read. ⌥⌫ is left to xterm: its ESC DEL already deletes a word in both.
 */

import { addedCommandOf, commandOf, type Keys } from './keymap.ts'

/** The bytes each natural key's command (`keymap.ts`) sends. */
const BYTES: Record<string, string> = {
  newline: '\n', 'delete-word': '\x17', 'delete-to-start': '\x15', 'delete-to-end': '\x0b', 'line-start': '\x01', 'line-end': '\x05',
  'word-left': '\x1bb', 'word-right': '\x1bf',
}

/** A key that types text: no named key (`Enter`, `ArrowLeft`, `F5` are words), no ⌃ or ⌘ held. */
const isText = (e: KeyboardEvent): boolean => !/^[A-Z][A-Za-z0-9]*$/.test(e.key) && !e.ctrlKey && !e.metaKey

/**
 * A key the browser's composition types, kept from xterm and left to the browser:
 * - A text key while a composition is open: the key after a dead key, in Firefox, which reports it composing but with
 *   its own keyCode rather than 229 (`'m` after a dead apostrophe that didn't compose, `ã` after a dead tilde). xterm
 *   takes that keyCode for a composition abandoned and types the dead key at once, then the composition's text when
 *   it ends: `˜ã`, `'m` after `'`. A named key (Enter) still goes to xterm, which ends the composition before it.
 * - A dead key itself, whose text the composition (or `deadKeys`) types. xterm would hold it as unprocessed until a
 *   key it handles clears it, and the key after the composition was kept from it: that key's own keydown would be
 *   dropped, and a Backspace, which has no keypress to type it instead, lost.
 */
const leftToComposition = (e: KeyboardEvent): boolean => e.key === 'Dead' || (e.isComposing && e.keyCode !== 229 && isText(e))

/**
 * What to type for a dead key and the key after it that didn't compose with it, which WebKit (Safari, a WKWebView)
 * reports as one keydown whose `key` is both: `'s` on a layout whose apostrophe is a dead key (Brazilian, US
 * International). xterm types only the first character of it and the second is lost. In a window being typed into,
 * WebKit has already committed the dead key as a composition xterm typed (its `Dead` keydown came composing), so only
 * the rest is typed; with no composition, all of it. A named key (`Enter`, `ArrowLeft`, `F5`) is a word, never this.
 * One per terminal, as it remembers the last dead key; undefined for any other key.
 */
const deadKeys = () => {
  let composed = false
  return (e: KeyboardEvent): string | undefined => {
    const chars = [...e.key]
    const both = chars.length > 1 && isText(e)
    const text = both ? (composed ? chars.slice(1).join('') : e.key) : undefined
    if (e.type === 'keydown') composed = e.key === 'Dead' && e.isComposing
    return text
  }
}

/**
 * A terminal's key handler (xterm's `attachCustomKeyEventHandler`) driven by the keymap: a key that runs a command with
 * focus in a terminal (`commandOf`, then on keydown an extension's by `addedCommandOf`, over the `keys` the board holds
 * now) runs it on keydown and is kept from xterm and the browser. xterm types ⌥ text on keypress, so a chord of an
 * extension's that nothing ran is left its keypress. A natural key's command sends its bytes through `send`; any
 * other goes to `run`, an extension's by its `<cap>/<name>`, which returns whether it did something, and the key goes
 * on to xterm when it did not. A dead key and the key after it that WebKit reports
 * as one (`deadKeys`) are typed through `send`; a dead key, and a text key while a composition is open,
 * are left to the browser's composition (`leftToComposition`).
 * Every other key goes to xterm.
 */
export const terminalKeymap = (keys: () => Keys, run: (id: string, e: KeyboardEvent) => boolean, send: (bytes: string) => void) => {
  const deadKeyText = deadKeys()
  return (e: KeyboardEvent): boolean => {
    const text = deadKeyText(e)
    if (leftToComposition(e)) return false
    if (text !== undefined) {
      if (e.type === 'keydown') (e.preventDefault(), send(text))
      return false
    }
    const id = commandOf(keys(), e, 'terminal') ?? (e.type === 'keydown' ? addedCommandOf(keys(), e, 'terminal') : undefined)
    if (!id) return true
    if (e.type !== 'keydown') return false
    if (Object.hasOwn(BYTES, id)) send(BYTES[id])
    else if (!run(id, e)) return true
    e.preventDefault()
    return false
  }
}

