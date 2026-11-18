/**
 * The html of the tower's elements (`/lib-ui/`), for views that draw as strings: each builder writes a `tower-*` tag
 * with its attributes, marked as the morph must leave it. Drawing the tag defines nothing: the page, or the extension
 * client that draws it, imports the element's module (`/lib-ui/combobox.js`, `/lib-ui/menu.js`) once.
 */
import { esc } from './format.ts'

/** An option of a `<tower-combobox>`: one to choose, a named group of them, or a line between them. */
export type ComboboxOption =
  | { value: string; label: string; keywords?: string[]; disabled?: boolean }
  | { type: 'group'; label: string; items: ComboboxOption[] }
  | { type: 'separator' }

/** What a `<tower-combobox>` draws: its options, the value chosen (none when absent) and its words. */
export type Combobox = {
  id?: string
  name?: string
  label: string
  placeholder?: string
  empty?: string
  value?: string | null
  options: ComboboxOption[]
  disabled?: boolean
  required?: boolean
}

/** One attribute, or nothing for an absent value; `true` writes a bare one. */
const attribute = (name: string, value: string | boolean | null | undefined) =>
  value === undefined || value === null || value === false ? '' : value === true ? ` ${name}` : ` ${name}="${esc(value)}"`

/** A `<tower-combobox>`: a text box filtering `options` to choose one, the value kept by its `valuechange` written back as `value`. */
export const comboboxHtml = (c: Combobox): string =>
  `<tower-combobox${attribute('id', c.id)}${attribute('name', c.name)}${attribute('label', c.label)}${attribute('placeholder', c.placeholder)}` +
  `${attribute('empty', c.empty)}${attribute('value', c.value)}${attribute('options', JSON.stringify(c.options))}` +
  `${attribute('disabled', c.disabled)}${attribute('required', c.required)} data-owned="children"></tower-combobox>`

/** The id of the one subject menu a page holds: every subject's area and button open it. */
export const SUBJECT_MENU = 'subject-menu'

/** The page's subject menu, drawn once: its owner fills it for the subject it opens for, on `payloadchange`. */
export const subjectMenuHtml = (): string => `<tower-menu id="${SUBJECT_MENU}" data-owned="children"></tower-menu>`

/**
 * A subject's own markup, `row`, made the place its menu opens: a right-click, the context-menu key or a long press on
 * it, and the ⋯ button drawn at its end, named `label`, open the subject menu for `key` (a subject key, `card:<id>`).
 */
export const subjectHtml = (key: string, label: string, row: string): string =>
  `<tower-menu-area for="${SUBJECT_MENU}" payload="${esc(key)}" tabindex="0">${row}` +
  `<tower-menu-button for="${SUBJECT_MENU}" payload="${esc(key)}" label="${esc(label)}" data-owned="children"></tower-menu-button></tower-menu-area>`
