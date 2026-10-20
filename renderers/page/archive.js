import { GIST_MARK, callOf, can, esc, archiveKey, pastCount, pastCrews, pastMatching, pastSize, wordsOf, plain, statusName, plural } from '/cards.js'
import { GIST_ICON, ICON } from '/icons.js'
import { failedHtml } from '/panels.js'
import { HOME } from './view.js'
import { when, $, CLOSE_HOME, toast } from './kit.js'

/**
 * @import { Board, Card, CardConversation, Floor, Unresumable } from '../../src/bridge/board.ts'
 * @import { SessionLink } from '../../src/bridge/chains.ts'
 * @import { PastCrew, DaemonVerb } from '../../src/shared/cards.ts'
 * @import { MainView } from './view.js'
 */

/**
 * @typedef {{
 *   cards: () => Card[],
 *   board: () => Board,
 *   floorOf: (project: string) => Floor | undefined,
 *   render: () => void,
 *   heldWhy: (verb: DaemonVerb) => string | undefined,
 *   heldHtml: (verb: DaemonVerb, label: string, inner: string, cls?: string) => string,
 *   selected: () => string | undefined,
 *   callsign: (id: string) => string,
 *   unresumableHtml: (why: Unresumable) => string,
 *   go: (view: MainView) => void,
 *   paint: (projectId: string | undefined) => string,
 *   viewing: <T extends MainView['t']>(t: T) => Extract<MainView, { t: T }> | undefined,
 * }} ArchiveDeps
 */

/**
 * A floor's archive in the main pane, its past workers by crew filtered by words, and the archives this page has
 * read, where a card the board left out is found.
 * @param {ArchiveDeps} deps
 */
