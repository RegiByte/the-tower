import { fail } from '../checks.js'

/**
 * `<tower-combobox>` redrawn through the morph every 100 ms once started, as a view redraws it: one choosing a fruit,
 * one named by a label drawn apart (`labelledby`), one taking text typed (`custom`). Its steps check what typing,
 * choosing and the keys left behind.
 */

const FRUITS = ['Apple', 'Apricot', 'Banana', 'Cherry', 'Peach', 'Pear', 'Plum'].map((label) => ({ value: label.toLowerCase(), label }))

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'combobox',
  title: '<tower-combobox>',
  about: 'Typing narrows the options and survives the morph; Enter and ⌘↵ are kept from the page while it is open and passed on while closed; labelledby and custom.',
  size: [420, 460],
  css: `#view .head { height: 20px; color: var(--muted); }
  #view tower-combobox { display: block; margin-bottom: var(--sp-l); }`,
  html: () => '<div id="view"></div>',
  async wire(doc, win) {
    const { comboboxHtml } = await import('/lib/elements.js')
    const { morph } = await import('/lib/morph.js')
    await import('/lib-ui/combobox.js')
    await customElements.whenDefined('tower-combobox')
    /** @type {string | null} */
    let fruit = null
    /** @type {string | null} */
    let model = null
    let tick = 0
    /** @type {ReturnType<typeof setInterval> | undefined} */
    let timer
    /** @type {unknown[][]} */
    const log = []
    const errors = /** @type {string[]} */ ([])
    win.addEventListener('error', (e) => errors.push(String(e.message)))

    const view = () => `<div class="head">render ${tick}</div>
${comboboxHtml({ place: 'check', name: 'fruit', label: 'Fruit', placeholder: 'Search fruits', empty: 'No fruit', value: fruit ?? undefined, options: FRUITS })}
<span id="check/label:size">Size <small>optional</small></span>
${comboboxHtml({ place: 'check', name: 'size', labelledby: 'check/label:size', options: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }] })}
${comboboxHtml({ place: 'check', name: 'model', label: 'Model', custom: true, value: model ?? undefined, options: [{ value: 'claude-a', label: 'claude-a' }, { value: 'claude-b', label: 'claude-b' }] })}`

    const root = /** @type {HTMLElement} */ (doc.getElementById('view'))
    const render = () => (tick++, morph(root, view()))
    render()

    root.addEventListener('keydown', (e) => e.key === 'Enter' && log.push(['enter-out', e.metaKey]))
    root.addEventListener('valuechange', (e) => {
      const { detail } = /** @type {CustomEvent<{ value: string, reason: string }>} */ (e)
      if (/** @type {HTMLElement} */ (e.target).id === 'check:model') return void (model = detail.value)
      log.push(['value', detail.value, detail.reason])
      fruit = detail.value
    })

    const combo = /** @type {HTMLElement & { value: string, open: boolean }} */ (doc.getElementById('check:fruit'))
    const typed = () => /** @type {HTMLElement & { value: string, open: boolean }} */ (doc.getElementById('check:model'))
    const inputOf = (/** @type {Element} */ el) => /** @type {HTMLInputElement} */ (el.querySelector('input'))
    const shown = (/** @type {Element} */ el) => el.getClientRects().length > 0

    return {
      start: () => ((timer = setInterval(render, 100)), true),
      stop: () => (clearInterval(timer), tick),
      focus: () => (win.focus(), inputOf(combo).focus(), doc.activeElement?.localName),
      selectAll: () => (inputOf(combo).select(), true),
      /** What was typed is still there, caret and focus kept, the options narrowed to `options`. */
      typing: (/** @type {string} */ text, /** @type {string[]} */ options) => {
        const input = inputOf(combo)
        const seen = { text: input.value, caret: input.selectionStart, focused: doc.activeElement === input, open: combo.open,
          options: [...combo.querySelectorAll('[role="option"]')].filter(shown).map((o) => o.textContent?.trim()) }
        if (seen.text !== text || seen.caret !== text.length || !seen.focused || !seen.open || JSON.stringify(seen.options) !== JSON.stringify(options)) fail(`the combobox lost what was typed (want "${text}", ${options})`, seen)
        return seen
      },
      picked: (/** @type {string} */ value) => {
        const seen = { value: combo.value, attribute: combo.getAttribute('value'), open: combo.open, text: inputOf(combo).value, log: log.filter((l) => l[0] === 'value') }
        if (seen.value !== value || seen.attribute !== value || seen.open) fail(`the combobox didn't keep "${value}"`, seen)
        if (seen.log.some((l) => l[2] !== 'item-press')) fail('the value written back fired an event', seen)
        return seen
      },
      keys: (/** @type {Record<string, unknown>} */ want) => {
        const seen = /** @type {Record<string, unknown>} */ ({ value: combo.value, text: inputOf(combo).value, open: combo.open, out: log.filter((l) => l[0] === 'enter-out').length })
        if (Object.entries(want).some(([k, v]) => seen[k] !== v)) fail(`the combobox's keys: want ${JSON.stringify(want)}`, seen)
        return seen
      },
      focusTyped: () => {
        const input = inputOf(typed())
        win.focus()
        input.focus()
        input.select()
        return doc.activeElement === input
      },
      typed: (/** @type {Record<string, unknown>} */ want) => {
        const el = typed()
        const seen = /** @type {Record<string, unknown>} */ ({ value: el.value, attribute: el.getAttribute('value'), text: inputOf(el).value, open: el.open })
        if (Object.entries(want).some(([k, v]) => seen[k] !== v) || seen.attribute !== seen.value) fail(`the custom combobox: want ${JSON.stringify(want)}`, seen)
        return seen
      },
      labelled: () => {
        const named = /** @type {HTMLElement} */ (doc.getElementById('check:size'))
        const seen = { labelledby: inputOf(named).getAttribute('aria-labelledby'), parts: named.querySelectorAll('ui-combobox-label').length }
        if (seen.labelledby !== 'check/label:size' || seen.parts) fail('a combobox with labelledby should draw no label and name its input by it', seen)
        return seen
      },
      blur: () => (/** @type {HTMLElement | null} */ (doc.activeElement)?.blur(), true),
      ownAttributes: () => {
        const names = ['id', 'name', 'label', 'labelledby', 'placeholder', 'empty', 'value', 'options', 'custom', 'data-owned']
        const extra = [...doc.querySelectorAll('tower-combobox')].flatMap((el) => [...el.attributes].map((a) => a.name).filter((n) => !names.includes(n)))
        if (extra.length) fail('the combobox wrote an attribute on itself', extra)
        return tick
      },
      errors: () => errors,
    }
  },
}
