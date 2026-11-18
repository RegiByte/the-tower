import '/lib-ui/menu.js'
import { SUBJECT_MENU, subjectMenuHtml } from '/lib/elements.js'
import { subjectMenu } from '/lib/palette.js'

/**
 * @import { Board } from '/lib/board.js'
 * @import { MenuLine, MenuPick, MenuSub, Opened, SubjectMenu } from '/lib/palette.js'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   opened: () => Opened[],
 *   origins: () => Record<string, string>,
 *   pick: (does: MenuPick, at: HTMLElement) => void,
 *   closed: () => void,
 * }} SubjectMenusDeps
 */

/** A line of `subjectMenu` as the SDK's menu data: a tick where it says what is open. @param {MenuLine} l */
const itemOf = (l) => (l.open === undefined ? { value: l.id, label: l.label, ...(l.destructive && { destructive: true }) } : { type: /** @type {const} */ ('checkbox'), value: l.id, label: l.label, checked: l.open, closeOnSelect: true })

/** A subject's menu as the SDK's menu data: each group under its name, a line between groups. @param {SubjectMenu} m */
const itemsOf = (m) =>
  m.groups.flatMap((g, n) => [
    ...(n ? [{ type: /** @type {const} */ ('separator') }] : []),
    { type: /** @type {const} */ ('group'), label: g.label, items: g.lines.map((l) => ('lines' in l ? { type: /** @type {const} */ ('submenu'), label: l.label, items: l.lines.map(itemOf) } : itemOf(l))) },
  ])

/** Every line of a menu, its submenus' included, by id. @param {SubjectMenu} m @returns {Map<string, MenuLine>} */
const linesOf = (m) => new Map(m.groups.flatMap((g) => g.lines.flatMap((l) => ('lines' in l ? /** @type {MenuSub} */ (l).lines : [/** @type {MenuLine} */ (l)]))).map((l) => [l.id, l]))

/**
 * The page's one subject menu, drawn once at the end of the body, where no redraw reaches it: filled from
 * `subjectMenu` for the subject it opens for, as the board and the page's open views stand then, and a chosen line run
 * through `pick`, busy on the subject's area. `closed` is told as it closes. Answers whether it is open.
 * @param {SubjectMenusDeps} deps
 */
export function subjectMenus({ board, opened, origins, pick, closed }) {
  document.body.insertAdjacentHTML('beforeend', subjectMenuHtml())
  const menu = /** @type {HTMLElement & { items: unknown, open: boolean }} */ (document.getElementById(SUBJECT_MENU))
  /** The subject the menu was filled for, and its lines by id. */
  let filled = { key: '', lines: /** @type {Map<string, MenuLine>} */ (new Map()) }

  menu.addEventListener('payloadchange', (e) => {
    const key = /** @type {CustomEvent<{ value: string }>} */ (e).detail.value
    const m = subjectMenu(board(), key, { open: opened(), origins: origins() })
    filled = { key, lines: m ? linesOf(m) : new Map() }
    menu.items = m ? itemsOf(m) : [{ value: '', label: 'No longer on the board', disabled: true }]
  })

  /** @param {Event} e */
  const run = (e) => {
    const line = filled.lines.get(/** @type {CustomEvent<{ value: string }>} */ (e).detail.value)
    if (!line) return
    const area = document.querySelector(`tower-menu-area[payload="${CSS.escape(filled.key)}"]`)
    pick(line.does, /** @type {HTMLElement} */ (area ?? menu))
  }
  menu.addEventListener('action', run)
  menu.addEventListener('checkedchange', run)
  menu.addEventListener('openchange', (e) => {
    if (!(/** @type {CustomEvent<{ value: boolean }>} */ (e).detail.value)) queueMicrotask(closed)
  })
  return { open: () => menu.open }
}
