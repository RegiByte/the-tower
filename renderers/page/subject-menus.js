import '/lib-ui/menu.js'
import { SUBJECT_MENU, subjectMenuHtml } from '/lib/elements.js'
import { menuPins, subjectMenu } from '/lib/palette.js'

/**
 * @import { Board } from '/lib/board.js'
 * @import { Hold } from '/lib/layout.js'
 * @import { MenuLine, MenuPick, MenuSub, Opened, SubjectMenu } from '/lib/palette.js'
 * @import { Press } from '/lib/view.js'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   opened: () => Opened[],
 *   origins: () => Record<string, string>,
 *   pick: (does: MenuPick, press: Press) => void,
 *   closed: () => void,
 *   pins: (key: string) => Pinning | undefined,
 *   pin: (region: string, pin: string, on: boolean) => void,
 * }} SubjectMenusDeps
 */

/**
 * The region drawn beside a subject that its menu's lines pin into: its id, what it holds, its pins as the layout has
 * them, and the words its menu's submenu is named by.
 * @typedef {{ region: string, holds: readonly Hold[], pinned: readonly string[], label: string }} Pinning
 */

/** What a pin's checkbox in the menu is valued by: apart from every line's id. */
const PIN = 'pin '

/** A line of `subjectMenu` as the SDK's menu data: a tick where it says what is open. @param {MenuLine} l */
const itemOf = (l) => (l.open === undefined ? { value: l.id, label: l.label, ...(l.destructive && { destructive: true }) } : { type: /** @type {const} */ ('checkbox'), value: l.id, label: l.label, checked: l.open, closeOnSelect: true })

/** A subject's menu as the SDK's menu data: each group under its name, a line between groups. @param {SubjectMenu} m */
const itemsOf = (m) =>
  m.groups.flatMap((g, n) => [
    ...(n ? [{ type: /** @type {const} */ ('separator') }] : []),
    { type: /** @type {const} */ ('group'), label: g.label, items: g.lines.map((l) => ('lines' in l ? { type: /** @type {const} */ ('submenu'), label: l.label, items: l.lines.map(itemOf) } : itemOf(l))) },
  ])

/**
 * The submenu that pins a subject's lines into the region beside it, each checked where the layout pins it. A check
 * closes the menu, so the region is drawn again with the pin, and the menu opens next with its checks as they stand.
 * @param {SubjectMenu} m @param {Pinning} p
 */
const pinsItem = (m, p) => ({
  type: /** @type {const} */ ('submenu'),
  label: p.label,
  items: menuPins(m, p.holds).map(({ pin, line }) => ({ type: /** @type {const} */ ('checkbox'), value: `${PIN}${pin}`, label: line.label, checked: p.pinned.includes(pin), closeOnSelect: true })),
})

/** Every line of a menu, its submenus' included, by id. @param {SubjectMenu} m @returns {Map<string, MenuLine>} */
const linesOf = (m) => new Map(m.groups.flatMap((g) => g.lines.flatMap((l) => ('lines' in l ? /** @type {MenuSub} */ (l).lines : [/** @type {MenuLine} */ (l)]))).map((l) => [l.id, l]))

/**
 * The press picking `line` of the menu of the subject `key` makes: keyed by the line on that subject, so a second pick
 * is ignored while it is in flight, the subject's areas busy meanwhile. @param {string} key @param {MenuLine} line @returns {Press}
 */
const linePress = (key, line) => ({ key: `menu ${key} ${line.id}`, marks: `tower-menu-area[payload="${CSS.escape(key)}"]` })

/**
 * The page's one subject menu, drawn once at the end of the body, where no redraw reaches it: filled from
 * `subjectMenu` for the subject it opens for, as the board and the page's open views stand then, and a chosen line run
 * through `pick` as its press (`linePress`). A subject drawn beside a region its lines pin into (`pins`) has a submenu
 * pinning them there, each toggled through `pin`. `closed` is told as it closes. Answers whether it is open, and runs a
 * line pinned beside its subject.
 * @param {SubjectMenusDeps} deps
 */
export function subjectMenus({ board, opened, origins, pick, closed, pins, pin }) {
  document.body.insertAdjacentHTML('beforeend', subjectMenuHtml())
  const menu = /** @type {HTMLElement & { items: unknown, open: boolean }} */ (document.getElementById(SUBJECT_MENU))
  /** The subject the menu was filled for, its lines by id, and the region its lines pin into. */
  let filled = { key: '', lines: /** @type {Map<string, MenuLine>} */ (new Map()), pinning: /** @type {Pinning | undefined} */ (undefined) }

  menu.addEventListener('payloadchange', (e) => {
    const key = /** @type {CustomEvent<{ value: string }>} */ (e).detail.value
    const m = subjectMenu(board(), key, { open: opened(), origins: origins() })
    const pinning = m && pins(key)
    filled = { key, lines: m ? linesOf(m) : new Map(), pinning }
    menu.items = m ? [...itemsOf(m), ...(pinning ? [{ type: /** @type {const} */ ('separator') }, pinsItem(m, pinning)] : [])] : [{ value: '', label: 'No longer on the board', disabled: true }]
  })

  /** @param {Event} e */
  const run = (e) => {
    const line = filled.lines.get(/** @type {CustomEvent<{ value: string }>} */ (e).detail.value)
    if (line) pick(line.does, linePress(filled.key, line))
  }
  menu.addEventListener('action', run)
  menu.addEventListener('checkedchange', (e) => {
    const { value, checked } = /** @type {CustomEvent<{ value: string, checked: boolean }>} */ (e).detail
    if (filled.pinning && value.startsWith(PIN)) return pin(filled.pinning.region, value.slice(PIN.length), checked)
    run(e)
  })
  menu.addEventListener('openchange', (e) => {
    if (!(/** @type {CustomEvent<{ value: boolean }>} */ (e).detail.value)) queueMicrotask(closed)
  })
  return {
    open: () => menu.open,
    /** Runs the line `id` of the menu of the subject `key` as picking it in the menu does: a line pinned beside its subject. @param {string} key @param {string} id */
    runLine: (key, id) => {
      const m = subjectMenu(board(), key, { open: opened(), origins: origins() })
      const line = m && linesOf(m).get(id)
      if (line) pick(line.does, linePress(key, line))
    },
  }
}
