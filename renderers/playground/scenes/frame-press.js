/**
 * A press in a frame dismisses (`closePopoversOnFramePress`): a native popover beside a frame closes when the frame
 * takes focus, which the window's own light dismiss never sees.
 */

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'frame-press',
  title: 'A press in a frame dismisses',
  about: 'A native popover beside a frame: a press in the frame closes it, as a press anywhere else in the window does.',
  size: [420, 260],
  css: `.row { display: flex; gap: var(--sp-l); align-items: start; }
  iframe { width: 180px; height: 120px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
  [popover] { margin: 0; inset: auto; position: fixed; left: var(--sp-l); top: 64px; padding: var(--sp-m); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--panel); color: var(--ink); box-shadow: var(--shadow-pop); }`,
  html: () => `<div class="row"><button type="button" popovertarget="pop">Open the popover</button>
<iframe title="A frame" srcdoc="<body style='font: 13px system-ui; color: gray'>Press here</body>"></iframe></div>
<div id="pop" popover>A native popover</div>`,
  async wire(doc, win) {
    const { closePopoversOnFramePress } = await import('/lib/chrome.js')
    closePopoversOnFramePress(win)
    const pop = /** @type {HTMLElement} */ (doc.getElementById('pop'))
    const frame = /** @type {HTMLIFrameElement} */ (doc.querySelector('iframe'))
    return {
      open: () => (pop.showPopover(), true),
      /** Focuses the frame as a press in it does. */
      pressFrame: () => (frame.focus(), true),
      state: () => ({ open: pop.matches(':popover-open'), focused: doc.activeElement?.localName ?? null }),
    }
  },
}
