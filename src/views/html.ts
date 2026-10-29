import { esc } from '../shared/cards.ts'
import { itemView, versioned } from './item.ts'

/** `tower/html`, an html item's view: the page framed where it runs at an origin of its own, with no API. */
export const mount = itemView({
  id: 'tower/html',
  rules: '',
  draw: (el, at) =>
    void (el.innerHTML = `<iframe class="page" title="${esc(at.item.tag)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write" src="${versioned(at)}"></iframe>`),
  restyled: false,
})
