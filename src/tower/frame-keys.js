/**
 * frame-keys.js: a framed page's keys, sent to the tower framing it, so the tower's global keys (⌘K, Escape, the pane
 * chords) work while focus is in the page. The tower appends it to every html file it serves sandboxed, and `/tower.js`
 * runs it too: a window sends its keys once, whichever installs first. It calls no verb and holds no token; the tower
 * hears a key only from the frame holding focus, and runs only its global commands (src/shared/keymap.ts).
 *
 * The page goes first: a key one of its handlers took (`preventDefault`) stays in the page. So does typing, a key
 * without Alt, Ctrl or Meta in a field, and a held key's repeats.
 */
;(() => {
  const SENDING = Symbol.for('tower.frame-keys')
  if (window.parent === window || SENDING in window) return
  Object.defineProperty(window, SENDING, { value: true })

  /** @typedef {import('../shared/shelf-page.ts').FromPage} FromPage */
  /** @typedef {Extract<FromPage, { t: 'key' }>['mods'][number]} Mod */

  /** @param {EventTarget | undefined} target */
  const editable = (target) => {
    const el = /** @type {HTMLElement | undefined} */ (target)
    return Boolean(el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? ''))
  }

  addEventListener(
    'keydown',
    (e) => {
      if (e.repeat) return
      const typed = editable(e.composedPath()[0])
      if (typed && !e.altKey && !e.ctrlKey && !e.metaKey) return
      /** @type {Mod[]} */
      const mods = []
      if (e.altKey) mods.push('Alt')
      if (e.ctrlKey) mods.push('Ctrl')
      if (e.metaKey) mods.push('Meta')
      if (e.shiftKey) mods.push('Shift')
      /** @type {FromPage} */
      const msg = { t: 'key', key: e.key, code: e.code, mods, editable: typed }
      setTimeout(() => e.defaultPrevented || window.parent.postMessage(msg, '*'))
    },
    true,
  )
})()
