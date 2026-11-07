import { archiveKey } from '/lib/cards.js'
import { toast } from './kit.js'

/**
 * @import { Board, Card, Floor } from '/lib/board.js'
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
  const findCard = (id) => cards().find((c) => c.id === id) ?? [...archives.values()].flatMap((a) => a.cards ?? []).find((c) => c.id === id) ?? (id === undefined ? undefined : held.get(id))

  /** The past workers a view handed the page whole, read from an archive of its own: subjects the page holds. @type {Map<string, Card>} */
  const held = new Map()

  /** A past worker a view handed the page, held as a read. @param {Card} c */
  const hold = (c) => void held.set(c.id, c)

  /**
   * The floors' archives this page has read, by project: the `archiveKey` each was read at, its cards once read, and
   * the read itself, until one fails.
   * @type {Map<string, { key: string, cards?: Card[], read?: Promise<unknown> }>}
   */
  const archives = new Map()

  /** Reads a floor's archive, keeping the cards read before until it lands; a read a later one overtook is dropped and waits for that one. @param {string} project */
  function readArchive(project) {
    /** @type {{ key: string, cards?: Card[], read?: Promise<unknown> }} */
    const reading = { key: archiveKey(board(), /** @type {Floor} */ (floorOf(project))), cards: archives.get(project)?.cards }
    archives.set(project, reading)
    const overtaken = () => archives.get(project) !== reading
    reading.read = tower.archive(project).then(
      (cards) => (overtaken() ? archives.get(project)?.read : ((reading.cards = cards), render())),
      (err) => {
        if (overtaken()) return archives.get(project)?.read
        reading.read = undefined
        toast(`The archive of ${project} can't be read: ${err.message}`)
      },
    )
    return reading.read
  }

  /** The read of a floor's archive as this board stands: the one made at its `archiveKey`, else a new one. @param {Floor} f */
  const readCurrent = (f) => {
    const held = archives.get(f.id)
    return (held?.key === archiveKey(board(), f) && held.read) || readArchive(f.id)
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
    if (!findCard(id)) await Promise.all(board().floors.filter((f) => f.archived).map(readCurrent))
    return findCard(id)
  }

  return { findCard, freshArchives, lookUp, hold }
}
