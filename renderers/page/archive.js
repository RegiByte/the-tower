import { archiveKey } from '/cards.js'
import { toast } from './kit.js'

/**
 * @import { Board, Card, Floor } from '../../src/bridge/board.ts'
 */

/**
 * @typedef {{
 *   cards: () => Card[],
 *   board: () => Board,
 *   floorOf: (project: string) => Floor | undefined,
 *   render: () => void,
 * }} ArchiveDeps
 */

/**
 * The archives this page has read, where a card the board left out is found: a worker opened from a link, the history
 * or a view, after its floor's archive is read.
 * @param {ArchiveDeps} deps
 */
export function archive(deps) {
  const { cards, board, floorOf, render } = deps
  /** A card by id: on the board, else in an archive this page has read. @param {string | undefined} id */
  const findCard = (id) => cards().find((c) => c.id === id) ?? [...archives.values()].flatMap((a) => a.cards ?? []).find((c) => c.id === id)

  /**
   * The floors' archives this page has read, by project: the `archiveKey` each was read at, and its cards once read.
   * @type {Map<string, { key: string, cards?: Card[] }>}
   */
  const archives = new Map()

  /** Reads a floor's archive, keeping the cards read before until it lands; a read a later one overtook is dropped. @param {string} project */
  function readArchive(project) {
    /** @type {{ key: string, cards?: Card[] }} */
    const reading = { key: archiveKey(board(), /** @type {Floor} */ (floorOf(project))), cards: archives.get(project)?.cards }
    archives.set(project, reading)
    return tower.archive(project).then(
      (cards) => archives.get(project) === reading && ((reading.cards = cards), render()),
      (err) => archives.get(project) === reading && toast(`The archive of ${project} can't be read: ${err.message}`),
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

  return { findCard, freshArchives, lookUp }
}
