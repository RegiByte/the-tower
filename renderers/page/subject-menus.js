import '/lib-ui/menu.js'
import { SUBJECT_MENU, subjectMenuHtml } from '/lib/elements.js'
import { subjectMenu } from '/lib/palette.js'

/**
 * @import { Board } from '/lib/board.js'
 * @import { MenuLine, MenuPick, MenuSub, Opened, SubjectMenu } from '/lib/palette.js'
 * @import { Press } from '/lib/view.js'
 */

/**
 * @typedef {{
 *   board: () => Board,
 *   opened: () => Opened[],
 *   origins: () => Record<string, string>,
 *   pick: (does: MenuPick, press: Press) => void,
 *   beside: (key: string, place: string | undefined, menu: SubjectMenu) => Beside,
 *   pin: (region: string, pin: string, on: boolean) => void,
 *   screen: (region: string, on: boolean) => void,
 * }} SubjectMenusDeps
 */

/**
 * What the page adds to a subject's menu from where it draws the subject: groups listed ahead of the menu's own (what a
 * region tucked there), the menu's own lines those groups list already (`omit`), and the region its lines pin into.
 * @typedef {{ first?: AsideGroup[], omit?: (line: MenuLine) => boolean, pinning?: Pinning }} Beside
 */

/** A line the page adds: `run` what picking it does; one without is said, not picked. @typedef {{ label: string, destructive?: boolean, run?: () => void }} AsideLine */

/** @typedef {{ label: string, lines: AsideLine[] }} AsideGroup */

/**
 * The region drawn beside a subject that its menu pins into: its id, the words its submenu is named by, what can be
 * pinned there, in groups, each checked where the layout pins it, and the regions there whose buttons the viewer keeps
 * on screen or in the menu only (`screens`), each checked while on screen.
 * @typedef {{ region: string, label: string, groups: { label?: string, pins: { pin: string, label: string, checked: boolean }[] }[], screens: { region: string, label: string, on: boolean }[] }} Pinning
 */

/** What a pin's checkbox in the menu is valued by, and a line the page adds: apart from every line's id. */
const PIN = 'pin '
const ASIDE = 'aside '
const SCREEN = 'screen '

/** Between a subject's key and the place it is drawn at, in a menu button's payload (`placedKey`). */
const PLACED = '\t'

/**
 * The payload of a ⋯ that opens the subject menu for `key` drawn at `place`, a region's own: the menu asks the page what
 * that place adds (`beside`).
 * @param {string} key @param {string} place
 */
export const placedKey = (key, place) => `${key}${PLACED}${place}`

/** A line of `subjectMenu` as the SDK's menu data: a tick where it says what is open. @param {MenuLine} l */
const itemOf = (l) => (l.open === undefined ? { value: l.id, label: l.label, ...(l.destructive && { destructive: true }) } : { type: /** @type {const} */ ('checkbox'), value: l.id, label: l.label, checked: l.open, closeOnSelect: true })

/** Groups as the SDK's menu data: each under its name, a line between groups. @template G @param {G[]} all @param {(g: G) => object} item */
const separated = (all, item) => all.flatMap((g, n) => [...(n ? [{ type: /** @type {const} */ ('separator') }] : []), item(g)])

/** A subject's menu as the SDK's menu data, less the lines `omit` says, and the groups that leaves empty. @param {SubjectMenu} m @param {(line: MenuLine) => boolean} omit */
const itemsOf = (m, omit) =>
  separated(m.groups.map((g) => ({ ...g, lines: g.lines.filter((l) => 'lines' in l || !omit(l)) })).filter((g) => g.lines.length), (g) => ({ type: /** @type {const} */ ('group'), label: g.label, items: g.lines.map((l) => ('lines' in l ? { type: /** @type {const} */ ('submenu'), label: l.label, items: l.lines.map(itemOf) } : itemOf(l))) }))

/**
 * The submenu that pins a subject's lines into the region beside it, each checked where the layout pins it, and last
 * whether the buttons there are on screen. A check closes the menu, so the region is drawn again with the change, and the
 * menu opens next with its checks as they stand.
 * @param {Pinning} p
 */
