import { esc } from '../shared/cards.ts'
import { framedText, itemView } from './item.ts'

/** `tower/text`, a text item's view, or any text's source: its text as written, in a frame where nothing runs. */
export const mount = itemView({ id: 'tower/text', rules: '', draw: framedText((text) => `<pre class="item-text">${esc(text)}</pre>`), restyled: true })
