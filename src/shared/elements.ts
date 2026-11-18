/**
 * The html of the tower's elements (`/lib-ui/`), for views that draw as strings: each builder writes a `tower-*` tag
 * with its attributes, marked as the morph must leave it. Drawing the tag defines nothing: the page, or the extension
 * client that draws it, imports the element's module (`/lib-ui/combobox.js`, `/lib-ui/menu.js`) once.
 */
import { esc } from './format.ts'
import { domId } from './dom-id.ts'

/** An option of a `<tower-combobox>`: one to choose, a named group of them, or a line between them. */
export type ComboboxOption =
  | { value: string; label: string; keywords?: string[]; disabled?: boolean }
  | { type: 'group'; label: string; items: ComboboxOption[] }
  | { type: 'separator' }

/**
 * What a `<tower-combobox>` draws: its options, the value chosen (none when absent) and its words. Its id is
 * `domId(place, name)`, `name` the field it submits. It is named by its own `label`, or by the element drawn apart
 * whose id is `labelledby`, when the label around it holds more than words.
 */
export type Combobox = {
  place: string
  name: string
  placeholder?: string
  empty?: string
  value?: string | null
  options: ComboboxOption[]
  disabled?: boolean
  required?: boolean
} & ({ label: string; labelledby?: never } | { labelledby: string; label?: never })

/** One attribute, or nothing for an absent value; `true` writes a bare one. */
const attribute = (name: string, value: string | boolean | null | undefined) =>
  value === undefined || value === null || value === false ? '' : value === true ? ` ${name}` : ` ${name}="${esc(value)}"`

/** A `<tower-combobox>`: a text box filtering `options` to choose one, the value kept by its `valuechange` written back as `value`. */
export const comboboxHtml = (c: Combobox): string =>
  `<tower-combobox${attribute('id', domId(c.place, c.name))}${attribute('name', c.name)}${attribute('label', c.label)}${attribute('labelledby', c.labelledby)}${attribute('placeholder', c.placeholder)}` +
  `${attribute('empty', c.empty)}${attribute('value', c.value)}${attribute('options', JSON.stringify(c.options))}` +
  `${attribute('disabled', c.disabled)}${attribute('required', c.required)} data-owned="children"></tower-combobox>`

/** The id of the one subject menu a page holds: every subject's area and button open it. */
export const SUBJECT_MENU = 'subject-menu'

/** The page's subject menu, drawn once: its owner fills it for the subject it opens for, on `payloadchange`. */
export const subjectMenuHtml = (): string => `<tower-menu id="${SUBJECT_MENU}" data-owned="children"></tower-menu>`

/**
 * A subject's own markup, `html`, made the place its menu opens: a right-click, the context-menu key on what is focused
 * in it, or a long press opens the subject menu for `key` (a subject key, `card:<id>`) at the pointer. Its id is
 * `domId(place, key)`, `place` naming where it is drawn (`row`), so a redraw finds it again.
 */
export const subjectAreaHtml = (place: string, key: string, html: string): string =>
  `<tower-menu-area id="${esc(domId(place, key))}" for="${SUBJECT_MENU}" payload="${esc(key)}">${html}</tower-menu-area>`

/** The ⋯ button that opens the subject menu for `key` from a press or the keyboard, named `label`; its id is `domId(<place>/menu, key)`. */
export const subjectButtonHtml = (place: string, key: string, label: string): string =>
  `<tower-menu-button id="${esc(domId(`${place}/menu`, key))}" for="${SUBJECT_MENU}" payload="${esc(key)}" label="${esc(label)}" data-owned="children"></tower-menu-button>`

/** A subject's markup, `row`, as an area at `place` with its ⋯ button, named `label`, drawn at its end. */
export const subjectHtml = (place: string, key: string, label: string, row: string): string =>
  subjectAreaHtml(place, key, row + subjectButtonHtml(place, key, label))
