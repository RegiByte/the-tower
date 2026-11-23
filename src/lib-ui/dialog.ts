/**
 * The tower's dialog, served as `/lib-ui/dialog.js`. Importing it defines `<tower-dialog>`: a modal over the page, for
 * reading or acting in while the page goes on behind it. Its backdrop, its focus (into it as it opens, kept inside
 * while it is open, back where it was once it closes), Escape and the page made inert are the SDK's; a title names it
 * and a close button closes it.
 *
 * A page writes the tag and its attributes only, marks it `data-owned="children"`, since it builds its parts inside
 * itself, and puts what it shows in its `body`.
 */
import type { UiDialogElement } from '@ui-sdk/web'
import { relay, type ElementContract } from './sdk.ts'

/** What the element takes, fires and shows. */
export const elements = {
  'tower-dialog': {
    attributes: {
      label: 'Its title, drawn at its top, which names it to a screen reader.',
    },
    properties: {
      open: 'Whether it is open. Set it to open or close it: opened, it takes focus itself, Tab going on to its body; closed, focus goes back to where it was.',
      body: 'The element it shows: put its content here. It fills the dialog under the title and scrolls inside it when its content is taller.',
    },
    events: {
      openchange: '`detail.value`: whether it opens or closes, `detail.reason` why (`escape-key`, `outside-press`, `close-press`). `preventDefault()` keeps it as it is. Setting `open` fires none.',
    },
    states: {},
  },
} satisfies Record<string, ElementContract>

/** The close button's mark: an ✕ drawn in the button's colour. */
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'

/** Its parts. It opens focused itself, so reading starts at the top and Tab goes on to its body, the close button last. */
const PARTS = `<ui-dialog modal="true"><ui-dialog-backdrop hidden></ui-dialog-backdrop><ui-dialog-content initial-focus="content" hidden>
  <ui-dialog-title></ui-dialog-title><div data-tower-dialog="body"></div>
  <ui-dialog-close data-tower-dialog="close"><button type="button" aria-label="Close">${CLOSE_ICON}</button></ui-dialog-close>
</ui-dialog-content></ui-dialog>`

class TowerDialog extends HTMLElement {
  static observedAttributes = ['label']
  #inner?: UiDialogElement
  #body?: HTMLElement
  #open = false

  connectedCallback() {
    if (this.#inner) return
    this.innerHTML = PARTS
    const inner = this.querySelector<UiDialogElement>('ui-dialog')!
    this.#inner = inner
    this.#body = this.querySelector<HTMLElement>('[data-tower-dialog="body"]')!
    this.#title()
    relay(inner, this, ['openchange'])
    if (this.#open) inner.open = true
  }

  attributeChangedCallback() {
    this.#title()
  }

  #title() {
    const title = this.querySelector('ui-dialog-title')
    if (title) title.textContent = this.getAttribute('label') ?? ''
  }

  get body(): HTMLElement {
    if (!this.#body) throw new Error('<tower-dialog> has a body only once it is in the page')
    return this.#body
  }

  get open() {
    return this.#inner ? this.#inner.open : this.#open
  }
  set open(open: boolean) {
    this.#open = open
    if (this.#inner) this.#inner.open = open
  }
}

customElements.define('tower-dialog', TowerDialog)
