import { type Board, findCard, projectOfKey } from '/lib/board.js'
import { attentionOrder, type Attended, DISMISS_ASK_TITLE, DISMISS_OFFER_TITLE, DISMISS_TITLE, dismissing, gistLine, isAsk, lampOf, WAIT_SAID } from '/lib/cards.js'
import { domId } from '/lib/morph.js'
import { DISMISSED_KEY } from '/lib/viewer.js'
import { ICON, morphPanel, type Mount, type Tab, type TabWords, viewCss } from '/lib/view.js'
import { esc, span } from '/lib/words.js'

/**
 * `tower/waiting`, a section of the board: who waits on you and what asks, oldest first, the list the next-waiting
 * chord walks (`attentionOrder`), less what this viewer dismissed. A row opens its worker, or goes where its ask
 * opens; its × dismisses it for every renderer of theirs.
 */

const ID = 'tower/waiting'

/** How often the rows' ages are written again. */
const AGES_MS = 30_000

const STYLE = viewCss(
  ID,
  `& .waiting { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  & .wait { display: flex; align-items: center; min-width: 0; border-radius: var(--radius-control); }
  & .wait:hover, & .wait[aria-current] { background: var(--hover); }
  & .wait[aria-current] { box-shadow: inset 2px 0 0 var(--accent); }
  & .go { flex: 1; min-width: 0; display: grid; gap: var(--sp-2xs); padding: var(--sp-xs) var(--sp-s); border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; }
  & .line { display: flex; align-items: center; gap: var(--sp-s); min-width: 0; font-size: var(--fs-s); white-space: nowrap; }
  & .call { font: var(--name-weight) var(--fs-s)/1 var(--display); letter-spacing: var(--name-tracking); overflow: hidden; text-overflow: ellipsis; }
  & .floor { flex: none; color: color-mix(in oklab, var(--p, var(--ink)) var(--p-text-mix), var(--ink)); font-size: var(--fs-xs); }
  & .why { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
  & .age { margin-left: auto; flex: none; color: var(--faint); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
  & .gist { color: var(--faint); font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & .wait .icon-btn { flex: none; min-width: var(--control); }`,
)

/** The section's tally: how many wait on you, or `undefined` when nobody does, which leaves the section undrawn. */
const tallyOf = (n: number): TabWords | undefined => (n ? { text: String(n), tone: 'unseen', tip: `${n} waiting on you` } : undefined)

/** Its tally from the board alone, before the viewer's dismissals are read. */
export const tab: Tab = (board) => tallyOf(attentionOrder(board, { dismissed: new Set() }).length)

/** The floor's name and colour for a row, when its subject is on a floor. */
const floorHtml = (board: Board, project: string | undefined) => {
  const floor = project === undefined ? undefined : board.floors.find((f) => f.id === project)
  return floor ? `<span class="floor" style="${floor.color ? `--p:${esc(floor.color)}` : ''}">${esc(floor.name)}</span>` : ''
}

const ageHtml = (since: number, now: number) => `<span class="age" data-age-since="${since}">${esc(span(now - since))}</span>`

const dismissHtml = (key: string, tip: string) => `<button class="icon-btn" data-dismiss="${esc(key)}" aria-label="${esc(tip)}" data-tip="${esc(tip)}">${ICON.close}</button>`

/** Where a row goes, as the subject it displays: a worker's card, or the subject an ask is about. */
const subjectOf = (a: Attended) => (isAsk(a) ? a.subject : `card:${a.id}`)

export const mount: Mount = (host, { tower, board: first, kit }) => {
  let board = first
  let dismissed: ReadonlySet<string> = new Set()
  let open: string | undefined
  let tally: string | undefined | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  const now = () => kit.now?.() ?? Date.now()
  const listed = () => attentionOrder(board, { dismissed })

  host.innerHTML = `<style>${STYLE}</style><ul class="waiting" role="list"></ul>`
  const list = host.querySelector<HTMLElement>('.waiting')!

  const rowHtml = (a: Attended, at: number, here: string | undefined) => {
    const current = here === subjectOf(a) ? ' aria-current="true"' : ''
    if (isAsk(a)) {
      const tone = a.sound === 'wait' ? 'needs' : 'offered'
      return `<li class="wait ${tone}" id="${esc(domId('waiting', a.key))}" data-key="${esc(a.key)}"${current}><button class="go" data-ask="${esc(a.key)}"${a.hint ? ` data-tip="${esc(a.hint)}"` : ''}>
        <span class="line"><span class="lamp"></span><span class="call">${esc(a.title)}</span>${floorHtml(board, projectOfKey(board, a.subject))}${ageHtml(a.since, at)}</span>
        <span class="gist">${esc(a.cap)} asks</span></button>${dismissHtml(a.key, a.sound === 'offer' ? DISMISS_OFFER_TITLE : DISMISS_ASK_TITLE)}</li>`
    }
    const card = findCard(board, a.id)
    if (!card) return ''
    const gist = gistLine(card)
    return `<li class="wait ${lampOf(card)}" id="${esc(domId('waiting', a.key))}" data-key="${esc(a.key)}"${current}><button class="go" data-card="${esc(a.id)}"${gist ? ` data-tip="${esc(gist)}"` : ''}>
      <span class="line"><span class="lamp"></span><span class="call">${esc(card.callsign)}</span>${floorHtml(board, card.project)}<span class="why">${esc(WAIT_SAID[a.reason])}</span>${ageHtml(a.since, at)}</span>
      ${gist ? `<span class="gist">${esc(gist)}</span>` : ''}</button>${dismissHtml(a.key, DISMISS_TITLE)}</li>`
  }

  /** The subject open in the main pane, when it is one a row goes to. */
  const openSubject = () => kit.location?.()?.subject

  const draw = () => {
    const rows = listed()
    const here = openSubject()
    const at = now()
    morphPanel(list, rows.map((a) => rowHtml(a, at, here)).join(''))
    if (here !== open) {
      open = here
      list.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' })
    }
    const words = tallyOf(rows.length)
    if (words?.text !== tally) {
      tally = words?.text
      host.dispatchEvent(new Event('tab', { bubbles: true }))
    }
  }

  const ages = () => {
    const at = now()
    for (const el of list.querySelectorAll<HTMLElement>('[data-age-since]')) el.textContent = span(at - Number(el.dataset.ageSince))
  }

  const reread = async () => {
    dismissed = new Set(((await tower.store.get(DISMISSED_KEY)) as string[] | null) ?? [])
    draw()
  }

  const goTo = (a: Attended) => {
    if (!isAsk(a)) return kit.display(`card:${a.id}`)
    if (a.opens) return kit.go(a.opens)
    kit.display(a.subject)
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const key = target.closest<HTMLElement>('[data-dismiss]')?.dataset.dismiss
    if (key) {
      dismissed = new Set(dismissing(board, dismissed, key))
      tower.store.set(DISMISSED_KEY, [...dismissed])
      return draw()
    }
    const row = target.closest<HTMLElement>('[data-key]')?.dataset.key
    const a = row === undefined ? undefined : listed().find((x) => x.key === row)
    if (a) goTo(a)
  })

  const offStore = tower.store.on((k) => k === DISMISSED_KEY && void reread())
  const visible = (on: boolean) => {
    clearInterval(timer)
    timer = on ? setInterval(ages, AGES_MS) : undefined
    if (on) ages()
  }

  visible(true)
  draw()
  void reread()

  return {
    update(next: Board) {
      board = next
      void reread()
    },
    visible,
    tab: () => tallyOf(listed().length),
    close() {
      clearInterval(timer)
      offStore()
    },
  }
}
