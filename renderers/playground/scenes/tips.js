/**
 * Tips (`watchTips`): one shared tooltip showing each `data-tip`, beside what it is for, after the pointer rests or on
 * keyboard focus.
 */

const BUTTONS = [
  ['＋', 'New worker'],
  ['⟳', 'Resume\nthe conversation it left'],
  ['✕', 'Send home: a long tip wraps at its width and keeps to the window'],
]

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'tips',
  title: 'Tips',
  about: 'One shared tip for every data-tip: shown after the pointer rests or on keyboard focus, hidden on a press, a scroll or Escape.',
  size: [420, 200],
  css: '.row { display: flex; gap: var(--sp-s); }',
  html: () => `<div class="row">${BUTTONS.map(([mark, tip]) => `<button type="button" class="icon-btn" data-tip="${tip}" aria-label="${tip.split('\n')[0]}">${mark}</button>`).join('')}</div>`,
  async wire(doc) {
    const { watchTips } = await import('/lib/chrome.js')
    watchTips(doc)
    const buttons = /** @type {HTMLButtonElement[]} */ ([...doc.querySelectorAll('[data-tip]')])
    const tip = /** @type {HTMLElement} */ (doc.getElementById('tower-tip'))
    return {
      /** Shows button `i`'s tip as a pointer resting on it does, once its tip has had time to show. */
      show: async (/** @type {number} */ i) => {
        buttons[i].dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
        for (let waited = 0; !tip.matches(':popover-open') && waited < 1500; waited += 50) await new Promise((r) => setTimeout(r, 50))
        return { shown: tip.matches(':popover-open'), text: tip.textContent }
      },
      hide: () => (doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), !tip.matches(':popover-open')),
    }
  },
}
