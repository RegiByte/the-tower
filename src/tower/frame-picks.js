/**
 * frame-picks.js: a framed page's selection, sent to the tower framing it, so text picked in a shown html page can be
 * a passage (decision `passage-picks`). The tower appends it to every html file it serves sandboxed, after the page.
 * It calls no verb. What it sends is the page's word, since any script in the page can send the same: the tower takes
 * it only from a frame it drew a worker's shown file in, with the token it gives the document that frame holds at its first load
 * (`{t: 'picks', token}`, kept from the first one heard and sent with every pick), and a new selection only while the
 * frame holds the focus. Until the token comes, nothing is sent.
 *
 * Each change of the selection, and each scroll or resize while one stands, sends `{t: 'pick'}`: with `sig`, the
 * selection's ends, `quote` its words and `rect` where it is in the frame; without, when it is collapsed or holds only
 * white space. The token's arrival sends it once more: the tower gives it once the frame has loaded, and a selection
 * made before would otherwise go unheard until it changes. `{t: 'unpick'}` from the framing page clears it.
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

  /** The token the framing page gave, which every pick carries; none until it comes. @type {string | undefined} */
  let token
  /** Whether the last message sent named a selection. */
  let sent = false
  let queued = false

  const send = () => {
    queued = false
    if (token === undefined) return
    const selection = getSelection()
    const words = selection && !selection.isCollapsed && selection.rangeCount ? selection.toString() : ''
    if (!selection || !words.trim()) {
      if (sent) window.parent.postMessage({ t: 'pick', token }, '*')
      sent = false
      return
    }
    const range = selection.getRangeAt(0)
    const r = range.getBoundingClientRect()
    window.parent.postMessage(
      {
        t: 'pick',
        token,
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
  addEventListener('scroll', () => sent && queue(), true)
  addEventListener('resize', () => sent && queue())
  addEventListener('message', (e) => {
    if (e.source !== window.parent) return
    if (e.data?.t === 'unpick') getSelection()?.removeAllRanges()
    if (e.data?.t === 'picks' && token === undefined && typeof e.data.token === 'string') ((token = e.data.token), queue())
  })
})()
