import { documentHtml } from '../shared/markdown.ts'
import { framedText, typeView } from './item.ts'

/** `tower/document`, the markdown view, of a kept item or a showing: the document drawn in a frame where nothing runs, raw HTML kept and images read beside it. */
export const mount = typeView({ id: 'tower/document', rules: '', draw: framedText(documentHtml), restyled: true })
