import { esc } from './cards.ts'
import { ICON } from './icons.ts'
import { keysHint, keyshortcuts, type Keys } from './keymap.ts'
import { PANE_FIT } from './design.ts'

/**
 * What the core's views in a main pane draw alike: a head naming what is open with its actions and the way back to the
 * skyline, a body under it, and their look, from the design's tokens.
 */

export { PANE_FIT }

/**
 * `css` in the cascade layer every view's style shares, over the renderer's own sheet and under themes: what a view
 * writes in its `<style>` when it doesn't use `viewCss`.
 */
export const viewLayer = (css: string) => `@layer tower.views {
${css}
}`

/**
 * The CSS of shared components a view or a renderer draws (`panelsCss`, `itemsCss`, `markdownCss`), in the design's
 * cascade layer with the rest of them: under the renderer's own sheet, which may restyle them, and under the view's own
 * rules. A renderer's element defaults (`button`, `a`) go here too, so the shared components' classes outweigh them.
 */
export const componentsLayer = (css: string) => `@layer tower.design {
${css}
}`

/**
 * A renderer's own CSS in its cascade layer: over the design and the tower's elements, under views' styles and themes,
 * as the tower page's own sheet is.
 */
export const rendererLayer = (css: string) => `@layer tower.page {
${css}
}`

/**
 * The look of a main pane's view: the view's element a column, its head and body. `rules`, the view's own, nested
 * under `:where([data-view="<id>"])` (`&` the view's element) so they reach nothing outside it, in the views' layer
 * (`viewLayer`).
 */
export const viewCss = (id: string, rules: string) => viewLayer(`:where([data-view="${id}"]) {
  ${PANE_FIT}
  gap: min(var(--sp-m), var(--fit-pad));
  & .shelf-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-s) var(--sp-l); padding: var(--sp-m) var(--sp-xl); background: var(--panel);
    border: 1px solid var(--line); border-width: var(--fit-hair) var(--fit-hair) 1px; border-radius: var(--fit-outer) var(--fit-outer) var(--fit-inner) var(--fit-inner); box-shadow: var(--shadow-head); white-space: nowrap; }
  & .shelf-head .label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font: var(--display-weight) var(--fs-xl)/1 var(--display); text-transform: var(--heading-case); letter-spacing: var(--heading-tracking);
    color: color-mix(in oklab, var(--p, var(--heading)) var(--p-text-mix), var(--heading)); }
  & .shelf-head .dim { color: var(--faint); font-size: var(--fs-s); overflow: hidden; text-overflow: ellipsis; }
  & .shelf-head .tag { flex: none; padding: var(--sp-2xs) var(--sp-m); border: none; border-radius: var(--radius-control); background: var(--panel-2); color: var(--ink); font: var(--fs-s)/1.3 var(--mono); cursor: copy; }
  & .shelf-head .actions { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: var(--sp-s) var(--sp-l); font-size: var(--fs-m); }
  & .shelf-body { flex: 1; min-height: 0; display: flex; border-radius: var(--fit-inner); overflow: hidden; border: var(--fit-hair) solid var(--line); background: var(--panel); }
  & .shelf-body iframe { flex: 1; min-width: 0; border: 0; }
  & .shelf-body iframe.page { background: #fff; }
  & .shelf-empty { margin: auto; text-align: center; color: var(--muted); }
  ${rules}
}`)

/** The close of a view in the main pane, back to the skyline, with the chords of the keymap's `home`: `data-home`. */
export const closeHtml = (keys: Keys) => `<button class="icon-btn" data-home aria-label="back to the skyline" ${keyedTip(keys, 'back to the skyline', 'home')}>${ICON.close}</button>`

const painted = new WeakMap<Element, string>()

/** Writes `html` into `el` only when it changed, so a focused or hovered control in it survives a board. */
export const paintOnce = (el: Element, html: string) => {
  if (painted.get(el) === html) return
  painted.set(el, html)
  el.innerHTML = html
}

/** A floor's colour as `--p`, for an element's styles to use. */
export const paintOf = (color: string | undefined) => (color ? `--p:${esc(color)}` : '')

/** A control's tip saying what it does with the chords of the keymap's command `id`, and those chords as its `aria-keyshortcuts`. */
export const keyedTip = (keys: Keys, what: string, id: string) => {
  const hint = keysHint(keys, id)
  return hint ? `data-tip="${esc(`${what} (${hint})`)}" aria-keyshortcuts="${keyshortcuts(keys, id)}"` : `data-tip="${esc(what)}"`
}
