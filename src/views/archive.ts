import type { Board, Card, CardConversation, Floor } from '../bridge/board.ts'
import { archiveKey, callOf, can, esc, GIST_MARK, HOST_MEANS, pastCount, pastCrews, pastMatching, pastSize, plain, plural, statusName, UNRESUMABLE_NAME, UNRESUMABLE_TITLE, when, whyNot, wordsOf } from '../shared/cards.ts'
import type { PastCrew } from '../shared/cards.ts'
import { GIST_ICON, ICON } from '../shared/icons.ts'
import { failedHtml } from '../shared/panel-kit.ts'
import { pressing } from '../shared/press.ts'
import type { Mount } from '../shared/views.ts'
import { closeHtml, paintOnce, viewCss } from './parts.ts'

/**
 * `tower/archive`, a floor's view: its past workers by crew, read from the floor's archive and filtered by words, each
 * conversation resumable where the board offers it. A worker opens as the renderer displays a card the board left out.
 */

const ID = 'tower/archive'

const STYLE = viewCss(
  ID,
  `& .archive { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-m); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    scrollbar-width: thin; scrollbar-color: var(--line) transparent; scrollbar-gutter: stable;
    display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: max-content; align-content: start; gap: var(--sp-2xs); }
  & .crew { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-2xs); margin-left: var(--sp-l); padding-left: var(--sp-m); border-left: 2px solid var(--line); }
  & .crew .crew { margin-left: 0; padding-left: var(--sp-s); }
  & .filter { flex: 1; min-width: 120px; max-width: 420px; padding: var(--sp-xs) var(--sp-l); font: var(--fs-m) var(--ui); color: var(--ink); background: var(--panel-2);
    border: 1px solid var(--line-strong); border-radius: var(--radius); }
  & .filter:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  & .past { overflow: hidden; padding: var(--sp-s) var(--sp-l); border-radius: var(--radius); font-size: var(--fs-m); color: var(--muted); cursor: pointer; }
  & .past:hover { background: var(--panel-2); color: var(--ink); }
  & .past .head { display: flex; align-items: center; gap: var(--sp-m); }
  & .past .call { font: 800 var(--fs-m)/1 var(--display); letter-spacing: .04em; color: var(--ink); text-decoration: none; }
  & .past .when { color: var(--faint); white-space: nowrap; }
  & .past .head .when { margin-left: auto; }
  & .past .conv { display: flex; align-items: center; gap: var(--sp-s); padding-left: var(--sp-xl); }
  & .past .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  & .said { color: var(--faint); }
  & .unresumable { color: var(--faint); font-size: var(--fs-s); white-space: nowrap; }
  & .empty { color: var(--faint); font-style: italic; font-size: var(--fs-s); padding: var(--sp-2xs) var(--sp-m); }`,
)

/** A floor's archive as read: the `archiveKey` it was read at, its cards once read, and why they couldn't be while none are. */
type Read = { key: string; cards?: Card[]; failed?: string }