export function archive(deps) {
  const { cards, board, floorOf, render, heldWhy, heldHtml, selected, callsign, unresumableHtml, go, paint, viewing } = deps
  /** A card by id: on the board, else in an archive this page has read. @param {string | undefined} id */
  const findCard = (id) => cards().find((c) => c.id === id) ?? [...archives.values()].flatMap((a) => a.cards ?? []).find((c) => c.id === id)

  /**
   * The floors' archives this page has read, by project: the `archiveKey` each was read at, its cards once read, and why
   * they couldn't be while none are.
   * @type {Map<string, { key: string, cards?: Card[], failed?: string }>}
   */
  const archives = new Map()

  /** Reads a floor's archive, keeping the cards read before until it lands; a read a later one overtook is dropped. @param {string} project */
  function readArchive(project) {
    /** @type {{ key: string, cards?: Card[], failed?: string }} */
    const reading = { key: archiveKey(board(), /** @type {Floor} */ (floorOf(project))), cards: archives.get(project)?.cards }
    archives.set(project, reading)
    return tower.archive(project).then(
      (cards) => archives.get(project) === reading && ((reading.cards = cards), render()),
      (err) => archives.get(project) === reading && (reading.cards ? toast(`The archive of ${project} can't be read: ${err.message}`) : ((reading.failed = err.message), render())),
    )
  }

  /** Reads again every archive held whose floor's archive moved since. */
  const freshArchives = () => {
    for (const [project, { key }] of archives) {
      const f = floorOf(project)
      if (f && key !== archiveKey(board(), f)) readArchive(project)
    }
  }

  /** A card by id, reading every floor's archive on a miss: for an id the board may have left out. @param {string} id */
  async function lookUp(id) {
    if (!findCard(id)) await Promise.all(board().floors.filter((f) => f.archived && !archives.get(f.id)?.cards).map((f) => readArchive(f.id)))
    return findCard(id)
  }

  /** @param {Card} c @param {CardConversation} conv */
  const resumeHtml = (c, conv) => can(conv, 'resume')
    ? heldWhy('resume') ? heldHtml('resume', 'resume this conversation', ICON.resume, 'icon-btn') : `<button class="icon-btn" data-resume="${esc(JSON.stringify(callOf(conv, 'resume')))}" aria-label="resume this conversation" data-tip="resume this conversation">${ICON.resume}</button>`
    : can(conv, 'goto') ? `<span class="when">→ ${/** @type {SessionLink} */ (conv.resumedBy).callsign}</span>` : ''

  /** @param {Card} c @param {CardConversation} conv */
  const pastConversationHtml = (c, conv) =>
    `<div class="conv" data-tip="${esc(conv.prompt ? GIST_MARK.prompt + ' ' + conv.prompt : '')}${conv.answer ? '\n\n' + GIST_MARK.answer + ' ' + esc(conv.answer) : ''}">
    <span class="what">${conv.answer ? `<span class="said">${GIST_ICON.answer}</span> ` + esc(plain(conv.answer)) : conv.prompt ? `<span class="said">${GIST_ICON.prompt}</span> ` + esc(plain(conv.prompt)) : '<i>no prompt</i>'}</span>
    ${resumeHtml(c, conv)}</div>`

  /** A past worker and the conversations it held, oldest first. @param {Card} c */
  const pastHtml = (c) =>
    `<div class="past ${c.attention} ${c.id === selected() ? 'sel' : ''}" data-id="${c.id}">
    <div class="head" data-tip="${statusName(c)}"><span class="lamp"></span><a class="call" href="#${c.id}"${c.id === selected() ? ' aria-current="true"' : ''}>${callsign(c.id)}</a><span class="when">${c.unresumable ? `${unresumableHtml(c.unresumable)} · ` : ''}${when(c.startedAt)}</span></div>
    ${c.conversations.map((conv) => pastConversationHtml(c, conv)).join('') || '<div class="conv"><i class="what">no conversation</i></div>'}
  </div>`

  /** The words the archive open is filtered by. @type {string[]} */
  let archiveWords = []

  /** @param {string} project */
  const openArchive = (project) => go(floorOf(project) ? { t: 'archive', project } : HOME)

  /** @param {string} project */
  function enterArchive(project) {
    const f = /** @type {Floor} */ (floorOf(project))
    archiveWords = []
    $('archive-view').style.cssText = paint(project)
    $('archive-head').innerHTML = `<span class="label">Archive</span><span class="dim">${esc(f.name)}</span>
    <input id="archive-filter" type="search" placeholder="filter by callsign, prompt or answer" autocomplete="off">
    <span class="actions"><small class="dim" id="archive-count"></small>${CLOSE_HOME}</span>`
    $('archive-filter').focus()
  }

  let archiveDrawn = ''

  /** Past workers by crew (`pastCrews`), each worker with its crew under it. @param {PastCrew[]} crews @returns {string} */
  const pastCrewsHtml = (crews) =>
    crews.map(({ card, crew }) => pastHtml(card) + (crew.length ? `<div class="crew">${pastCrewsHtml(crew)}</div>` : '')).join('')

  /** By crew, each worker with every conversation it held and the way to resume or reach it. */
  function drawArchive() {
    const f = /** @type {Floor} */ (floorOf(/** @type {Extract<MainView, { t: 'archive' }>} */ (viewing('archive')).project))
    if (!archives.has(f.id)) readArchive(f.id)
    const { cards: archive, failed } = /** @type {{ cards?: Card[], failed?: string }} */ (archives.get(f.id))
    if (!archive) {
      $('archive-count').textContent = plural(pastCount(f), 'worker')
      const html = failed ? failedHtml('the archive', failed, 'data-archive-read') : '<div class="empty">reading the archive…</div>'
      if (html !== archiveDrawn) $('archive-list').innerHTML = archiveDrawn = html
      return
    }
    const past = pastCrews(f, archive)
    const shown = pastMatching(past, archiveWords)
    const [all, matching] = [pastSize(past), pastSize(shown)]
    $('archive-count').textContent = matching === all ? plural(all, 'worker') : `${matching} of ${all}`
    const html = pastCrewsHtml(shown) || '<div class="empty">no past worker matches</div>'
    if (html !== archiveDrawn) $('archive-list').innerHTML = archiveDrawn = html
  }

  $('archive-view').addEventListener('input', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target)
    if (input.id !== 'archive-filter') return
    archiveWords = wordsOf(input.value)
    drawArchive()
  })

  return { findCard, readArchive, freshArchives, lookUp, openArchive, enterArchive, drawArchive }
}
