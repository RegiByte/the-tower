/**
 * The keymap: every command a renderer runs from the keyboard, as data, with the chords that run it. The defaults live
 * here; the config's `keys` overrides them by command id (`docs/config.md`), and the board carries the result as
 * `board.keys`. A renderer maps each id it knows to what it does, matches keydowns with `commandOf`, and names chords
 * with `keysLabel` and `keyshortcuts`. The tower serves this module as `/keymap.js`.
 *
 * A chord is modifiers (`Alt`, `Ctrl`, `Meta`, `Shift`) joined by `+`, then one key: a letter or digit (`J`, `1`),
 * matched by the physical key so ⌥'s composed characters on a Mac don't matter; a `KeyboardEvent.code` (`ArrowUp`,
 * `Escape`, `Slash`); or any other single character (`?`), matched by the character typed, Shift ignored. Modifiers
 * match exactly.
 *
 * Where a chord fires is its command's scope and what holds focus: `global` anywhere, but a chord without Alt, Ctrl or
 * Meta only while nothing types (a terminal or a text field would take it as typing); `terminal` with focus in a
 * terminal; `field` in a text field. ⌥ letters reach the tower from a terminal while xterm's `macOptionIsMeta` is off.
 */

export type Scope = 'global' | 'terminal' | 'field'

/** What holds focus when a key is pressed: a terminal, a text field (or an open dialog), or the page itself. */
export type Focus = 'terminal' | 'field' | 'page'

export type Command = { id: string; scope: Scope; group: string; does: string; chords: string[] }

/** Each command id with its chords, as written in a canonical form (`chordOf`). */
export type Keys = Record<string, string[]>

export const COMMANDS: Command[] = [
  { id: 'prev-worker', scope: 'global', group: 'Move', chords: ['Alt+ArrowUp'], does: "previous worker on duty, in the sidebar's order: the top floor first, each floor's crews in order" },
  { id: 'next-worker', scope: 'global', group: 'Move', chords: ['Alt+ArrowDown'], does: "next worker on duty, in the sidebar's order" },
  { id: 'next-waiting', scope: 'global', group: 'Move', chords: ['Alt+J', 'N'], does: 'next worker waiting on you: a question first, then whoever has waited longest' },
  { id: 'home', scope: 'global', group: 'Move', chords: ['Escape'], does: 'back to the skyline' },
  { id: 'sidebar', scope: 'global', group: 'Page', chords: ['Meta+B'], does: 'hide or show the sidebar' },
  { id: 'help', scope: 'global', group: 'Page', chords: ['?'], does: 'this sheet: the keys and what the statuses mean' },
  { id: 'pane-terminal', scope: 'global', group: 'Panes', chords: ['Alt+1'], does: "the selected worker's terminal, focused" },
  { id: 'pane-brief', scope: 'global', group: 'Panes', chords: ['Alt+2'], does: "the selected worker's brief" },
  { id: 'pane-changes', scope: 'global', group: 'Panes', chords: ['Alt+3'], does: "the selected worker's changes" },
  { id: 'pane-reviews', scope: 'global', group: 'Panes', chords: ['Alt+4'], does: "the selected worker's review thread" },
  { id: 'leave-terminal', scope: 'terminal', group: 'Terminal', chords: ['Alt+Escape'], does: 'leave the terminal: focus goes back to where it was before it, or to the worker bar' },
  { id: 'newline', scope: 'terminal', group: 'Terminal', chords: ['Shift+Enter'], does: "a new line in a worker's prompt (Enter in a shell)" },
  { id: 'delete-word', scope: 'terminal', group: 'Terminal', chords: ['Ctrl+Backspace'], does: 'delete the word before the cursor, as ⌥⌫ does' },
  { id: 'delete-to-start', scope: 'terminal', group: 'Terminal', chords: ['Meta+Backspace'], does: 'delete to the start of the line' },
  { id: 'delete-to-end', scope: 'terminal', group: 'Terminal', chords: ['Meta+Delete'], does: 'delete to the end of the line' },
  { id: 'line-start', scope: 'terminal', group: 'Terminal', chords: ['Meta+ArrowLeft'], does: 'go to the start of the line' },
  { id: 'line-end', scope: 'terminal', group: 'Terminal', chords: ['Meta+ArrowRight'], does: 'go to the end of the line' },
  { id: 'save-draft', scope: 'field', group: 'Fields', chords: ['Meta+S', 'Ctrl+S'], does: 'save the open draft' },
  { id: 'submit', scope: 'field', group: 'Fields', chords: ['Meta+Enter', 'Ctrl+Enter'], does: 'start a session from the open draft or the new session dialog; add a review note' },
  { id: 'cancel-pick', scope: 'field', group: 'Fields', chords: ['Escape'], does: 'drop the lines picked for a review note' },
]

const COMMAND = new Map(COMMANDS.map((c) => [c.id, c]))

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const
type Modifier = (typeof MODIFIERS)[number]

