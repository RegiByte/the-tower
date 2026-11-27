/**
 * The pane fit (`.tower-fit`): the same view in a pane that lends it a pad, in one that runs it to its edges
 * (`--pane-pad: 0px`, as Aqua and Flamingo do), and unlent, as in a dialog. Its head meets the pane's top with
 * `--fit-outer` corners, its body has `--fit-inner` ones, and both have `--fit-hair` borders, which vanish when flush.
 * The last pane is a card's screen holding a link's frame, full-bleed by design: the card's screen fits around it.
 */

const view = (/** @type {string} */ label) => `<div class="tower-fit view"><div class="head">${label}</div><div class="body">A view's body</div></div>`

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'fit',
  title: 'The pane fit',
  about: 'One view lent a pad, run flush to the pane (--pane-pad: 0px), and unlent as in a dialog; then a link\'s frame, full-bleed inside a card\'s screen, which carries the fit.',
  size: [420, 640],
  css: `.panes { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-m); }
  .pane { display: flex; flex-direction: column; height: 128px; padding: var(--pane-pad) var(--pane-pad) 0; border-radius: var(--main-radius); background: var(--main-surface); box-shadow: 0 0 0 1px var(--line); }
  .pane.lent { --pane-pad: var(--main-pad); }
  .pane.flush { --pane-pad: 0px; }
  .pane.unlent { padding: var(--sp-xl) var(--sp-xl) 0; }
  .view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: min(var(--sp-m), var(--fit-pad)); }
  .view .head { padding: var(--sp-s) var(--sp-l); background: var(--panel); border: 1px solid var(--line); border-width: var(--fit-hair) var(--fit-hair) 1px; border-radius: var(--fit-outer) var(--fit-outer) var(--fit-inner) var(--fit-inner); }
  .view .body { flex: 1; padding: var(--sp-m) var(--sp-l); background: var(--panel); border: var(--fit-hair) solid var(--line); border-radius: var(--fit-inner); color: var(--muted); }
  .screen { flex: 1; min-height: 0; display: flex; overflow: hidden; border-radius: var(--fit-inner); }
  .screen iframe { flex: 1; border: 0; background: #fff; }`,
  html: () => `<div class="panes">
  <div class="pane lent">${view('Lent a pad')}</div>
  <div class="pane flush">${view('Flush')}</div>
  <div class="pane unlent">${view('Unlent')}</div>
  <div class="pane lent"><div class="tower-fit view"><div class="head">A card, its link tab</div><div class="screen"><iframe title="A link" srcdoc="<body style='margin: 0; padding: 12px; font: 13px system-ui'>A page shown full-bleed</body>"></iframe></div></div></div>
</div>`,
  wire(doc) {
    const fitOf = (/** @type {Element} */ el) => {
      const c = getComputedStyle(el)
      return Object.fromEntries(['--fit-pad', '--fit-hair', '--fit-inner', '--fit-outer'].map((k) => [k, c.getPropertyValue(k).trim()]))
    }
    return {
      /** What `.tower-fit` declared on each pane's view, computed. */
      fits: () => [...doc.querySelectorAll('.view')].map((v) => ({ view: v.querySelector('.head')?.textContent, ...fitOf(v) })),
    }
  },
}
