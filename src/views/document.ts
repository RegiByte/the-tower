import { documentHtml } from '../shared/markdown.ts'
import { framedText, itemView } from './item.ts'

/** `tower/document`, a markdown item's view: the document drawn in a frame where nothing runs, raw HTML kept and images read beside it. */
export const mount = itemView({ id: 'tower/document', rules: '', draw: framedText(documentHtml), restyled: true })
