import { esc } from '../shared/cards.ts'
import { ICON } from '../shared/icons.ts'
import { keysHint, keyshortcuts, type Keys } from '../shared/keymap.ts'

/**
 * What the core's views in a main pane draw alike: a head naming what is open with its actions and the way back to the
 * skyline, a body under it, and their look, from the design's tokens. Bundled into each view's module.
 */

/**
 * The look of a main pane's view: the view's element a column, its head and body. `rules`, the view's own, nested
 * under `:where([data-view="<id>"])` (`&` the view's element) so they reach nothing outside it.
 */
export const viewCss = (id: string, rules: string) => `:where([data-view="${id}"]) {
  gap: var(--sp-m);
  & .shelf-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-s) var(--sp-l); padding: var(--sp-m) var(--sp-xl); background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); box-shadow: var(--shadow); white-space: nowrap; }
  & .shelf-head .label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font: 800 var(--fs-xl)/1 var(--display); text-transform: uppercase; letter-spacing: .06em;
    color: color-mix(in oklab, var(--p, var(--ink)) var(--p-text-mix), var(--ink)); }
  & .shelf-head .dim { color: var(--faint); font-size: var(--fs-s); overflow: hidden; text-overflow: ellipsis; }
  & .shelf-head .tag { flex: none; padding: var(--sp-2xs) var(--sp-m); border: none; border-radius: var(--radius); background: var(--panel-2); color: var(--ink); font: var(--fs-s)/1.3 var(--mono); cursor: copy; }
  & .shelf-head .actions { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: var(--sp-s) var(--sp-l); font-size: var(--fs-m); }
  & .shelf-body { flex: 1; min-height: 0; display: flex; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--line); background: var(--panel); }
  & .shelf-body iframe { flex: 1; min-width: 0; border: 0; }
  & .shelf-body iframe.page { background: #fff; }
  & .shelf-empty { margin: auto; text-align: center; color: var(--muted); }
  ${rules}
}`

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
