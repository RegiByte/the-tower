import { fail } from '../checks.js'

/**
 * `<tower-split>` redrawn through the morph every 100 ms once started, its size kept as a view keeps it: written back
 * from `sizecommit` as `size`. Two splits, one sized first and one sized last; their steps check the keys, the commits,
 * the bounds, the px held as the split narrows and widens again, and the grip's ARIA, which names the sized pane.
 */

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'split',
  title: '<tower-split>',
  about: 'Two panes and a grip, one pane sized in px that holds as the split resizes; arrow keys step 24px, Shift ten; a double-click returns to the default.',
  size: [440, 420],
  css: `#view .head { height: 20px; color: var(--muted); }
  #view .host { height: 160px; margin-bottom: var(--sp-l); }
  #view tower-split { height: 100%; border: 1px solid var(--line); }
  #view .pane { padding: var(--sp-m); overflow: hidden; }`,
  html: () => '<div id="view"></div>',
  async wire(doc, win) {
    const { morph } = await import('/lib/morph.js')
    await import('/lib-ui/split.js')
    await customElements.whenDefined('tower-split')
    /** @type {Record<string, number | null>} */
    const sizes = { files: null, log: null }
    let width = 420
    let tick = 0
    /** @type {ReturnType<typeof setInterval> | undefined} */
    let timer
    /** @type {unknown[][]} */
    const log = []
    const errors = /** @type {string[]} */ ([])
    win.addEventListener('error', (e) => errors.push(String(e.message)))

    const sized = (/** @type {string} */ name) => (sizes[name] === null ? '' : ` size="${sizes[name]}px"`)
    const view = () => `<div class="head">render ${tick}</div>
<div class="host" style="width: ${width}px"><tower-split id="check:files" data-owned="children" label="files width" tip="drag, or ← and →, to resize the files" default-size="160px" min="120px" max="calc(100% - 120px)"${sized('files')}><div class="pane">Files</div><div class="pane">Editor</div></tower-split></div>
<div class="host" style="width: ${width}px"><tower-split id="check:log" data-owned="children" orientation="vertical" sized="last" label="log height" default-size="60px" min="40px" max="calc(100% - 40px)"${sized('log')}><div class="pane">Output</div><div class="pane">Log</div></tower-split></div>`

    const root = /** @type {HTMLElement} */ (doc.getElementById('view'))
    const render = () => (tick++, morph(root, view()))
    render()

    root.addEventListener('sizecommit', (e) => {
      const target = /** @type {HTMLElement} */ (e.target)
      const { value } = /** @type {CustomEvent<{ value: number | null }>} */ (e).detail
      const name = target.id.split(':')[1]
      log.push([name, value])
      sizes[name] = value
    })

    const split = (/** @type {string} */ name) => /** @type {HTMLElement} */ (doc.getElementById(`check:${name}`))
    const grip = (/** @type {string} */ name) => /** @type {HTMLElement} */ (split(name).querySelector('[role="separator"]'))
    const pane = (/** @type {string} */ name) => /** @type {HTMLElement} */ (split(name).querySelector('[data-tower-split="sized"]'))

    return {
      start: () => ((timer = setInterval(render, 100)), true),
      stop: () => (clearInterval(timer), tick),
      focus: (/** @type {string} */ name) => (win.focus(), grip(name).focus(), doc.activeElement?.getAttribute('aria-label')),
      width: (/** @type {number} */ px) => ((width = px), true),
      /** The sized pane is `want` px, the commits so far `committed`, the last written back as `size`, and the grip says so. */
      sized: (/** @type {string} */ name, /** @type {number} */ want, /** @type {number[]} */ committed) => {
        const vertical = split(name).getAttribute('orientation') === 'vertical'
        const handle = grip(name)
        const seen = {
          size: Math.round(pane(name).getBoundingClientRect()[vertical ? 'height' : 'width']),
          attribute: split(name).getAttribute('size'),
          commits: log.filter((l) => l[0] === name).map((l) => l[1]),
          now: handle.getAttribute('aria-valuenow'),
          controls: handle.getAttribute('aria-controls') === pane(name).id,
          tip: handle.dataset.tip ?? null,
        }
        if (seen.size !== want || JSON.stringify(seen.commits) !== JSON.stringify(committed)) fail(`${name}: want ${want}px after commits ${JSON.stringify(committed)}`, seen)
        if (seen.attribute !== (committed.length ? `${committed.at(-1)}px` : null)) fail(`${name} lost the size written back`, seen)
        if (seen.now !== String(want) || !seen.controls) fail(`${name}'s grip should name its sized pane and say its px`, seen)
        return seen
      },
      ownAttributes: () => {
        const names = ['id', 'orientation', 'sized', 'label', 'tip', 'default-size', 'min', 'max', 'size', 'data-owned']
        const extra = [...doc.querySelectorAll('tower-split')].flatMap((el) => [...el.attributes].map((a) => a.name).filter((n) => !names.includes(n)))
        if (extra.length) fail('the split wrote an attribute on itself', extra)
        return tick
      },
      errors: () => errors,
    }
  },
}
