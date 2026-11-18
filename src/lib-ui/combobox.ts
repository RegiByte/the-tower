/**
 * The tower's combobox, served as `/lib-ui/combobox.js`. Importing it defines `<tower-combobox>`: a text box that
 * filters a list of options to choose one, which a form submits by its `name`. A render writes all it takes as
 * attributes, the options as JSON among them, and keeps the value its `valuechange` reports, writing it back as `value`.
 * Typing, the caret and the open list are the element's, so a page marks it `data-owned="children"`.
 */
import type { ListData } from '@ui-sdk/web/combobox'
import { relay, type ElementContract } from './sdk.ts'

/** What the element takes and fires. */
export const elements = {
  'tower-combobox': {
    attributes: {
      options: "The options, as JSON of the SDK's `ListData`: items (`{value, label, keywords?, disabled?}`), groups (`{type: 'group', label, items}`) and separators. They may change while the list is open; the selection and the highlight stay on their items.",
      value: 'The value of the option chosen; absent, none is. Written back from `valuechange`, it is applied with no event.',
      name: 'The name its value submits under in a form.',
      label: 'The visible label that names it.',
      placeholder: 'The text the empty box shows.',
      empty: 'What the list says when no option matches.',
      disabled: 'It can be neither focused nor changed, and submits nothing.',
      required: 'A form will not submit until an option is chosen.',
    },
    properties: {
      value: 'The value of the option chosen, or null.',
      open: 'Whether the list is open.',
      api: "The SDK's combobox controller.",
    },
    events: {
      valuechange: '`detail.value`: the value chosen, null when the text was cleared; `detail.reason` why. `preventDefault()` refuses it.',
      openchange: '`detail.value`: whether the list opens or closes, `detail.reason` why. `preventDefault()` keeps it as it is.',
    },
    states: {},
  },
} satisfies Record<string, ElementContract>

/** The parts the combobox is built of: a label, the text box, and the list in its popup. */
const PARTS =
  '<ui-combobox-label></ui-combobox-label><ui-combobox-input><input></ui-combobox-input>' +
  '<ui-combobox-content hidden><ui-combobox-empty></ui-combobox-empty><ui-combobox-list></ui-combobox-list></ui-combobox-content>'

class TowerCombobox extends HTMLElement {
  static observedAttributes = Object.keys(elements['tower-combobox'].attributes)
  #inner?: HTMLElementTagNameMap['ui-combobox']

  connectedCallback() {
    if (this.#inner) return
    const inner = document.createElement('ui-combobox')
    inner.innerHTML = PARTS
    this.append(inner)
    this.#inner = inner
    for (const name of TowerCombobox.observedAttributes) this.#sync(inner, name)
    relay(inner, this, Object.keys(elements['tower-combobox'].events))
  }

  attributeChangedCallback(name: string, was: string | null, value: string | null) {
    if (this.#inner && was !== value) this.#sync(this.#inner, name)
  }

  #sync(inner: HTMLElementTagNameMap['ui-combobox'], name: string) {
    const value = this.getAttribute(name)
    if (name === 'options') inner.items = value === null ? [] : (JSON.parse(value) as ListData<string>)
    else if (name === 'value') inner.value = value
    else if (name === 'label') inner.querySelector('ui-combobox-label')!.textContent = value ?? ''
    else if (name === 'empty') inner.querySelector('ui-combobox-empty')!.textContent = value ?? ''
    else if (name === 'placeholder') inner.querySelector('input')!.placeholder = value ?? ''
    else if (value === null) inner.removeAttribute(name)
    else inner.setAttribute(name, value)
  }

  get value() {
    return (this.#inner?.value as string | null | undefined) ?? null
  }
  get open() {
    return !!this.#inner?.open
  }
  get api() {
    return this.#inner?.api
  }
}

customElements.define('tower-combobox', TowerCombobox)
