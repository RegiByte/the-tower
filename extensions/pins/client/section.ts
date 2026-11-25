import type { Board } from '/lib/board.js'
import { domId } from '/lib/morph.js'
import { ICON, morphPanel, type Mount, type Tab, type TabWords, viewCss } from '/lib/view.js'
import { esc, span } from '/lib/words.js'
import type { Pin } from '../pins.ts'

/**
 * `pins/section`, a section of the board: every pinned worker, newest pin first, those sent home included. A row
 * opens the worker, from the archive once it went home; its × unpins it.
 */

const ID = 'pins/section'

/** How often the rows' ages are written again. */
const AGES_MS = 30_000

const STYLE = viewCss(
  ID,
  `& .pins { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  & .pin { display: flex; align-items: center; min-width: 0; border-radius: var(--radius-control); }
  & .pin:hover, & .pin[aria-current] { background: var(--hover); }
  & .pin[aria-current] { box-shadow: inset 2px 0 0 var(--accent); }
  & .go { flex: 1; min-width: 0; display: grid; gap: var(--sp-2xs); padding: var(--sp-xs) var(--sp-s); border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; }
  & .line { display: flex; align-items: center; gap: var(--sp-s); min-width: 0; font-size: var(--fs-s); white-space: nowrap; }
  & .call { font: var(--display-weight) var(--fs-s)/1 var(--display); letter-spacing: var(--name-tracking); overflow: hidden; text-overflow: ellipsis; }
  & .floor { flex: none; color: color-mix(in oklab, var(--p, var(--ink)) var(--p-text-mix), var(--ink)); font-size: var(--fs-xs); }
  & .age { margin-left: auto; flex: none; color: var(--faint); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
  & .note { color: var(--faint); font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & .pin .icon-btn { flex: none; min-width: var(--control); }`,
)

const pinsOn = (board: Board): Pin[] => (board.x?.pins as { pins?: Pin[] } | undefined)?.pins ?? []

/** The section's tally: how many are pinned, or `undefined` when none are, which leaves the section undrawn. */
const tallyOf = (n: number): TabWords | undefined => (n ? { text: String(n), tip: `${n} pinned` } : undefined)

export const tab: Tab = (board) => tallyOf(pinsOn(board).length)

const floorHtml = (board: Board, project: string) => {
  const floor = board.floors.find((f) => f.id === project)
  return `<span class="floor"${floor?.color ? ` style="--p:${esc(floor.color)}"` : ''}>${esc(floor?.name ?? project)}</span>`
}

const UNPIN = 'Unpin'

export const mount: Mount = (host, { tower, board: first, kit }) => {
  let board = first
  let open: string | undefined
  let tally: string | undefined | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  const now = () => kit.now?.() ?? Date.now()

  host.innerHTML = `<style>${STYLE}</style><ul class="pins" role="list"></ul>`
  const list = host.querySelector<HTMLElement>('.pins')!

  const rowHtml = (p: Pin, at: number, here: string | undefined) => {
    const current = here === `card:${p.session}` ? ' aria-current="true"' : ''
    return `<li class="pin" id="${esc(domId('pins', p.session))}"${current}><button class="go" data-card="${esc(p.session)}"${p.note ? ` data-tip="${esc(p.note)}"` : ''}>
      <span class="line"><span class="call">${esc(p.callsign)}</span>${floorHtml(board, p.project)}<span class="age" data-age-since="${p.at}">${esc(span(at - p.at))}</span></span>
      ${p.note ? `<span class="note">${esc(p.note)}</span>` : ''}</button><button class="icon-btn" data-unpin="${esc(p.session)}" aria-label="${UNPIN} ${esc(p.callsign)}" data-tip="${UNPIN}">${ICON.close}</button></li>`
  }

  const draw = () => {
    const pins = pinsOn(board)
    const here = kit.location?.()?.subject
    const at = now()
    morphPanel(list, pins.map((p) => rowHtml(p, at, here)).join(''))
    if (here !== open) {
      open = here
      list.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' })
    }
    const words = tallyOf(pins.length)
    if (words?.text !== tally) {
      tally = words?.text
      host.dispatchEvent(new Event('tab', { bubbles: true }))
    }
  }

  const ages = () => {
    const at = now()
    for (const el of list.querySelectorAll<HTMLElement>('[data-age-since]')) el.textContent = span(at - Number(el.dataset.ageSince))
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const unpin = target.closest<HTMLElement>('[data-unpin]')?.dataset.unpin
    if (unpin) return void tower.call('pins/unpin' as never, { session: unpin } as never).catch((err: Error) => kit.toast(err.message))
    const session = target.closest<HTMLElement>('[data-card]')?.dataset.card
    if (session) kit.display(`card:${session}`)
  })

  const visible = (on: boolean) => {
    clearInterval(timer)
    timer = on ? setInterval(ages, AGES_MS) : undefined
    if (on) ages()
  }

  visible(true)
  draw()

  return {
    update(next: Board) {
      board = next
      draw()
    },
    visible,
    tab: () => tallyOf(pinsOn(board).length),
    close() {
      clearInterval(timer)
    },
  }
}
