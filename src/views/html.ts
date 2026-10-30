import { esc } from '../shared/cards.ts'
import { typeView, versioned } from './item.ts'

/** `tower/html`, the html view: the page framed where it runs at an origin of its own, with no API. */
export const mount = typeView({
  id: 'tower/html',
  rules: '',
  draw: (el, at) =>
    void (el.innerHTML = `<iframe class="page" title="${esc(at.title)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write" src="${versioned(at)}"></iframe>`),
  restyled: false,
})
