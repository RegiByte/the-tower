import { typeView, unshownHtml } from './item.ts'

/** `tower/file`, the fallback for a file of a type no view draws: left to Finder and the editor. */
export const mount = typeView({ id: 'tower/file', rules: '', draw: (el, at) => void (el.innerHTML = unshownHtml(at)), restyled: false })