const pinsItem = (p) => ({
  type: /** @type {const} */ ('submenu'),
  label: p.label,
  items: separated(
    [
      ...p.groups.map((g) => ({ label: g.label, items: g.pins.map(({ pin, label, checked }) => ({ value: `${PIN}${pin}`, label, checked })) })),
      { label: 'Show on screen', items: p.screens.map(({ region, label, on }) => ({ value: `${SCREEN}${region}`, label, checked: on })) },
    ].filter((g) => g.items.length),
    (g) => ({ type: /** @type {const} */ ('group'), ...(g.label && { label: g.label }), items: g.items.map((i) => ({ type: /** @type {const} */ ('checkbox'), ...i, closeOnSelect: true })) }),
  ),
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
 * through `pick` as its press (`linePress`). What the page draws where the menu opened adds to it (`beside`): its
 * groups first, and a submenu pinning lines into the region there, each toggled through `pin`. A payload names the
 * subject alone, or it and the place its ⋯ is drawn at (`placedKey`). Answers what runs a line pinned beside its subject.
 * @param {SubjectMenusDeps} deps
 */
export function subjectMenus({ board, opened, origins, pick, beside, pin, screen }) {
  document.body.insertAdjacentHTML('beforeend', subjectMenuHtml())
  const menu = /** @type {HTMLElement & { items: unknown }} */ (document.getElementById(SUBJECT_MENU))
  /** The subject the menu was filled for, its lines by id, what the page added, and the region its lines pin into. */
  let filled = { key: '', lines: /** @type {Map<string, MenuLine>} */ (new Map()), aside: /** @type {AsideLine[]} */ ([]), pinning: /** @type {Pinning | undefined} */ (undefined) }

  menu.addEventListener('payloadchange', (e) => {
    const [key, place] = /** @type {CustomEvent<{ value: string }>} */ (e).detail.value.split(PLACED)
    const m = subjectMenu(board(), key, { open: opened(), origins: origins() })
    if (!m) {
      filled = { key, lines: new Map(), aside: [], pinning: undefined }
      menu.items = [{ value: '', label: 'No longer on the board', disabled: true }]
      return
    }
    const { first = [], omit = () => false, pinning } = beside(key, place, m)
    const aside = first.flatMap((g) => g.lines)
    filled = { key, lines: linesOf(m), aside, pinning }
    const asideItems = separated(first, (g) => ({
      type: /** @type {const} */ ('group'),
      label: g.label,
      items: g.lines.map((l) => ({ value: `${ASIDE}${aside.indexOf(l)}`, label: l.label, ...(!l.run && { disabled: true }), ...(l.destructive && { destructive: true }) })),
    }))
    menu.items = [...asideItems, ...(asideItems.length ? [{ type: /** @type {const} */ ('separator') }] : []), ...itemsOf(m, omit), ...(pinning ? [{ type: /** @type {const} */ ('separator') }, pinsItem(pinning)] : [])]
  })

  /** @param {Event} e */
  const run = (e) => {
    const value = /** @type {CustomEvent<{ value: string }>} */ (e).detail.value
    if (value.startsWith(ASIDE)) return filled.aside[Number(value.slice(ASIDE.length))]?.run?.()
    const line = filled.lines.get(value)
    if (line) pick(line.does, linePress(filled.key, line))
  }
  menu.addEventListener('action', run)
  menu.addEventListener('checkedchange', (e) => {
    const { value, checked } = /** @type {CustomEvent<{ value: string, checked: boolean }>} */ (e).detail
    if (filled.pinning && value.startsWith(PIN)) return pin(filled.pinning.region, value.slice(PIN.length), checked)
    if (value.startsWith(SCREEN)) return screen(value.slice(SCREEN.length), checked)
    run(e)
  })
  return {
    /** Runs the line `id` of the menu of the subject `key` as picking it in the menu does: a line pinned beside its subject. @param {string} key @param {string} id */
    runLine: (key, id) => {
      const m = subjectMenu(board(), key, { open: opened(), origins: origins() })
      const line = m && linesOf(m).get(id)
      if (line) pick(line.does, linePress(key, line))
    },
  }
}
