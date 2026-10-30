import { esc } from '../shared/cards.ts'
import { framedText, typeView } from './item.ts'

/** `tower/text`, the text view, or any text's source: its text as written, in a frame where nothing runs. */
export const mount = typeView({ id: 'tower/text', rules: '', draw: framedText((text) => `<pre class="item-text">${esc(text)}</pre>`), restyled: true })
