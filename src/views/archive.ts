import { type Board, callOf, can, type Card, type Floor } from '/lib/board.js'
import { type ArchiveReads, archiveWant, GIST_MARK, HOST_MEANS, pastCount, type PastCrew, pastCrews, pastMatching, pastSize, statusName, UNRESUMABLE_NAME, UNRESUMABLE_TITLE, whyNot, wordsOf } from '/lib/cards.js'
import { failureOf, heldHandlers, loop, noReads, reading, valueOf } from '/lib/machine.js'
import { closeHtml, failedHtml, GIST_ICON, ICON, type Mount, paintOnce, pressing, viewCss } from '/lib/view.js'
import { esc, plain, plural, when } from '/lib/words.js'

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

export const mount: Mount = (host, { tower, board: first, subject, kit }) => {
  let board = first
  let lost = false
  const project = (subject.value as Floor).id
  const floor = () => board.floors.find((f) => f.id === project)!
  let words: string[] = []

  host.innerHTML = `<style>${STYLE}</style><div class="shelf-head"></div><div class="archive"></div>`
  const [head, list] = [host.querySelector('.shelf-head')!, host.querySelector<HTMLElement>('.archive')!]
  head.innerHTML = `<span class="label">Archive</span><span class="dim">${esc(floor().name)}</span>
    <input class="filter" type="search" placeholder="filter by callsign, prompt or answer" autocomplete="off">
    <span class="actions"><small class="dim count"></small>${closeHtml(board.keys)}</span>`
  const filter = head.querySelector<HTMLInputElement>('.filter')!
  const count = head.querySelector('.count')!

  const heldWhy = () => (lost ? HOST_MEANS.unknown : whyNot(board, 'resume'))

  const resumeHtml = (conv: Card['conversations'][number]) => {
    if (can(conv, 'resume')) {
      const held = heldWhy()
      return held
        ? `<button class="held icon-btn" aria-disabled="true" aria-label="resume this conversation" data-tip="${esc(held)}">${ICON.resume}</button>`
        : `<button class="icon-btn" data-resume="${esc(JSON.stringify(callOf(conv, 'resume')))}" aria-label="resume this conversation" data-tip="resume this conversation">${ICON.resume}</button>`
    }
    return can(conv, 'goto') ? `<span class="when">→ ${esc(conv.resumedBy!.callsign)}</span>` : ''
  }

  const conversationHtml = (conv: Card['conversations'][number]) =>
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

  /** The floor's archive, read again as its `archiveKey` moves: the cards read before are drawn until the next read lands. */
  const archive = loop({
    state: noReads<Card[]>() as ArchiveReads,
    handlers: heldHandlers<Card[]>(),
    execute: {
      read: reading((slot) => tower.archive(slot)),
      draw: () => draw(),
      toast: ({ message }) => kit.toast(`The archive of ${project} can't be read: ${message}`),
    },
  })

  /** By crew, each worker with every conversation it held and the way to resume or reach it. */
  const draw = () => {
    const f = floor()
    const read = archive.state().held[project]
    const cards = valueOf(read)
    if (!cards) {
      count.textContent = plural(pastCount(f), 'worker')
      const failed = failureOf(read)
      return paintOnce(list, failed ? failedHtml('the archive', failed, 'data-archive-read') : '<div class="empty">reading the archive…</div>')
    }
    const past = pastCrews(f, cards)
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
    if (target.closest('[data-archive-read]')) return (archive.dispatch({ ...archiveWant(board, floor()), type: 'refresh' }), draw())
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

  archive.dispatch(archiveWant(board, floor()))
  draw()
  filter.focus()

  return {
    update(next: Board) {
      board = next
      lost = false
      archive.dispatch(archiveWant(board, floor()))
      draw()
    },
    close: offError,
  }
}
