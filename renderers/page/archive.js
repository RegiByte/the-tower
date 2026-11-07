import { archivedCard, archivesMoved, archiveWant } from '/lib/cards.js'
import { heldHandlers, loop, noReads, reading } from '/lib/machine.js'
import { toast } from './kit.js'

/**
 * @import { Board, Card, Floor } from '/lib/board.js'
 * @import { ArchiveReads } from '/lib/cards.js'
 */

/**
 * @typedef {{
 *   cards: () => Card[],
 *   board: () => Board,
 *   render: () => void,
 * }} ArchiveDeps
 */

/**
 * The archives this page has read, where a card the board left out is found: a worker opened from a link, the history
 * or a view, after its floor's archive is read.
 * @param {ArchiveDeps} deps
 */
export function archive(deps) {
  const { cards, board, render } = deps
  /** A card by id: on the board, else in an archive this page has read. @param {string | undefined} id */
  const findCard = (id) => cards().find((c) => c.id === id) ?? (id === undefined ? undefined : (archivedCard(archives.state(), id) ?? held.get(id)))

  /** A floor's archive, read as `GET /archive/<project>`, its failure naming the floor. */
  const readArchive = reading((project) => tower.archive(project).catch((err) => Promise.reject(new Error(`The archive of ${project} can't be read: ${err.message}`))))

  /** The past workers a view handed the page whole, read from an archive of its own: subjects the page holds. @type {Map<string, Card>} */
  const held = new Map()

  /** A past worker a view handed the page, held as a read. @param {Card} c */
  const hold = (c) => void held.set(c.id, c)

  /**
   * The floors' archives this page has read, by project, each read again as its floor's `archiveKey` moves and holding
   * its cards until the next read lands. Every read that fails is said: the machine says one over cards read, and the
   * read itself one with nothing read before.
   */
  const archives = loop({
    state: /** @type {ArchiveReads} */ (noReads()),
    handlers: heldHandlers(),
    execute: {
      read: (f, dispatch) =>
        readArchive(f, (e) => {
          dispatch(e)
          const h = archives.state().held[f.slot]
          if (e.type === 'failed' && h?.t === 'failed' && h.n === f.n && !h.last) toast(h.message)
        }),
      draw: () => render(),
      toast: ({ message }) => toast(message),
    },
  })

  /** Reads again every archive held whose floor's archive moved since. */
  const freshArchives = () => {
    for (const want of archivesMoved(archives.state(), board())) archives.dispatch(want)
  }

  /** Reads a floor's archive as this board stands, unless it holds that read or is reading it; one that failed is read again. @param {Floor} f */
  const readCurrent = (f) => {
    const want = archiveWant(board(), f)
    const h = archives.state().held[f.id]
    archives.dispatch(h?.t === 'failed' && h.key === want.key ? { ...want, type: 'refresh' } : want)
  }

  /** A card by id, reading every floor's archive on a miss: for an id the board may have left out. @param {string} id */
  async function lookUp(id) {
    if (!findCard(id)) {
      const archived = board().floors.filter((f) => f.archived)
      for (const f of archived) readCurrent(f)
      await archives.until((r) => archived.every((f) => r.held[f.id]?.t !== 'reading'))
    }
    return findCard(id)
  }

  return { findCard, freshArchives, lookUp, hold }
}
