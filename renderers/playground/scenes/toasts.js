/**
 * Toasts (`toaster`): what the tower says in passing, stacked at the foot of the window, one told again counted, one
 * with an action held longer.
 */

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'toasts',
  title: 'Toasts',
  about: 'Toasts stack at the foot of the window: one told twice is counted, one with an action is held longer; each closes by itself.',
  size: [420, 260],
  html: () => '<div id="toasts"></div>',
  async wire(doc) {
    const { toaster, toastsCss } = await import('/lib/chrome.js')
    doc.head.append(Object.assign(doc.createElement('style'), { textContent: `@layer tower.design {\n${toastsCss}\n}` }))
    const toast = toaster(/** @type {HTMLElement} */ (doc.getElementById('toasts')))
    return {
      /** Tells three toasts, the first twice. */
      tell: () => {
        toast('AHAB-47 went home')
        toast('AHAB-47 went home')
        toast('The config kept its theme: a key it reads changed meanwhile')
        toast('HOLMES-26 let go', { label: 'Undo', run: () => {} })
        return [...doc.querySelectorAll('.toast')].map((t) => t.textContent?.trim())
      },
    }
  },
}
