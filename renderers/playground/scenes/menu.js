import { fail } from '../checks.js'

/**
 * `<tower-menu>` over four subjects' rows redrawn through the morph every 100 ms once started: opened by a right-click on
 * a `<tower-menu-area>` and by Enter on a `<tower-menu-button>`, its submenu, its action, a checkbox item, its focus
 * coming back and its subject said again on an opening for the same one. The rows sit where `ROWS` says, so a driver's
 * right-click lands on one without reading the frame first.
 */

export const SUBJECTS = [
  { id: 'floor:atlas', name: 'atlas', kind: 'floor' },
  { id: 'worker:AHAB-47', name: 'AHAB-47', kind: 'worker' },
  { id: 'worker:HOLMES-26', name: 'HOLMES-26', kind: 'worker' },
  { id: 'shown:AHAB-47/1', name: 'report.html', kind: 'tab' },
]

/** Where the rows sit in the frame, in CSS pixels. */
export const ROWS = { left: 24, top: 48, width: 360, height: 32 }

/** The point in the frame at the middle of row `i`'s name. @returns {[number, number]} */
export const rowPoint = (/** @type {number} */ i) => [ROWS.left + 120, ROWS.top + i * ROWS.height + ROWS.height / 2]

/** @type {Record<string, string[]>} */
const VERBS = { floor: ['New worker', 'Tidy'], worker: ['Open', 'Message', 'Send home'], tab: ['Open', 'Close'] }

