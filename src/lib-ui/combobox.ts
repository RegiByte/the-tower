/**
 * The tower's combobox, served as `/lib-ui/combobox.js`. Importing it defines `<tower-combobox>`: a text box that
 * filters a list of options to choose one, which a form submits by its `name`. A render writes all it takes as
 * attributes, the options as JSON among them, and keeps the value its `valuechange` reports, writing it back as `value`.
 * Typing, the caret and the open list are the element's, so a page marks it `data-owned="children"`.
 *
 * It keeps a form's keys as a native select does. While the list is open, typing filters it and highlights the first
 * match; Enter, with any modifier (⌘↵ too), chooses the highlighted option and closes the list, or does nothing when
 * none is highlighted, and goes no further: the form never sees it, so a submit key doesn't submit. Closed, the keys
 * pass on as from any field. Leaving without choosing (Escape, Tab, a press outside) shows the chosen option's label
 * again, or the empty box: text typed but not chosen is never a value. With `custom`, typing highlights nothing, as a
 * datalist's box: Enter chooses the text typed, or the option an arrow key moved to, or the option whose label is
 * exactly the text; leaving still restores what was chosen.
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
      labelledby: 'The id of an element elsewhere on the page that names it, for a label that holds more than words: set, it draws no label of its own.',
      placeholder: 'The text the empty box shows.',
      empty: 'What the list says when no option matches.',
      disabled: 'It can be neither focused nor changed, and submits nothing.',
      required: 'A form will not submit until an option is chosen.',
      custom: 'Text typed is chosen too, by Enter (⌘↵ too): typing highlights no option, so Enter takes the text, the option an arrow key moved to, or the one labelled exactly the text; leaving the box without choosing still shows what was chosen.',
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

/** The parts the combobox is built of: the text box and the list in its popup, after its label unless another element names it. */
const PARTS =
  '<ui-combobox-input><input></ui-combobox-input>' +
  '<ui-combobox-content hidden><ui-combobox-empty></ui-combobox-empty><ui-combobox-list></ui-combobox-list></ui-combobox-content>'

/** Every option's value in `data`, its groups' included. */
const valuesOf = (data: readonly (ListData<string>[number] | string)[]): string[] =>
  data.flatMap((item) => (typeof item === 'string' ? [item] : 'items' in item ? valuesOf(item.items) : 'value' in item ? [item.value] : []))

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
    inner.addEventListener('valuechange', (change) => this.#typed(change as CustomEvent<{ value: unknown; event?: Event }>), { capture: true })
    relay(inner, this, Object.keys(elements['tower-combobox'].events))
    this.addEventListener('keydown', () => (this.#openAtKey = this.open), { capture: true })
    this.addEventListener('keydown', (key) => key.key === 'Enter' && this.#openAtKey && key.stopPropagation())
  }

  /**
   * A `custom` value the SDK takes as the list closes, refused: only an Enter chooses typed text, so leaving restores
   * the value chosen.
   */
  #typed(change: CustomEvent<{ value: unknown; event?: Event }>) {
    const { value, event } = change.detail
    const enter = event instanceof KeyboardEvent && event.key === 'Enter'
    if (typeof value === 'string' && !enter && !this.#isOption(value)) change.preventDefault()
  }

  #isOption(value: string) {
    return valuesOf((this.#inner?.items ?? []) as ListData<string>).includes(value)
  }

  /** Whether the list was open as the key now going through reached the element, before the SDK's own handling closed it. */
  #openAtKey = false

  attributeChangedCallback(name: string, was: string | null, value: string | null) {
    if (this.#inner && was !== value) this.#sync(this.#inner, name)
  }

  #sync(inner: HTMLElementTagNameMap['ui-combobox'], name: string) {
    const value = this.getAttribute(name)
    if (name === 'options') inner.items = value === null ? [] : (JSON.parse(value) as ListData<string>)
    else if (name === 'value') inner.value = value
    else if (name === 'label' || name === 'labelledby') this.#label(inner)
    else if (name === 'empty') inner.querySelector('ui-combobox-empty')!.textContent = value ?? ''
    else if (name === 'placeholder') inner.querySelector<HTMLInputElement>('input')!.placeholder = value ?? ''
    else if (name === 'custom') {
      inner.toggleAttribute('allow-custom-value', value !== null)
      inner.toggleAttribute('auto-highlight', value === null)
    }
    else if (value === null) inner.removeAttribute(name)
    else inner.setAttribute(name, value)
  }

  /** Its own label part holding `label`, or none and the input named by the element `labelledby` names. */
  #label(inner: HTMLElementTagNameMap['ui-combobox']) {
    const by = this.getAttribute('labelledby')
    const input = inner.querySelector<HTMLInputElement>('input')!
    const own = inner.querySelector('ui-combobox-label')
    if (by !== null) {
      own?.remove()
      input.setAttribute('aria-labelledby', by)
      return
    }
    if (input.getAttribute('aria-labelledby') !== null && !own) input.removeAttribute('aria-labelledby')
    const label = own ?? inner.insertBefore(document.createElement('ui-combobox-label'), inner.firstChild)
    label.textContent = this.getAttribute('label') ?? ''
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
