/**
 * The tower's popover, served as `/lib-ui/popover.js`. Importing it defines two elements: `<tower-popover>`, a panel
 * beside the button that opened it, for reading or acting in while the page stays usable; and
 * `<tower-popover-button>`, around the page's own button, which opens it. Placement beside the button, Escape, a press
 * outside, a press into a frame, focus leaving it and focus back to the button are the SDK's.
 *
 * A page writes the tags and their attributes only, marks `<tower-popover>` `data-owned="children"`, since it builds
 * its parts inside itself, and puts what it shows in its `body`. `<tower-popover-button>` is the SDK's popover trigger
 * under the tower's tag: it binds the page's button inside it, which the SDK writes its ARIA and its CSS anchor on. The
 * button is drawn and redrawn like any other, marked `data-owned="attributes"` so a redraw keeps what the SDK wrote.
 */
import type { UiPopoverElement } from '@ui-sdk/web'
import { createParts, popover, relay, wrappedButton, type ElementContract } from './sdk.ts'

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
      openFrom: '`openFrom(element)`: opens it beside `element`, any element in the page; resolves once it closes.',
    },
    events: {
      openchange: '`detail.value`: whether it opens or closes, `detail.reason` why (`trigger-press`, `escape-key`, `outside-press`, `focus-out`, `window-blur`, `anchor-hidden`). `preventDefault()` keeps it as it is.',
    },
    states: {},
  },
  'tower-popover-button': {
    attributes: {
      for: 'The id of the `<tower-popover>` it opens. Its button, the first inside it, is marked `data-owned="attributes"`; while the popover is open beside it, the button has `aria-expanded="true"`.',
    },
    properties: {},
    events: {},
    states: {},
  },
} satisfies Record<string, ElementContract>

/** Its parts: the content, kept in the page while closed, holding the body the page fills. */
const parts = (id: string) =>
  `<ui-popover id="${id}--ui"><ui-popover-content id="${id}--content" side-offset="4" collision-padding="8" keep-mounted hidden><div data-tower-popover="body"></div></ui-popover-content></ui-popover>`

/** A part of the SDK's popover, as its trigger registers with the popover that owns it: the element it binds. */
type Part = { el: Element }

/**
 * The SDK root inside a `<tower-popover>`, where its buttons' parts register. `register` and `unregister` are the SDK's
 * internals, not its documented API, and an SDK bump may rename them: `tool:lib-ui` then fails in the popover scene, at
 * its first `opened` step for `register` (no button binds) and at `bound`, after `drawAnew`, for `unregister`.
 */
type Registry = { register(part: Part): void; unregister(part: Part): void }

const OWNED = 'attributes'

class TowerPopover extends HTMLElement {
  static observedAttributes = ['label', 'side', 'align']
  #inner?: UiPopoverElement & Registry
  #content?: HTMLElement
  #body?: HTMLElement
  #open = false
  /** Its buttons' parts that registered before it built its SDK root. */
  #early = new Set<Part>()

  connectedCallback() {
    if (this.#inner) return
    if (!this.id) throw new Error('<tower-popover> needs an id: its buttons name it with for="<id>"')
    this.innerHTML = parts(this.id)
    const inner = this.querySelector<UiPopoverElement & Registry>('ui-popover')!
    this.#inner = inner
    this.#content = this.querySelector<HTMLElement>('ui-popover-content')!
    this.#body = this.querySelector<HTMLElement>('[data-tower-popover="body"]')!
    for (const name of TowerPopover.observedAttributes) this.#copy(name)
    relay(inner, this, ['openchange'])
    for (const part of this.#early) inner.register(part)
    this.#early.clear()
    if (this.#open) void this.#openBeside(this.#firstButton())
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
   * A `<tower-popover-button>` naming it registers its button here, as an SDK trigger does with the popover that owns
   * it: the SDK root inside takes it.
   */
  register(part: Part) {
    if (part.el.getAttribute('data-owned') !== OWNED) {
      throw new Error(`<tower-popover-button for="${this.id}">: its button is redrawn by its page and written on by the popover, so mark it data-owned="${OWNED}"`)
    }
    if (this.#inner) this.#inner.register(part)
    else this.#early.add(part)
  }

  unregister(part: Part) {
    if (this.#early.delete(part)) return
    this.#inner?.unregister(part)
  }

  /** The first of its buttons that is drawn, in this page. */
  #firstButton(): Element | undefined {
    const root = this.getRootNode() as Document | ShadowRoot
    for (const host of root.querySelectorAll(`tower-popover-button[for="${CSS.escape(this.id)}"]`)) {
      const button = wrappedButton(host as HTMLElement)
      if (button?.getClientRects().length) return button
    }
    return undefined
  }

  #openBeside(anchor: Element | undefined) {
    return this.#inner!.api.open(anchor ? { anchor } : {})
  }

  openFrom(element: Element) {
    if (!this.#inner) throw new Error(`<tower-popover id="${this.id}"> opens only once it is in the page`)
    return this.#openBeside(element)
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
    if (open) void this.#openBeside(this.#firstButton())
    else this.#inner.open = false
  }
}

customElements.define('tower-popover', TowerPopover)

/** The SDK's popover is the root its trigger looks for by `for`; `<tower-popover>`, holding one, is an owner too. */
createParts(popover, {
  root: 'ui-popover',
  trigger: { tag: 'tower-popover-button', target: wrappedButton, display: 'contents', owners: ['tower-popover'] },
})