/** A chord parsed: its modifiers, and the key either by `code` or by the `char` it types. */
type Chord = { mods: ReadonlySet<Modifier>; code?: string; char?: string }

const NAMED_CODES = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter', 'Tab', 'Space', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Backquote', 'Comma', 'Period', 'Slash',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]
const CODE = /^(Key[A-Z]|Digit[0-9])$/

const codeOfKey = (key: string): string | undefined =>
  /^[A-Za-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^[0-9]$/.test(key) ? `Digit${key}` : CODE.test(key) || NAMED_CODES.includes(key) ? key : undefined

/** A chord read from its text, or what is wrong with the text. */
const parse = (text: unknown): Chord | string => {
  if (typeof text !== 'string' || !text) return `${JSON.stringify(text)} is no chord: write one such as "Alt+J", "Meta+B" or "?"`
  const parts = text === '+' ? ['+'] : text.endsWith('++') ? [...text.slice(0, -2).split('+'), '+'] : text.split('+')
  const key = parts.pop()!
  const mods = new Set<Modifier>()
  for (const mod of parts) {
    if (!MODIFIERS.includes(mod as Modifier)) return `"${text}": "${mod}" is no modifier: they are ${MODIFIERS.join(', ')}`
    if (mods.has(mod as Modifier)) return `"${text}" holds ${mod} twice`
    mods.add(mod as Modifier)
  }
  const code = codeOfKey(key)
  if (code) return { mods, code }
  if ([...key].length !== 1 || /\s/.test(key))
    return `"${text}": "${key}" is no key: name a letter, a digit, a KeyboardEvent.code (${NAMED_CODES.slice(0, 6).join(', ')}, …) or one character such as "?"`
  if (mods.has('Alt')) return `"${text}": ⌥ changes the character typed on a Mac: name the key instead, such as "Alt+Slash"`
  mods.delete('Shift')
  return { mods, char: key }
}

/** A chord's text in its one form: modifiers in ⌃⌥⇧⌘ order, a letter or digit by itself. */
const textOf = (c: Chord): string =>
  [...MODIFIERS.filter((m) => c.mods.has(m)), c.char ?? c.code!.replace(/^(Key|Digit)/, '')].join('+')

/** Where a chord of a command may fire. */
const reach = (scope: Scope, c: Chord): Focus[] =>
  scope === 'global' ? (c.mods.has('Alt') || c.mods.has('Ctrl') || c.mods.has('Meta') ? ['page', 'terminal', 'field'] : ['page']) : [scope]

export type KeysProblem = { level: 'fail' | 'warn'; at: string; problem: string }

/**
 * What is wrong with the config's `keys`, each problem at its path below `keys`: a value that is no chord, a list of
 * them or null (a fail), an id no command has (a warn: it is ignored), a chord bound twice where both may fire (a fail
 * at the override that makes it so).
 */
export const keysProblems = (overrides: unknown): KeysProblem[] => {
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides))
    return [{ level: 'fail', at: '', problem: 'takes an object of command ids, each a chord, a list of chords or null' }]
  const entries = Object.entries(overrides)
  const shape = entries.flatMap(([id, value]): KeysProblem[] => {
    if (!COMMAND.has(id)) return [{ level: 'warn', at: `.${id}`, problem: `no command is called "${id}": they are ${COMMANDS.map((c) => c.id).join(', ')}` }]
    if (value === null || typeof value === 'string') return typeof value === 'string' && typeof parse(value) === 'string' ? [{ level: 'fail', at: `.${id}`, problem: parse(value) as string }] : []
    if (!Array.isArray(value)) return [{ level: 'fail', at: `.${id}`, problem: 'takes a chord, a list of chords or null' }]
    return value.flatMap((chord, n) => {
      const parsed = parse(chord)
      return typeof parsed === 'string' ? [{ level: 'fail' as const, at: `.${id}[${n}]`, problem: parsed }] : []
    })
  })
  if (shape.some((p) => p.level === 'fail')) return shape
  const keys = keymapOf(overrides as Record<string, string | string[] | null>)
  const bound = COMMANDS.flatMap((c) => keys[c.id].map((text) => ({ id: c.id, text, focus: reach(c.scope, parse(text) as Chord) })))
  const clashes = bound.flatMap((a, i) =>
    bound.slice(i + 1).filter((b) => b.text === a.text && b.id !== a.id && a.focus.some((f) => b.focus.includes(f))).map((b) => [a, b] as const),
  )
  return [
    ...shape,
    ...clashes.map(([a, b]): KeysProblem => {
      const at = Object.hasOwn(overrides, a.id) ? a.id : b.id
      const other = at === a.id ? b.id : a.id
      return { level: 'fail', at: `.${at}`, problem: `${a.text} is bound to ${other} as well, where both may fire: rebind ${other} too, or set it to null` }
    }),
  ]
}

