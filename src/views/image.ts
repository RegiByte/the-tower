import { esc } from '../shared/cards.ts'
import { typeView, versioned } from './item.ts'

/** `tower/image`, the image view: the image, whole, centred. */
export const mount = typeView({
  id: 'tower/image',
  rules: `& .item-image { flex: 1; min-width: 0; display: grid; place-items: center; overflow: auto; padding: var(--sp-xl); }
  & .item-image img { max-width: 100%; max-height: 100%; }`,
  draw: (el, at) => void (el.innerHTML = `<div class="item-image"><img src="${versioned(at)}" alt="${esc(at.title)}"></div>`),
  restyled: false,
})
