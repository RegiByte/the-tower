/**
 * The tower's popover, served as `/lib-ui/popover.js`. Importing it defines two elements: `<tower-popover>`, a panel
 * beside the button that opened it, for reading or acting in while the page stays usable; and
 * `<tower-popover-button>`, around the page's own button, which opens it. Placement beside the button, Escape, a press
 * outside, a press into a frame, focus leaving it and focus back to the button are the SDK's.
 *
 * A page writes the tags and their attributes only, marks `<tower-popover>` `data-owned="children"`, since it builds
 * its parts inside itself, and puts what it shows in its `body`. A button's children stay the page's: it is drawn and
 * redrawn like any other, and the element keeps its marks on it through a redraw.
 */
import type { UiPopoverElement } from '@ui-sdk/web'
import { relay, type ElementContract } from './sdk.ts'

/** What each element takes, fires and shows. */
export const elements = {
  'tower-popover': {
    attributes: {
      id: 'Required: the name its buttons give in `for`.',
      label: 'Its accessible name.',
      side: 'The side of its button it opens on: `bottom`, the default, `top`, `left` or `right`. It flips when there is no room.',
      align: 'How it lines up with its button along that side: `start`, `center`, the default, or `end`.',
    },
    properties: {
      open: 'Whether it is open. Set it to open it beside its first button drawn, or to close it; setting it fires no `openchange`.',
      body: 'The element it shows: put its content here, drawn whether it is open or not. It scrolls inside the popover when its content is taller than the room beside its button.',
      openFrom: '`openFrom(button)`: opens it beside `button`, an element in the page, focus going back there once it closes; resolves once it closes.',
    },
    events: {
      openchange: '`detail.value`: whether it opens or closes, `detail.reason` why (`trigger-press`, `escape-key`, `outside-press`, `focus-out`, `window-blur`, `anchor-hidden`). `preventDefault()` keeps it as it is.',
    },
    states: {},
  },
  'tower-popover-button': {
    attributes: {
      for: 'The id of the `<tower-popover>` it opens.',
    },
    properties: {},
    events: {},
    states: {
      open: 'While its popover is open beside it.',
    },
  },
} satisfies Record<string, ElementContract>

/** The id of the SDK popover inside a `<tower-popover>`, and of its content, which its buttons control. */
const innerId = (id: string) => `${id}--ui`
const contentId = (id: string) => `${id}--content`

/** Its parts: the content, kept in the page while closed, holding the body the page fills. */
const parts = (id: string) =>
  `<ui-popover id="${innerId(id)}"><ui-popover-content id="${contentId(id)}" side-offset="4" collision-padding="8" final-focus="none" keep-mounted hidden><div data-tower-popover="body"></div></ui-popover-content></ui-popover>`

/** The page's own button inside a `<tower-popover-button>`: its first button, or its first element. */
const buttonOf = (host: Element): HTMLElement | null => host.querySelector(':scope > button') ?? (host.firstElementChild as HTMLElement | null)

/**
 * Where `button` stands, read each time the popover places itself. The SDK anchors to an element by writing on its
 * style, which a redraw of the page's button rewrites; a box it can only read leaves the button as its page drew it.
 */
const boxOf = (button: HTMLElement) => ({ getBoundingClientRect: () => button.getBoundingClientRect() })

class TowerPopover extends HTMLElement {
  static observedAttributes = ['label', 'side', 'align']
  #inner?: UiPopoverElement
  #content?: HTMLElement
  #body?: HTMLElement
  #open = false
  /** The button it opened beside last: where it stands and where focus goes back. */
  #opener?: HTMLElement