const asList = (value: string | string[] | null): string[] => (value === null ? [] : typeof value === 'string' ? [value] : value)

/** Each command's chords: the defaults, those the config's `keys` names replaced. Ids no command has are left out. */
export const keymapOf = (overrides: Record<string, string | string[] | null>): Keys =>
  Object.fromEntries(COMMANDS.map((c) => [c.id, (Object.hasOwn(overrides, c.id) ? asList(overrides[c.id]) : c.chords).map((t) => textOf(parse(t) as Chord))]))

/** Every command at its default chords. */
export const DEFAULT_KEYS: Keys = keymapOf({})

/** The parts of a keydown a chord depends on. */
export type KeyPress = Pick<KeyboardEvent, 'code' | 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

const HELD: Record<Modifier, keyof KeyPress> = { Ctrl: 'ctrlKey', Alt: 'altKey', Shift: 'shiftKey', Meta: 'metaKey' }

const matches = (c: Chord, e: KeyPress): boolean =>
  (c.char ? e.key === c.char : e.code === c.code) && MODIFIERS.every((m) => (c.char && m === 'Shift') || c.mods.has(m) === e[HELD[m]])

/** The command a key press runs with `focus` where it is, by `keys` (`board.keys`). */
export const commandOf = (keys: Keys, e: KeyPress, focus: Focus): string | undefined =>
  COMMANDS.find((c) => keys[c.id]?.some((text) => {
    const chord = parse(text) as Chord
    return reach(c.scope, chord).includes(focus) && matches(chord, e)
  }))?.id

const KEY_LABEL: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: '⏎', Tab: '⇥', Backspace: '⌫', Delete: '⌦', Space: 'Space',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/',
}
const MOD_LABEL: Record<Modifier, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' }

/** A chord as a Mac names it: `⌥↓`, `⌘B`, `Esc`. */
export const chordLabel = (text: string): string => {
  const c = parse(text) as Chord
  const key = c.char ?? KEY_LABEL[c.code!] ?? c.code!.replace(/^(Key|Digit)/, '')
  return MODIFIERS.filter((m) => c.mods.has(m)).map((m) => MOD_LABEL[m]).join('') + key
}

/** A command's chords as a Mac names them, ` · ` between: what a tooltip or a key cap shows. Empty when unbound. */
export const keysLabel = (keys: Keys, id: string): string => (keys[id] ?? []).map(chordLabel).join(' · ')

const ARIA_MOD: Record<Modifier, string> = { Ctrl: 'Control', Alt: 'Alt', Shift: 'Shift', Meta: 'Meta' }
const ARIA_KEY: Record<string, string> = { Space: 'Space', ...Object.fromEntries(Object.entries(KEY_LABEL).filter(([code]) => !/^(Arrow|Escape|Enter|Tab|Backspace|Delete|Space)/.test(code))) }

/** A command's chords as `aria-keyshortcuts` takes them: `Alt+ArrowDown Meta+B`. */
export const keyshortcuts = (keys: Keys, id: string): string =>
  (keys[id] ?? [])
    .map((text) => {
      const c = parse(text) as Chord
      const key = c.char ?? ARIA_KEY[c.code!] ?? c.code!.replace(/^(Key|Digit)/, '')
      return [...MODIFIERS.filter((m) => c.mods.has(m)).map((m) => ARIA_MOD[m]), key].join('+')
    })
    .join(' ')

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const isPlain = (text: string): boolean => {
  const { mods } = parse(text) as Chord
  return !mods.has('Alt') && !mods.has('Ctrl') && !mods.has('Meta')
}

/** Where a command's chords work, in words: a global chord without ⌥, ⌃ or ⌘ is typing in a terminal or a field. */
const whereOf = (c: Command, chords: string[]): string => {
  if (c.scope === 'terminal') return 'in a terminal'
  if (c.scope === 'field') return 'in a text field'
  const plain = chords.filter(isPlain)
  if (!plain.length) return 'anywhere, a terminal too'
  if (plain.length === chords.length) return 'outside a terminal or a text field'
  return `${plain.map(chordLabel).join(' and ')} outside a terminal or a text field`
}

/**
 * The keys as a sheet, grouped, each row a command's chords and what it does with where it works; unbound commands are
 * left out. Rows are pairs of spans for a two-column grid, the chords' `.chords`, each group headed by an `<h3>`.
 */
export const keymapSheetHtml = (keys: Keys): string =>
  [...new Set(COMMANDS.map((c) => c.group))]
    .map((group) => {
      const rows = COMMANDS.filter((c) => c.group === group && keys[c.id]?.length)
        .map((c) => `<span class="chords">${keys[c.id].map((t) => `<kbd>${esc(chordLabel(t))}</kbd>`).join(' ')}</span><span>${esc(c.does)} <small>· ${esc(whereOf(c, keys[c.id]))}</small></span>`)
        .join('')
      return rows && `<h3>${esc(group)}</h3>${rows}`
    })
    .join('')