export const mount: Mount = (host, { tower, board: first, subject, kit }) => {
  let board = first
  let lost = false
  const project = (subject.value as Floor).id
  const floor = () => board.floors.find((f) => f.id === project)!
  let read: Read = { key: '' }
  let words: string[] = []

  host.innerHTML = `<style>${STYLE}</style><div class="shelf-head"></div><div class="archive"></div>`
  const [head, list] = [host.querySelector('.shelf-head')!, host.querySelector<HTMLElement>('.archive')!]
  head.innerHTML = `<span class="label">Archive</span><span class="dim">${esc(floor().name)}</span>
    <input class="filter" type="search" placeholder="filter by callsign, prompt or answer" autocomplete="off">
    <span class="actions"><small class="dim count"></small>${closeHtml(board.keys)}</span>`
  const filter = head.querySelector<HTMLInputElement>('.filter')!
  const count = head.querySelector('.count')!

  const heldWhy = () => (lost ? HOST_MEANS.unknown : whyNot(board, 'resume'))

  const resumeHtml = (conv: CardConversation) => {
    if (can(conv, 'resume')) {
      const held = heldWhy()
      return held
        ? `<button class="held icon-btn" aria-disabled="true" aria-label="resume this conversation" data-tip="${esc(held)}">${ICON.resume}</button>`
        : `<button class="icon-btn" data-resume="${esc(JSON.stringify(callOf(conv, 'resume')))}" aria-label="resume this conversation" data-tip="resume this conversation">${ICON.resume}</button>`
    }
    return can(conv, 'goto') ? `<span class="when">→ ${esc(conv.resumedBy!.callsign)}</span>` : ''
  }

  const conversationHtml = (conv: CardConversation) =>
    `<div class="conv" data-tip="${esc(conv.prompt ? GIST_MARK.prompt + ' ' + conv.prompt : '')}${conv.answer ? '\n\n' + GIST_MARK.answer + ' ' + esc(conv.answer) : ''}">
    <span class="what">${conv.answer ? `<span class="said">${GIST_ICON.answer}</span> ` + esc(plain(conv.answer)) : conv.prompt ? `<span class="said">${GIST_ICON.prompt}</span> ` + esc(plain(conv.prompt)) : '<i>no prompt</i>'}</span>
    ${resumeHtml(conv)}</div>`

  const unresumableHtml = (c: Card) =>
    c.unresumable ? `<span class="unresumable" data-tip="${esc(UNRESUMABLE_TITLE[c.unresumable])}">${UNRESUMABLE_NAME[c.unresumable]}</span> · ` : ''

  /** A past worker and the conversations it held, oldest first. */
  const pastHtml = (c: Card) =>
    `<div class="past ${c.attention}" data-card="${esc(c.id)}">
    <div class="head" data-tip="${statusName(c)}"><span class="lamp"></span><a class="call" role="link" tabindex="0" data-card="${esc(c.id)}">${esc(c.callsign)}</a><span class="when">${unresumableHtml(c)}${when(c.startedAt)}</span></div>
    ${c.conversations.map(conversationHtml).join('') || '<div class="conv"><i class="what">no conversation</i></div>'}
  </div>`

  const crewsHtml = (crews: PastCrew[]): string => crews.map(({ card, crew }) => pastHtml(card) + (crew.length ? `<div class="crew">${crewsHtml(crew)}</div>` : '')).join('')

  /** Reads the floor's archive, keeping the cards read before until it lands; a read a later one overtook is dropped. */
  const readArchive = () => {
    const reading: Read = { key: archiveKey(board, floor()), cards: read.cards }
    read = reading
    tower.archive(project).then(
      (cards) => read === reading && ((reading.cards = cards), draw()),
      (err: Error) => read === reading && (reading.cards ? kit.toast(`The archive of ${project} can't be read: ${err.message}`) : ((reading.failed = err.message), draw())),
    )
  }

  /** By crew, each worker with every conversation it held and the way to resume or reach it. */
  const draw = () => {
    const f = floor()
    if (!read.cards) {
      count.textContent = plural(pastCount(f), 'worker')
      return paintOnce(list, read.failed ? failedHtml('the archive', read.failed, 'data-archive-read') : '<div class="empty">reading the archive…</div>')
    }
    const past = pastCrews(f, read.cards)
    const shown = pastMatching(past, words)
    const [all, matching] = [pastSize(past), pastSize(shown)]
    count.textContent = matching === all ? plural(all, 'worker') : `${matching} of ${all}`
    paintOnce(list, crewsHtml(shown) || '<div class="empty">no past worker matches</div>')
  }

  list.addEventListener('keydown', (e) => {
    const card = e.key === 'Enter' && (e.target as Element).closest<HTMLElement>('a.call')?.dataset.card
    if (card) kit.display(`card:${card}`)
  })
  filter.addEventListener('input', () => {
    words = wordsOf(filter.value)
    draw()
  })
  host.addEventListener('click', async (e) => {
    const target = e.target as Element
    if (target.closest('[data-home]')) return kit.display('board')
    if (target.closest('[data-archive-read]')) return (readArchive(), draw())
    const resume = target.closest<HTMLElement>('[data-resume]')
    if (resume) {
      const reply = await pressing(resume, () => tower.run(JSON.parse(resume.dataset.resume!))).catch((err: Error) => (kit.toast(err.message), undefined))
      if (reply?.t === 'spawned') kit.display(`card:${reply.id}`)
      return
    }
    const card = target.closest<HTMLElement>('[data-card]')?.dataset.card
    if (card) kit.display(`card:${card}`)
  })
  const offError = tower.onBoardError((err) => {
    lost = err.code === 'disconnected'
    draw()
  })

  readArchive()
  draw()
  filter.focus()

  return {
    update(next: Board) {
      board = next
      lost = false
      if (archiveKey(board, floor()) !== read.key) readArchive()
      draw()
    },
    close: offError,
  }
}
