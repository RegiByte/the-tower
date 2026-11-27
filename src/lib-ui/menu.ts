/**
 * The tower's menu, served as `/lib-ui/menu.js`. Importing it defines three elements: `<tower-menu>`, one menu a page
 * holds for many subjects, filled for the subject it opens for; `<tower-menu-button>`, the button that opens it for
 * one subject, from the keyboard too: a ⋯ of its own, or the page's button inside it; and `<tower-menu-area>`, around a subject's own markup, where a right-click, the
 * context-menu key or a long press opens it at the pointer. Placement, dismissal, focus and the keys are the SDK's.
 *
 * A page writes the tags and their attributes only, and marks `<tower-menu>` and `<tower-menu-button>`
 * `data-owned="children"`, since each builds its parts inside itself. An area's children stay the page's. A
 * `<tower-menu-button>` drawn with a `<button>` inside opens from that button instead of a ⋯ of its own: its text and
 * look stay the page's, which writes it as any button of its own, and the SDK writes the menu's marks and anchor on it,
 * so a redraw through the morph must leave it be.
 */
import type { MenuData } from '@ui-sdk/web/menu'
import { relay, type ElementContract } from './sdk.ts'

/** What each element takes, fires and shows. */
export const elements = {
  'tower-menu': {
    attributes: {
      id: 'Required: the name its buttons and areas give in `for`.',
      modal: '`pointer`, the default: a press outside closes it and goes no further. `true` also makes the rest of the page inert; `false` lets the press through.',
      loop: 'Arrow keys wrap from the last item to the first.',
      presentation: '`auto`: a sheet from the bottom of a small touch screen, a popover elsewhere; `sheet`: always a sheet.',
    },
    properties: {
      items: "What it offers, as the SDK's `MenuData`: items (`{value, label}`), groups, separators, checkboxes, radio groups and submenus. Set it on `payloadchange`. An item's, checkbox's or radio item's `hint`, the tower's own, shows as a muted line under its label, at most two lines (its backtick spans drawn as code), and describes it whole to a screen reader without naming it; hints are found by value, so items sharing a value share one.",
      open: 'Whether it is open.',
      api: "The SDK's menu controller.",
      openAt: '`openAt(payload, anchor)`: opens it for a subject at an element or a point (`{x, y}`), as a right-click on an area does; resolves once it closes.',
    },
    events: {
      payloadchange: '`detail.value`: the subject it is about to open for, on every opening, the same subject again included. Set `items` for it here.',
      action: "`detail.value`: the value of the item chosen. It closes after.",
      checkedchange: "A checkbox item of `items` chosen: `detail.value`, the item's value; `detail.checked`, whether it turns on. `preventDefault()` refuses it. It closes after where the item sets `closeOnSelect`.",
      openchange: '`detail.value`: whether it opens or closes, `detail.reason` why. `preventDefault()` keeps it as it is.',
    },
    states: {},
  },
  'tower-menu-button': {
    attributes: {
      for: 'The id of the `<tower-menu>` it opens.',
      payload: 'The subject it opens the menu for.',
      label: "The button's accessible name: `Menu` when absent on its own ⋯; a page's button keeps its own when absent.",
    },
    properties: {},
    events: {},
    states: {},
  },
  'tower-menu-area': {
    attributes: {
      for: 'The id of the `<tower-menu>` it opens.',
      payload: 'The subject it opens the menu for.',
    },
    properties: {},
    events: {},
    states: {
      open: 'While its menu is open for its subject, however it was opened.',
    },
  },
} satisfies Record<string, ElementContract>

/** An entry of the SDK's `MenuData`, each entry with a value, in its groups and submenus too, with a `hint` the tower shows under its label. */
type Hinted<T> = T extends { items: readonly (infer I)[] } ? Omit<T, 'items'> & { items: Hinted<I>[] } : T extends { value: string } ? T & { hint?: string } : T

/** What a `<tower-menu>` offers: the SDK's `MenuData`, each item with an optional `hint`. */
export type TowerMenuData = Hinted<MenuData[number]>[]