  connectedCallback() {
    if (this.#inner) return
    if (!this.id) throw new Error('<tower-popover> needs an id: its buttons name it with for="<id>"')
    this.innerHTML = parts(this.id)
    const inner = this.querySelector<UiPopoverElement>('ui-popover')!
    this.#inner = inner
    this.#content = this.querySelector<HTMLElement>('ui-popover-content')!
    this.#body = this.querySelector<HTMLElement>('[data-tower-popover="body"]')!
    for (const name of TowerPopover.observedAttributes) this.#copy(name)
    inner.addEventListener('openchange', (event) => this.#keepForOwnButton(event as CustomEvent<{ value: boolean; reason: string; event?: Event }>), { capture: true })
    relay(inner, this, ['openchange'])
    inner.addEventListener('openchange', (event) => {
      if (event.defaultPrevented) return
      const open = (event as CustomEvent<{ value: boolean }>).detail.value
      this.#mark(open)
      if (!open) this.#giveFocusBack()
    })
    if (this.#open) this.#show(this.#firstButton(), undefined)
  }

  attributeChangedCallback(name: string, was: string | null, value: string | null) {
    if (this.#inner && was !== value) this.#copy(name)
  }

  #copy(name: string) {
    const value = this.getAttribute(name)
    const target = this.#content!
    const as = name === 'label' ? 'aria-label' : name
    if (value === null) target.removeAttribute(as)
    else target.setAttribute(as, value)
  }

  /**
   * A press on the button it is open beside lands outside it, and the focus the press gives the button leaves it: each
   * would close it only for the press's click to open it again. The press is the button's, whose click closes it.
   */
  #keepForOwnButton(event: CustomEvent<{ value: boolean; reason: string; event?: Event }>) {
    const { value, reason, event: cause } = event.detail
    if (value || !this.#opener || (reason !== 'outside-press' && reason !== 'focus-out')) return
    const to = cause instanceof FocusEvent && cause.type === 'focusout' ? cause.relatedTarget : cause?.target
    if (to instanceof Node && this.#opener.contains(to)) event.preventDefault()
  }

  /**
   * Focus inside it as it closes goes back to the button it opened beside, once it has closed; focus that went
   * elsewhere, as a press on another control or into a frame takes it, stays there.
   */
  #giveFocusBack() {
    const opener = this.#opener
    const inside = this.#content!.contains(document.activeElement)
    if (!opener) return
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (opener.isConnected && (inside || active === document.body || active === null) && (active === document.body || active === null || this.#content!.contains(active))) opener.focus()
    })
  }

  /** The buttons that open it, in this page. */
  #buttons(): Element[] {
    const root = this.getRootNode() as Document | ShadowRoot
    return [...root.querySelectorAll(`tower-popover-button[for="${CSS.escape(this.id)}"]`)]
  }

  #firstButton(): HTMLElement | undefined {
    for (const host of this.#buttons()) {
      const button = buttonOf(host)
      if (button?.getClientRects().length) return button
    }
    return undefined
  }

  /** Each of its buttons shows whether it is open beside it, through its marks and its `open` state. */
  #mark(open: boolean) {
    for (const host of this.#buttons()) markButton(host, open && !!this.#opener && host.contains(this.#opener), this.id)
  }

  #show(button: HTMLElement | undefined, cause: Event | undefined) {
    this.#opener = button
    Object.assign(this.#content!, { anchor: button ? boxOf(button) : null })
    return this.#inner!.api.open({ ...(cause ? { reason: 'trigger-press', event: cause } : {}) })
  }

  /** A press on one of its buttons: open beside it, or closed when it is open beside it already. */
  pressed(button: HTMLElement, cause: Event) {
    if (!this.#inner) return
    if (this.open && this.#opener === button) return void this.#inner.api.close({ reason: 'trigger-press', event: cause })
    void this.#show(button, cause)
  }

  openFrom(button: HTMLElement) {
    if (!this.#inner) throw new Error(`<tower-popover id="${this.id}"> opens only once it is in the page`)
    return this.#show(button, undefined)
  }

  get body(): HTMLElement {
    if (!this.#body) throw new Error('<tower-popover> has a body only once it is in the page')
    return this.#body
  }

  get open() {
    return this.#inner ? this.#inner.open : this.#open
  }
  set open(open: boolean) {
    this.#open = open
    if (!this.#inner || this.#inner.open === open) return
    if (open) void this.#show(this.#firstButton(), undefined)
    else this.#inner.open = false
  }
}

/** Each button's internals, through which its popover marks it open. */
const buttonStates = new WeakMap<Element, CustomStateSet>()

/** The marks a popover keeps on each of its buttons' own button, by the host. */
const marksOf = new WeakMap<Element, Record<string, string>>()

/** Writes `marks` on `button` where it differs, so a pass over a button already marked writes nothing. */
const writeMarks = (button: Element, marks: Record<string, string>) => {
  for (const [name, value] of Object.entries(marks)) if (button.getAttribute(name) !== value) button.setAttribute(name, value)
}

/**
 * Marks the button inside `host` as one that opens a dialog, expanded and controlling the popover's content while
 * `open`, and keeps the marks there through a redraw, which rewrites the button's attributes as its page drew them.
 */
function markButton(host: Element, open: boolean, id: string) {
  const marks: Record<string, string> = { 'aria-haspopup': 'dialog', 'aria-expanded': String(open), 'aria-controls': contentId(id) }
  marksOf.set(host, marks)
  const button = buttonOf(host)
  if (button) writeMarks(button, marks)
  const states = buttonStates.get(host)
  if (open) states?.add('open')
  else states?.delete('open')
}

class TowerPopoverButton extends HTMLElement {
  #internals = this.attachInternals()
  /** A redraw of the page's button, or the button replaced: the marks are written again. */
  #redrawn = new MutationObserver(() => {
    const marks = marksOf.get(this)
    const button = buttonOf(this)
    if (marks && button) writeMarks(button, marks)
  })

  constructor() {
    super()
    buttonStates.set(this, this.#internals.states)
  }

  connectedCallback() {
    this.addEventListener('click', this.#onClick)
    if (!marksOf.has(this)) markButton(this, false, this.getAttribute('for') ?? '')
    this.#redrawn.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-haspopup', 'aria-expanded', 'aria-controls'] })
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick)
    this.#redrawn.disconnect()
  }

  #popover(): TowerPopover {
    const id = this.getAttribute('for') ?? ''
    const popover = (this.getRootNode() as Document | ShadowRoot).getElementById(id)
    if (!(popover instanceof TowerPopover)) throw new Error(`<tower-popover-button for="${id}"> names no <tower-popover> in its page`)
    return popover
  }

  #onClick = (event: MouseEvent) => {
    const button = buttonOf(this)
    if (event.defaultPrevented || !button || !(event.target instanceof Node) || !button.contains(event.target)) return
    if (button.matches(':disabled, [aria-disabled="true"]')) return
    this.#popover().pressed(button, event)
  }
}

customElements.define('tower-popover', TowerPopover)
customElements.define('tower-popover-button', TowerPopoverButton)