const itemsOf = (/** @type {string} */ id) => {
  const s = /** @type {(typeof SUBJECTS)[number]} */ (SUBJECTS.find((x) => x.id === id))
  return [
    { type: 'group', label: s.name, items: VERBS[s.kind].map((v) => ({ value: `${id}/${v.toLowerCase()}`, label: v })) },
    { type: 'separator' },
    { type: 'submenu', label: 'Kept', items: [{ value: `${id}/drafts`, label: 'Drafts' }, { value: `${id}/reviews`, label: 'Reviews' }] },
    { type: 'checkbox', value: `${id}/open`, label: 'Open here', checked: true, closeOnSelect: true },
  ]
}

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'menu',
  title: '<tower-menu>',
  about: 'A right-click on a row or Enter on its ⋯ opens the subject menu there: a group, a submenu, a checkbox item; Escape gives focus back; the row marks :state(open).',
  size: [420, 380],
  css: `body { padding: 0; }
  #view { position: absolute; left: ${ROWS.left}px; top: ${ROWS.top - 24}px; width: ${ROWS.width}px; }
  #view .head { height: 24px; color: var(--muted); }
  tower-menu-area { display: flex; align-items: center; gap: var(--sp-m); box-sizing: border-box; height: ${ROWS.height}px; padding: 0 var(--sp-m); border-radius: var(--radius); }
  tower-menu-area:state(open) { background: var(--panel-2); box-shadow: var(--selected); }
  tower-menu-area .name { flex: 1; }
  tower-menu-area .age { color: var(--muted); font-variant-numeric: tabular-nums; }`,
  html: () => '<div id="view"></div>',
  async wire(doc, win) {
    const { subjectHtml, subjectMenuHtml } = await import('/lib/elements.js')
    const { morph } = await import('/lib/morph.js')
    await import('/lib-ui/menu.js')
    await Promise.all(['tower-menu', 'ui-menu'].map((t) => customElements.whenDefined(t)))
    let tick = 0
    /** @type {ReturnType<typeof setInterval> | undefined} */
    let timer
    /** @type {unknown[][]} */
    const log = []
    const errors = /** @type {string[]} */ ([])
    win.addEventListener('error', (e) => errors.push(String(e.message)))
    let payloads = 0

    const row = (/** @type {(typeof SUBJECTS)[number]} */ s) => subjectHtml('row', s.id, `${s.name}: menu`, `<span class="name">${s.name}</span><span class="age">${tick % 60}s</span>`)
    const view = () => `<div class="head">render ${tick}</div><div id="rows">${SUBJECTS.map(row).join('')}</div>${subjectMenuHtml()}`
    const root = /** @type {HTMLElement} */ (doc.getElementById('view'))
    const render = () => (tick++, morph(root, view()))
    render()

    const menu = /** @type {HTMLElement & { open: boolean, items: unknown[], api: { getPayload(): string }, openAt(payload: string, at: Element): void }} */ (doc.getElementById('subject-menu'))
    const detailOf = (/** @type {Event} */ e) => /** @type {CustomEvent<{ value: any, reason?: string, checked?: boolean }>} */ (e).detail
    root.addEventListener('payloadchange', (e) => (log.push(['payload', detailOf(e).value]), (menu.items = itemsOf(detailOf(e).value))))
    root.addEventListener('openchange', (e) => log.push([/** @type {Element} */ (e.target).localName, 'open', detailOf(e).value, detailOf(e).reason]))
    root.addEventListener('action', (e) => log.push(['action', detailOf(e).value]))
    root.addEventListener('checkedchange', (e) => log.push(['checked', detailOf(e).value, detailOf(e).checked]))

    const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) <= 12
    const content = () => menu.querySelector('[data-slot="menu-content"]:not([data-nested])')
    const shown = (/** @type {Element | null} */ el) => !!el && el.getClientRects().length > 0
    const labels = (/** @type {Element | null | undefined} */ el) =>
      [...(el?.querySelectorAll('[role^="menuitem"]') ?? [])].filter((i) => i.closest('[data-slot="menu-content"]') === el).map((i) => i.textContent?.trim())
    const marked = () => [...doc.querySelectorAll('tower-menu-area')].filter((a) => a.matches(':state(open)')).map((a) => a.getAttribute('payload'))
    const area = (/** @type {number} */ i) => doc.querySelectorAll('tower-menu-area')[i]
    const button = (/** @type {number} */ i) => /** @type {HTMLButtonElement} */ (area(i).querySelector('tower-menu-button button'))

    return {
      start: () => ((timer = setInterval(render, 100)), true),
      stop: () => (clearInterval(timer), tick),
      rowPoint,
      /** Opens the menu as a right-click does, for a frame no driver's pointer reaches. */
      openAt: (/** @type {number} */ i) => (menu.openAt(SUBJECTS[i].id, area(i)), true),
      /** The menu is open for `payload`, at `point` when given, its first item `first`, its row the only one marked. */
      menuAt: (/** @type {string} */ payload, /** @type {[number, number] | null} */ point, /** @type {string} */ first) => {
        const r = content()?.getBoundingClientRect()
        const seen = { open: menu.open, at: r && [Math.round(r.x), Math.round(r.y)], items: labels(content()), marked: marked(), payload: menu.api.getPayload() }
        if (!seen.open || seen.payload !== payload || seen.items[0] !== first) fail(`the menu isn't open for ${payload}`, seen)
        if (point && r && !(near(r.x, point[0]) && near(r.y, point[1]))) fail(`the menu isn't at the pointer ${point}`, seen)
        if (JSON.stringify(seen.marked) !== JSON.stringify([payload])) fail(`only ${payload}'s area should show :state(open)`, seen)
        return seen
      },
      submenu: (/** @type {string[]} */ items) => {
        const sub = [...menu.querySelectorAll('[data-slot="menu-content"][data-nested]')].find(shown)
        const seen = { items: sub ? labels(sub) : null, active: doc.activeElement?.textContent?.trim() }
        if (JSON.stringify(seen.items) !== JSON.stringify(items)) fail('the submenu is not open', seen)
        return seen
      },
      acted: (/** @type {string} */ value) => {
        const seen = { open: menu.open, last: log.filter((l) => l[0] === 'action').at(-1), marked: marked() }
        if (seen.open || seen.last?.[1] !== value || seen.marked.length) fail(`the menu didn't run ${value} and close`, seen)
        return seen
      },
      checked: (/** @type {string} */ value) => {
        const seen = { open: menu.open, last: log.filter((l) => l[0] === 'checked').at(-1) }
        if (seen.open || seen.last?.[1] !== value || seen.last?.[2] !== false) fail(`the menu didn't fire checkedchange for ${value} and close`, seen)
        return seen
      },
      focusButton: (/** @type {number} */ i) => (win.focus(), button(i).focus(), doc.activeElement?.getAttribute('aria-label')),
      anchored: (/** @type {number} */ i) => {
        const b = button(i).getBoundingClientRect()
        const r = content()?.getBoundingClientRect()
        const seen = { button: [Math.round(b.x), Math.round(b.bottom)], at: r && [Math.round(r.x), Math.round(r.y)], expanded: button(i).getAttribute('aria-expanded') }
        if (!r || r.y < b.bottom - 1 || r.y > b.bottom + 16 || seen.expanded !== 'true') fail('the menu is not anchored below its button', seen)
        return seen
      },
      closedTo: (/** @type {number} */ i) => {
        const seen = { open: menu.open, focused: doc.activeElement === button(i), marked: marked() }
        if (seen.open || !seen.focused || seen.marked.length) fail('Escape should close the menu and give focus back to its button', seen)
        return seen
      },
      said: () => ((payloads = log.filter((l) => l[0] === 'payload').length), payloads),
      saidAgain: (/** @type {string} */ payload) => {
        const seen = log.filter((l) => l[0] === 'payload').slice(payloads)
        if (JSON.stringify(seen) !== JSON.stringify([['payload', payload]])) fail(`an opening for ${payload} again should say it once more`, seen)
        return seen
      },
      ownAttributes: () => {
        /** @type {Record<string, string[]>} */
        const written = { 'tower-menu': ['id', 'data-owned'], 'tower-menu-area': ['id', 'for', 'payload'], 'tower-menu-button': ['id', 'for', 'payload', 'label', 'data-owned'] }
        const extra = Object.entries(written).flatMap(([tag, names]) => [...doc.querySelectorAll(tag)].flatMap((el) => [...el.attributes].map((a) => a.name).filter((n) => !names.includes(n)).map((n) => `${tag} ${n}`)))
        if (extra.length) fail('an element wrote an attribute on itself', extra)
        return tick
      },
      errors: () => errors,
    }
  },
}
