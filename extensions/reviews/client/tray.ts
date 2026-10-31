import type { Floor, FloorCollection } from '../../../src/bridge/board.ts'
import { esc, noun, plural, workerIn } from '../../../src/shared/cards.ts'
import { ICON } from '../../../src/shared/icons.ts'
import { foldTrayHtml, itemsCss, openItemOf } from '../../../src/shared/items.ts'
import { itemKey } from '../../../src/shared/subjects.ts'
import type { Mount } from '../../../src/shared/views.ts'
import { floorThreadsOf } from './panel.ts'
import { landedThreads, REVIEWS, threadId } from './reviews.ts'

/**
 * `reviews/tray`, the reviews collection in a floor's row of trays: how many threads are open and how many landed,
 * unfolding to each open thread by its checkout, opened in its worker's Reviews tab while one works in the checkout,
 * else as the thread's item; then the threads Tidy filed once their work landed, folded, newest first.
 */

const ID = 'reviews/tray'

const STYLE = `:where([data-view="${ID}"]) {
  ${itemsCss}
  .threads { padding: var(--sp-m) 0 0; }
  .threads-head { display: flex; align-items: center; padding: 0 var(--sp-2xs) 0 var(--sp-m); }
  .thread-row { display: grid; width: 100%; grid-template-columns: auto minmax(0, 1fr); column-gap: var(--sp-s); padding: var(--sp-xs) var(--sp-m); border: none; border-radius: var(--radius);
    background: none; font-size: var(--fs-s); font-weight: 400; text-align: left; color: var(--muted); cursor: pointer; white-space: nowrap; }
  .thread-row .t { overflow: hidden; text-overflow: ellipsis; }
  .thread-row .meta { grid-column: 2; overflow: hidden; text-overflow: ellipsis; color: var(--faint); font: var(--fs-xs)/1.4 var(--mono); letter-spacing: .02em; }
  .thread-row:hover { background: var(--panel-2); color: var(--ink); }
  .thread-row > .icon { align-self: center; color: var(--muted); }
  .threads-none { color: var(--faint); font-style: italic; font-size: var(--fs-s); padding: var(--sp-2xs) var(--sp-m); }
  .landed-fold { display: flex; align-items: center; gap: var(--sp-xs); min-height: var(--control); margin: var(--sp-xs) 0 0; padding: 0 var(--sp-m); border: none; background: none;
    color: var(--faint); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .04em; }
  .landed-fold:hover { color: var(--ink); }
  .landed-fold[aria-expanded='false'] .icon { rotate: -90deg; }
}`

export const mount: Mount = (host, { board: first, subject, kit, state }) => {
  let board = first
  let collection = subject.value as FloorCollection & { project: string }
  const project = collection.project
  const floor = () => board.floors.find((f) => f.id === project) as Floor
  const unfoldedKey = `unfolded.${subject.key}`
  const landedKey = `landed.${subject.key}`
  let unfolded = false
  let landedOpen = false
  let painted = ''

  const threadsHtml = () => {
    const rows = floorThreadsOf(floor()).map((t) => {
      const meta = [t.tag, plural(t.messages, 'note'), t.last && `last ${t.last.author}`, t.landed && 'landed'].filter(Boolean).join(' · ')
      return `<button class="thread-row" data-thread="${esc(t.checkout)}" data-tip="${esc(`${t.id}${t.last ? `\nn${t.last.n} by ${t.last.author}, ${t.last.at}` : ''}`)}">${ICON.thread}<span class="t">${esc(t.checkout)}</span><span class="meta">${esc(meta)}</span></button>`
    })
    const landed = landedThreads(collection.items)
    const open = openItemOf(kit.location?.(), project, REVIEWS)
    const filed = !landed.length
      ? ''
      : `<button class="landed-fold" data-landed aria-expanded="${landedOpen}" data-tip="threads Tidy filed once their work landed: read them here">${ICON.caret} ${landed.length} landed</button>
    ${landedOpen ? landed.map((t) => `<button class="kept-row ${open === t.id ? 'sel' : ''}" data-filed="${esc(t.id)}" data-tip="${esc(t.id)}"><span class="t">${esc(t.checkout)}</span><span class="meta">${esc(`${t.tag} · landed ${t.landed}`)}</span></button>`).join('') : ''}`
    return `<div class="tray-open threads"><div class="threads-head eyebrow">Review threads</div>${rows.join('') || '<div class="threads-none">none open</div>'}${filed}</div>`
  }

  const draw = () => {
    const threads = floorThreadsOf(floor()).length
    const landed = landedThreads(collection.items).length
    const html = !threads && !landed
      ? ''
      : `<style>${STYLE}</style>${foldTrayHtml(unfolded, `${ICON.thread} <b>${threads}</b> ${noun(threads, 'thread')}${landed ? `, ${landed} landed` : ''}`, 'review threads, one per checkout: notes from you, its workers and reviewers')}${unfolded ? threadsHtml() : ''}`
    if (html !== painted) host.innerHTML = painted = html
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-tray]')) {
      unfolded = !unfolded
      state.set(unfoldedKey, unfolded)
      return draw()
    }
    if (target.closest('[data-landed]')) {
      landedOpen = !landedOpen
      state.set(landedKey, landedOpen)
      return draw()
    }
    const checkout = target.closest<HTMLElement>('[data-thread]')?.dataset.thread
    if (checkout !== undefined) {
      const worker = workerIn(floor(), checkout)
      return worker ? kit.display(`card:${worker.id}`, { view: 'reviews/thread' }) : kit.display(itemKey(project, REVIEWS, threadId(checkout)))
    }
    const filed = target.closest<HTMLElement>('[data-filed]')?.dataset.filed
    if (filed !== undefined) kit.display(itemKey(project, REVIEWS, filed))
  })

  void Promise.all([state.get(unfoldedKey), state.get(landedKey)]).then(([u, l]) => {
    unfolded = u === true
    landedOpen = l === true
    draw()
  })
  draw()

  return {
    update(next, at) {
      board = next
      collection = at.value as FloorCollection & { project: string }
      draw()
    },
    close() {},
  }
}
