import { esc } from '../shared/cards.ts'
import { itemView, versioned } from './item.ts'

/** `tower/video`, a video item's view: the video, whole, centred, with the browser's controls. */
export const mount = itemView({
  id: 'tower/video',
  rules: `& .item-video { flex: 1; min-width: 0; display: grid; place-items: center; overflow: auto; padding: var(--sp-xl); }
  & .item-video video { max-width: 100%; max-height: 100%; }`,
  draw: (el, at) => void (el.innerHTML = `<div class="item-video"><video src="${versioned(at)}" controls aria-label="${esc(at.item.tag)}"></video></div>`),
  restyled: false,
})
