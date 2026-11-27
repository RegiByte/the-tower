import { fail } from '../checks.js'

/**
 * `<tower-popover>` beside a button redrawn through the morph every 100 ms once started, its body redrawn with it: opened
 * by Enter and by a click, below its button, the button's marks kept through each redraw; closed by Escape (focus back
 * on the button), a second press on its button, a press into a frame that runs no script, and a press outside. The
 * button, the frame and an empty spot sit where `POINTS` says, so a driver's click lands on each without reading the
 * frame first.
 */

/** Where the button opens it from. */
const BUTTON = { left: 24, top: 24 }

/** The frame with no script. */
const FRAME = { left: 24, top: 220, width: 360, height: 100 }

/** The points in the frame a driver clicks, in CSS pixels. @type {Record<'button' | 'frame' | 'empty', [number, number]>} */
export const POINTS = { button: [BUTTON.left + 20, BUTTON.top + 12], frame: [FRAME.left + 180, FRAME.top + 50], empty: [400, 180] }

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'popover',
  title: '<tower-popover>',
  about: 'A press on the button opens the popover below it; Escape, the button again, a press outside or into the frame closes it. The button and the body are redrawn every 100 ms.',
  size: [440, 340],
  css: `body { padding: 0; }
  #view .pops { position: absolute; left: ${BUTTON.left}px; top: ${BUTTON.top}px; }
  #view .pops button { height: 24px; }
  #view .head { position: absolute; left: ${BUTTON.left}px; top: 4px; color: var(--muted); }
  #view tower-popover-button:state(open) button { box-shadow: var(--selected); }
  #pop [data-tower-popover="body"] { width: 16rem; }
  #pop p { margin: 0 0 var(--sp-m); }
  .frame { position: absolute; left: ${FRAME.left}px; top: ${FRAME.top}px; width: ${FRAME.width}px; height: ${FRAME.height}px; border: 1px solid var(--line); border-radius: var(--radius); }`,
  html: () => `<div id="view"></div><tower-popover id="pop" label="Details" align="start" data-owned="children"></tower-popover>
<iframe class="frame" title="a frame with no script" sandbox="" srcdoc="<p style='font: 13px system-ui; color: gray'>A frame with no script: a press here closes the popover.</p>"></iframe>`,
  async wire(doc, win) {
    const { morph } = await import('/lib/morph.js')
    const { popoverButtonHtml } = await import('/lib/elements.js')
    await import('/lib-ui/popover.js')
    await Promise.all(['tower-popover', 'ui-popover'].map((t) => customElements.whenDefined(t)))
    let tick = 0
    /** @type {ReturnType<typeof setInterval> | undefined} */
    let timer
    /** @type {unknown[][]} */
    const log = []
    const errors = /** @type {string[]} */ ([])
    win.addEventListener('error', (e) => errors.push(String(e.message)))

    const root = /** @type {HTMLElement} */ (doc.getElementById('view'))
    const pop = /** @type {HTMLElement & { open: boolean, body: HTMLElement, openFrom(button: HTMLElement): Promise<unknown> }} */ (doc.getElementById('pop'))
    const view = () => `<div class="head">render ${tick}</div><div class="pops">${popoverButtonHtml('pop', `<button type="button" class="pop-open">details ${tick % 60}</button>`)}</div>`
    const body = () => `<p>Everything else, as of render ${tick}.</p><button type="button" class="inside">Act</button>`
    const render = () => (tick++, morph(root, view()), morph(pop.body, body()))
    render()
    pop.addEventListener('openchange', (e) => {
      const { value, reason } = /** @type {CustomEvent<{ value: boolean, reason: string }>} */ (e).detail
      log.push([value, reason])
    })

    const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) <= 12
    const button = () => /** @type {HTMLButtonElement} */ (doc.querySelector('.pop-open'))
    const host = () => /** @type {Element} */ (doc.querySelector('tower-popover-button'))
    const content = () => /** @type {HTMLElement} */ (pop.querySelector('[data-slot="popover-content"]'))
    const shown = () => content().getClientRects().length > 0

    return {
      start: () => ((timer = setInterval(render, 100)), true),
      stop: () => (clearInterval(timer), tick),
      /** Opens it beside its button from code, as a driver that can't press in every frame does. */
      open: () => (pop.openFrom(button()), true),
      focusButton: () => (win.focus(), button().focus(), doc.activeElement === button()),
      /** Open below its button, opened by `reason`, the button marked open through the redraws since. */
      opened: (/** @type {string} */ reason) => {
        const b = button().getBoundingClientRect()
        const r = content().getBoundingClientRect()
        const seen = {
          open: pop.open, shown: shown(), button: [Math.round(b.x), Math.round(b.bottom)], at: [Math.round(r.x), Math.round(r.y)],
          expanded: button().getAttribute('aria-expanded'), haspopup: button().getAttribute('aria-haspopup'), controls: button().getAttribute('aria-controls'),
          state: host().matches(':state(open)'), last: log.at(-1), body: pop.body.textContent?.match(/render (\d+)/)?.[1],
        }
        if (!seen.open || !seen.shown || !near(r.x, b.x) || r.y < b.bottom || r.y > b.bottom + 16) fail('the popover is not open below its button', seen)
        if (seen.expanded !== 'true' || seen.haspopup !== 'dialog' || seen.controls !== content().id || !seen.state) fail('the button lost its marks through a redraw', seen)
        if (seen.last?.[0] !== true || seen.last?.[1] !== reason) fail(`the popover should have opened by ${reason}`, seen)
        return seen
      },
      /** Closed by one of `reasons`, the button marked closed, focus back on it when `focusBack`. */
      closed: (/** @type {string[]} */ reasons, /** @type {boolean} */ focusBack) => {
        const seen = { open: pop.open, shown: shown(), expanded: button().getAttribute('aria-expanded'), state: host().matches(':state(open)'), last: log.at(-1), focused: doc.activeElement === button(), active: doc.activeElement?.localName }
        if (seen.open || seen.shown || seen.expanded !== 'false' || seen.state) fail('the popover should be closed, its button marked so', seen)
        if (seen.last?.[0] !== false || !reasons.includes(/** @type {string} */ (seen.last?.[1]))) fail(`the popover should have closed by ${reasons}`, seen)
        if (focusBack && !seen.focused) fail('focus should be back on the button of the popover', seen)
        return seen
      },
      ownAttributes: () => {
        /** @type {Record<string, string[]>} */
        const written = { 'tower-popover': ['id', 'label', 'align', 'data-owned'], 'tower-popover-button': ['for'] }
        const extra = Object.entries(written).flatMap(([tag, names]) => [...doc.querySelectorAll(tag)].flatMap((el) => [...el.attributes].map((a) => a.name).filter((n) => !names.includes(n)).map((n) => `${tag} ${n}`)))
        if (extra.length) fail('an element wrote an attribute on itself', extra)
        return tick
      },
      errors: () => errors,
    }
  },
}
