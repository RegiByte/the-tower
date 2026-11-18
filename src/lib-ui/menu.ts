/**
 * The tower's menu, served as `/lib-ui/menu.js`. Importing it defines three elements: `<tower-menu>`, one menu a page
 * holds for many subjects, filled for the subject it opens for; `<tower-menu-button>`, the ⋯ button that opens it for
 * one subject, from the keyboard too; and `<tower-menu-area>`, around a subject's own markup, where a right-click, the
 * context-menu key or a long press opens it at the pointer. Placement, dismissal, focus and the keys are the SDK's.
 *
 * A page writes the tags and their attributes only, and marks `<tower-menu>` and `<tower-menu-button>`
 * `data-owned="children"`, since each builds its parts inside itself. An area's children stay the page's.
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
      items: "What it offers, as the SDK's `MenuData`: items (`{value, label}`), groups, separators, checkboxes, radio groups and submenus. Set it on `payloadchange`.",
      open: 'Whether it is open.',
      api: "The SDK's menu controller.",
      openAt: '`openAt(payload, anchor)`: opens it for a subject at an element or a point (`{x, y}`), as a right-click on an area does; resolves once it closes.',
    },
    events: {
      payloadchange: '`detail.value`: the subject it is about to open for. Set `items` for it here.',
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
      label: "The button's accessible name, `Menu` when absent.",
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

/** The id of the SDK menu inside a `<tower-menu>`: its triggers name it. */
const innerId = (id: string) => `${id}--ui`

/** The parts a data menu copies for its items: a checkbox item shows its check. */
const PARTS = '<template><ui-menu-checkbox-item><ui-menu-item-indicator></ui-menu-item-indicator></ui-menu-checkbox-item></template>'

/** Each area's internals, through which its menu marks it open. */
const areaStates = new WeakMap<Element, CustomStateSet>()

class TowerMenu extends HTMLElement {
  static observedAttributes = ['modal', 'loop', 'presentation']
  #inner?: HTMLElementTagNameMap['ui-menu']
  #items?: MenuData

  connectedCallback() {
    if (this.#inner) return
    if (!this.id) throw new Error('<tower-menu> needs an id: its buttons and areas name it with for="<id>"')
    const inner = document.createElement('ui-menu')
    inner.id = innerId(this.id)
    inner.innerHTML = PARTS
    for (const name of TowerMenu.observedAttributes) this.#copy(inner, name)
    this.append(inner)
    this.#inner = inner
    if (this.#items) inner.items = this.#items
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

  /** A checkbox item's own `checkedchange`, which doesn't bubble, fired again on the menu with the item's value. */
  #checked(event: CustomEvent<{ value: boolean }>) {
    const item = event.target as Element
    const detail = { value: item.getAttribute('value'), checked: event.detail.value }
    if (!this.dispatchEvent(new CustomEvent('checkedchange', { detail, cancelable: event.cancelable, bubbles: true }))) event.preventDefault()
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

  set items(items: MenuData) {
    this.#items = items
    if (this.#inner) this.#inner.items = items
  }
  get items(): MenuData {
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

  connectedCallback() {
    if (this.#trigger) return
    const trigger = document.createElement('ui-menu-trigger')
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = '⋯'
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
    trigger.querySelector('button')!.setAttribute('aria-label', this.getAttribute('label') ?? 'Menu')
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
