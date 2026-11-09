/**
 * frame-picks.js: a framed page's selection, sent to the tower framing it, so text picked in a shown html page can be
 * a passage (decision `passage-picks`). The tower appends it to every html file it serves sandboxed, after the page.
 * It calls no verb and holds no token. What it sends is the page's word, since any script in the page can send the
 * same: the tower takes it only from a frame it drew a worker's shown file in, and only while that frame holds the
 * document it loaded.
 *
 * Each change of the selection, and each scroll or resize while one stands, sends `{t: 'pick'}`: with `sig`, the
 * selection's ends, `quote` its words and `rect` where it is in the frame; without, when it is collapsed or holds only
 * white space. The page's `load` sends it once more: the tower hears picks only once the frame has loaded, and a
 * selection made while the page still loads would otherwise go unheard until it changes. `{t: 'unpick'}` from the
 * framing page clears it.
 */
;(() => {
  const SENDING = Symbol.for('tower.frame-picks')
  if (window.parent === window || SENDING in window) return
  Object.defineProperty(window, SENDING, { value: true })

  /** Each node a selection's ends are in, by a number of this page's: a signature is a string. */
  const ids = new WeakMap()
  let last = 0
  /** @param {Node} node */
  const id = (node) => ids.get(node) ?? (ids.set(node, ++last), last)

  /** Whether the last message sent named a selection. */
  let sent = false
  let queued = false

  const send = () => {
    queued = false
    const selection = getSelection()
    const words = selection && !selection.isCollapsed && selection.rangeCount ? selection.toString() : ''
    if (!selection || !words.trim()) {
      if (sent) window.parent.postMessage({ t: 'pick' }, '*')
      sent = false
      return
    }
    const range = selection.getRangeAt(0)
    const r = range.getBoundingClientRect()
    window.parent.postMessage(
      {
        t: 'pick',
        sig: `${id(/** @type {Node} */ (selection.anchorNode))}:${selection.anchorOffset}:${id(/** @type {Node} */ (selection.focusNode))}:${selection.focusOffset}`,
        quote: words.replace(/^\n+|\s+$/g, ''),
        rect: { top: r.top, bottom: r.bottom, left: r.left },
      },
      '*',
    )
    sent = true
  }
  const queue = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(send)
  }

  document.addEventListener('selectionchange', queue)
  addEventListener('load', queue)
  addEventListener('scroll', () => sent && queue(), true)
  addEventListener('resize', () => sent && queue())
  addEventListener('message', (e) => {
    if (e.source === window.parent && e.data?.t === 'unpick') getSelection()?.removeAllRanges()
  })
})()
