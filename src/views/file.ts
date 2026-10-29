import { itemView, unshownHtml } from './item.ts'

/** `tower/file`, the fallback for an item of a type no view draws: left to Finder and the editor. */
export const mount = itemView({ id: 'tower/file', rules: '', draw: (el, { c, item }) => void (el.innerHTML = unshownHtml(c, item)), restyled: false })