/** The hint of each item of `items` that has one, by its value. */
const hintsOf = (items: TowerMenuData, into = new Map<string, string>()): Map<string, string> => {
  for (const item of items) {
    if (typeof item === 'string') continue
    if ('items' in item) hintsOf(item.items as TowerMenuData, into)
    else if ('hint' in item && item.hint) into.set(item.value, item.hint)
  }
  return into
}

/**
 * `hint` as runs of text and code: a run of backticks opens code that the next run of as many closes, as in markdown's
 * code spans; a run nothing closes is code itself, with the word it opens (a fence named in prose: ```json).
 */
const hintSpans = (hint: string): { code: boolean; text: string }[] => {
  const runs = [...hint.matchAll(/`+/g)]
  const spans: { code: boolean; text: string }[] = []
  let at = 0
  for (const [n, run] of runs.entries()) {
    if (run.index < at) continue
    const close = runs.find((other, m) => m > n && other[0].length === run[0].length)
    spans.push({ code: false, text: hint.slice(at, run.index) })
    const end = close ? close.index + close[0].length : run.index + /^`+[^\s`]*/.exec(hint.slice(run.index))![0].length
    spans.push({ code: true, text: close ? hint.slice(run.index + run[0].length, close.index) : hint.slice(run.index, end) })
    at = end
  }
  spans.push({ code: false, text: hint.slice(at) })
  return spans.filter((span) => span.text)
}

/** The hint each line was last drawn from. */
const drawnHint = new WeakMap<Element, string>()

/** `items` as the SDK takes them: without their hints. */
const bare = (items: TowerMenuData): MenuData =>
  items.map((item) => {
    if (typeof item === 'string') return item
    if ('items' in item) return { ...item, items: bare(item.items as TowerMenuData) } as MenuData[number]
    if (!('hint' in item)) return item
    const { hint: _, ...entry } = item
    return entry
  })

/** The id of the SDK menu inside a `<tower-menu>`: its triggers name it. */
const innerId = (id: string) => `${id}--ui`

/** The parts a data menu copies for its items: a checkbox item shows its check. */
const PARTS = '<template><ui-menu-checkbox-item><ui-menu-item-indicator></ui-menu-item-indicator></ui-menu-checkbox-item></template>'

/** Each area's internals, through which its menu marks it open. */
const areaStates = new WeakMap<Element, CustomStateSet>()

class TowerMenu extends HTMLElement {
  static observedAttributes = ['modal', 'loop', 'presentation']
  #inner?: HTMLElementTagNameMap['ui-menu']
  #items?: TowerMenuData
  #hints = new Map<string, string>()
  /** The SDK renders items as the menu and its submenus open: each rendered item gets its hint as it appears. */
  #rendered = new MutationObserver(() => this.#describe())

  connectedCallback() {
    if (this.#inner) return
    if (!this.id) throw new Error('<tower-menu> needs an id: its buttons and areas name it with for="<id>"')
    const inner = document.createElement('ui-menu')
    inner.id = innerId(this.id)
    inner.innerHTML = PARTS
    for (const name of TowerMenu.observedAttributes) this.#copy(inner, name)
    this.append(inner)
    this.#inner = inner
    if (this.#items) inner.items = bare(this.#items)
    this.#rendered.observe(inner, { childList: true, subtree: true })
    inner.addEventListener('payloadchange', () => (this.#announced = true))
    inner.addEventListener('openchange', (event) => this.#announce(event as CustomEvent<{ value: boolean; reason: string }>), { capture: true })
    relay(inner, this, ['payloadchange', 'action', 'openchange'])
    inner.addEventListener('checkedchange', (event) => this.#checked(event as CustomEvent<{ value: boolean }>), { capture: true })
    inner.addEventListener('openchange', (event) => {
      if (!event.defaultPrevented) this.#mark(event.detail.value ? (inner.api.getPayload() as string | undefined) : undefined)
    })
    inner.addEventListener('payloadchange', (event) => {
      if (!event.defaultPrevented && inner.open) this.#mark(event.detail.value as string | undefined)
    })
  }

  attributeChangedCallback(name: string, was: string | null, value: string | null) {
    if (this.#inner && was !== value) this.#copy(this.#inner, name)
  }

  /** Whether this opening has said its subject: the SDK says it only when it changes. */
  #announced = false

  /**
   * An opening for the subject the menu was last filled for, said as a `payloadchange` too, before the opening's
   * `openchange`, so its owner fills it as the page stands now.
   */
  #announce(event: CustomEvent<{ value: boolean; reason: string }>) {
    if (event.detail.value && !this.#announced) {
      const detail = { value: this.#inner!.api.getPayload(), reason: event.detail.reason }
      this.dispatchEvent(new CustomEvent('payloadchange', { detail, bubbles: true }))
    }
    this.#announced = event.detail.value
  }

  /** A checkbox item's own `checkedchange`, which doesn't bubble, fired again on the menu with the item's value. */
  #checked(event: CustomEvent<{ value: boolean }>) {
    const item = event.target as Element
    const detail = { value: item.getAttribute('value'), checked: event.detail.value }
    if (!this.dispatchEvent(new CustomEvent('checkedchange', { detail, cancelable: event.cancelable, bubbles: true }))) event.preventDefault()
  }

  /**
   * Each rendered item with a value shows its hint as a line under its label, and an item without one shows none. The
   * line is hidden from the item's name and is its description instead, whole while the line shows at most two lines.
   * Its backtick spans are drawn as `<code>`. Items are found by tag: the SDK marks a part's
   * `data-slot` after rendering it. The line's id encodes the value, which may hold the whitespace an id list splits on.
   * A pass changes only what differs, so the observer's own writes end there.
   */
  #describe() {
    for (const item of this.#inner?.querySelectorAll(':is(ui-menu-item, ui-menu-checkbox-item, ui-menu-radio-item)[value]') ?? []) {
      const value = item.getAttribute('value')!
      const hint = this.#hints.get(value)
      const line = item.querySelector(':scope > small')
      if (hint === undefined) {
        line?.remove()
        if (line) item.removeAttribute('aria-describedby')
        continue
      }
      const id = `${this.id}--hint:${encodeURIComponent(value)}`
      if (line && drawnHint.get(line) === hint && line.id === id) continue
      const shown = line ?? item.appendChild(document.createElement('small'))
      shown.id = id
      shown.setAttribute('aria-hidden', 'true')
      shown.replaceChildren(...hintSpans(hint).map((span) => (span.code ? Object.assign(document.createElement('code'), { textContent: span.text }) : span.text)))
      drawnHint.set(shown, hint)
      item.setAttribute('aria-describedby', shown.id)
    }
  }

  #copy(inner: Element, name: string) {
    const value = this.getAttribute(name)
    if (value === null) inner.removeAttribute(name)
    else inner.setAttribute(name, value)
  }

  /** Each area of this menu shows it open while the menu is open for the area's subject. */
  #mark(payload: string | undefined) {
    const root = this.getRootNode() as Document | ShadowRoot
    for (const area of root.querySelectorAll(`tower-menu-area[for="${CSS.escape(this.id)}"]`)) {
      const states = areaStates.get(area)
      if (payload !== undefined && area.getAttribute('payload') === payload) states?.add('open')
      else states?.delete('open')
    }
  }

  set items(items: TowerMenuData) {
    this.#items = items
    this.#hints = hintsOf(items)
    if (this.#inner) this.#inner.items = bare(items)
    this.#describe()
  }
  get items(): TowerMenuData {
    return this.#items ?? []
  }
  get open() {
    return !!this.#inner?.open
  }
  get api() {
    return this.#inner?.api
  }

  openAt(payload: string, anchor: Element | { x: number; y: number }) {
    if (!this.#inner) throw new Error(`<tower-menu id="${this.id}"> opens only once it is in the page`)
    return this.#inner.api.open({ payload, anchor })
  }
}

class TowerMenuButton extends HTMLElement {
  static observedAttributes = Object.keys(elements['tower-menu-button'].attributes)
  #trigger?: HTMLElementTagNameMap['ui-menu-trigger']

  /** Whether the button is the page's own, drawn inside it, or its ⋯. */
  #own = false

  connectedCallback() {
    if (this.#trigger) return
    const trigger = document.createElement('ui-menu-trigger')
    const page = this.querySelector<HTMLButtonElement>(':scope > button')
    this.#own = !page
    const button = page ?? Object.assign(document.createElement('button'), { type: 'button', textContent: '⋯' })
    if (!page) button.dataset.towerMenu = 'dots'
    trigger.append(button)
    this.append(trigger)
    this.#trigger = trigger
    this.#sync()
  }

  attributeChangedCallback(_: string, was: string | null, value: string | null) {
    if (was !== value) this.#sync()
  }

  #sync() {
    const trigger = this.#trigger
    if (!trigger) return
    trigger.setAttribute('for', innerId(this.getAttribute('for') ?? ''))
    trigger.payload = this.getAttribute('payload') ?? undefined
    const label = this.getAttribute('label') ?? (this.#own ? 'Menu' : null)
    if (label !== null) trigger.querySelector('button')!.setAttribute('aria-label', label)
  }
}

/** How long a touch is held before it opens the menu, as a long press does on a touch screen. */
const HOLD_MS = 500

/** How far a finger may move and still hold: a finger resting on glass moves a little. */
const HOLD_SLOP = 10

/** Eats the click a released hold makes, so the row or item under the finger isn't pressed too; the next press ends the watch. */
function swallowClick(doc: Document) {
  const watch = new AbortController()
  const options = { capture: true, signal: watch.signal }
  doc.addEventListener('click', (click) => (click.preventDefault(), click.stopPropagation(), watch.abort()), options)
  doc.addEventListener('pointerdown', () => watch.abort(), options)
}

class TowerMenuArea extends HTMLElement {
  #internals = this.attachInternals()

  constructor() {
    super()
    areaStates.set(this, this.#internals.states)
  }

  connectedCallback() {
    this.addEventListener('contextmenu', this.#onContext)
    this.addEventListener('pointerdown', this.#onPress)
  }

  disconnectedCallback() {
    this.removeEventListener('contextmenu', this.#onContext)
    this.removeEventListener('pointerdown', this.#onPress)
  }

  #menu(): TowerMenu {
    const id = this.getAttribute('for') ?? ''
    const menu = (this.getRootNode() as Document | ShadowRoot).getElementById(id)
    if (!(menu instanceof TowerMenu)) throw new Error(`<tower-menu-area for="${id}"> names no <tower-menu> in its page`)
    return menu
  }

  #open(anchor: Element | { x: number; y: number }) {
    void this.#menu().openAt(this.getAttribute('payload') ?? '', anchor)
  }

  #onContext = (event: MouseEvent) => {
    if (event.defaultPrevented) return
    event.preventDefault()
    const pointer = (event as PointerEvent).pointerType
    const keyboard = event.button !== 2 && !event.ctrlKey && pointer !== 'touch' && pointer !== 'pen'
    this.#open(keyboard ? (event.target as Element) : { x: event.clientX, y: event.clientY })
  }

  /**
   * A long press opens the menu where the finger rests, as the SDK's own context trigger does, without binding its
   * hold to the area, which would write on the area. While the finger is down the browser's own long-press
   * `contextmenu` (Android's) is refused, and the click its release makes after a hold is eaten.
   */
  #onPress = (down: PointerEvent) => {
    if (down.pointerType !== 'touch' || !down.isPrimary) return
    const doc = this.ownerDocument
    const press = new AbortController()
    const on = (type: string, listener: (event: Event) => void) => doc.addEventListener(type, listener, { capture: true, signal: press.signal })
    const ours = (event: Event) => (event as PointerEvent).pointerId === down.pointerId
    let held = false
    const timer = setTimeout(() => ((held = true), this.#open({ x: down.clientX, y: down.clientY })), HOLD_MS)
    const end = () => (clearTimeout(timer), press.abort())
    on('pointermove', (move) => {
      const { clientX, clientY } = move as PointerEvent
      if (ours(move) && !held && Math.hypot(clientX - down.clientX, clientY - down.clientY) > HOLD_SLOP) end()
    })
    on('pointercancel', (cancel) => ours(cancel) && end())
    on('contextmenu', (menu) => menu.preventDefault())
    on('pointerup', (up) => {
      if (!ours(up)) return
      end()
      if (held) swallowClick(doc)
    })
  }
}

customElements.define('tower-menu', TowerMenu)
customElements.define('tower-menu-button', TowerMenuButton)
customElements.define('tower-menu-area', TowerMenuArea)
