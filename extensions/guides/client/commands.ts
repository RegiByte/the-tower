import { type Board, can, type Card, cardSubject, type Subject } from '/lib/board.js'
import { whyNot } from '/lib/cards.js'
import type { Tower } from '/lib/client.js'
import type { CommandKit } from '/lib/view.js'

/** What the tour's worker is asked: the words the `tower:guide` skill answers. */
export const TOUR_PROMPT = 'Give me a tour of the tower.'

/** `guides/open`, on the board: the learning center in the main pane. */
export const openCenter = ({ kit }: { target: Subject; kit: CommandKit }) => kit.display('board', { view: 'guides/center' })

/** How long the tour waits for its worker to reach the board. */
const ARRIVAL_MS = 10_000

/**
 * Worker `id`'s card once a board carries it, or nothing after `ARRIVAL_MS`: a spawn replies before its card reaches
 * the board, and a renderer may take a board later than this module does, so the card itself is what to display.
 */
const arrival = (tower: Tower, id: string) =>
  new Promise<Card | undefined>((done) => {
    let found: Card | undefined
    const timer = setTimeout(() => (off(), done(undefined)), ARRIVAL_MS)
    const off = tower.subscribe((board) => {
      found ??= board.floors.flatMap((f) => f.cards).find((c) => c.id === id)
      if (found) queueMicrotask(() => (clearTimeout(timer), off(), done(found)))
    })
  })

/**
 * `guides/tour`, on the board: a worker on the first floor in board order that gives the tour, then that worker. It
 * runs on Claude whatever the floor's runtime, since the `tower:guide` skill it follows ships with Claude's plugin.
 */
export const startTour = async ({ tower, board, kit }: { tower: Tower; board: Board; target: Subject; kit: CommandKit }) => {
  const floor = board.floors[0]
  if (!floor) return kit.toast('The tour starts on a floor: add one first')
  const held = whyNot(board, 'spawn') ?? (can(floor, 'spawn') ? undefined : `${floor.name} starts no workers now`)
  if (held) return kit.toast(held)
  try {
    const { id } = await tower.call('spawn', { project: floor.id, runtime: 'claude', prompt: TOUR_PROMPT })
    const card = await arrival(tower, id)
    kit.display(card ? cardSubject(card) : `card:${id}`)
  } catch (err) {
    kit.toast((err as Error).message)
  }
}
