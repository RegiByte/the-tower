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
 * A subject's own markup, `html`, made the place its menu opens: a right-click, the context-menu key on what is focused
 * in it, or a long press opens the subject menu for `key` (a subject key, `card:<id>`) at the pointer. `id` names it
 * among the page's elements, from the subject's key and where it is drawn, so a redraw finds it again.
 */
export const subjectAreaHtml = (id: string, key: string, html: string): string =>
  `<tower-menu-area id="${esc(id)}" for="${SUBJECT_MENU}" payload="${esc(key)}">${html}</tower-menu-area>`

/** The ⋯ button that opens the subject menu for `key` from a press or the keyboard, named `label`; `id` as an area's. */
export const subjectButtonHtml = (id: string, key: string, label: string): string =>
  `<tower-menu-button id="${esc(id)}" for="${SUBJECT_MENU}" payload="${esc(key)}" label="${esc(label)}" data-owned="children"></tower-menu-button>`

/** A subject's markup, `row`, as an area with its ⋯ button, named `label`, drawn at its end; the button's id is the area's, `/menu` after it. */
export const subjectHtml = (id: string, key: string, label: string, row: string): string => subjectAreaHtml(id, key, row + subjectButtonHtml(`${id}/menu`, key, label))
