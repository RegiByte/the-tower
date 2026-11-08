import { loop, heldHandlers, noReads, reading } from '/lib/machine.js'
import { heldThread, readThread, threadFailure, threadWant, parseThread } from './clients.ts'
import type { ThreadAt } from '../../../extensions/reviews/client/panel.ts'
import type { ReviewThread } from '../../../extensions/reviews/client/reviews.ts'
import { tower, type Board } from './api.ts'
import { FIXTURE, FIXTURE_THREADS } from './fixtures.ts'

/**
 * Review threads as Tower 3D's reader reads them: a thread's file is read and parsed once per version the board names.
 * A fixture board reads its own, the same on every load.
 */

let arrived = () => {}
let failed = (_: string) => {}
/** Runs `then` whenever a thread read arrives, `fail` with why one can't be read over what is held. */
export const onReviews = (then: () => void, fail: (message: string) => void) => ((arrived = then), (failed = fail))

const threads = loop({
  state: noReads<ReviewThread>(),
  handlers: heldHandlers<ReviewThread>(),
  execute: {
    read: reading(FIXTURE === undefined ? readThread((path) => tower.text(path)) : (slot) => Promise.resolve(parseThread(FIXTURE_THREADS[slot] ?? ''))),
    draw: () => arrived(),
    toast: ({ message }) => failed(message),
  },
})

const wanted = (board: Board, at: ThreadAt) => {
  const want = threadWant(board.floors, at)
  if (want) threads.dispatch(want)
  return threads.state()
}

/**
 * A thread: empty while it has no file, `undefined` until its file is first read. A file the board says moved on is
 * read again; until it arrives, the thread as it was.
 */
export const threadOf = (board: Board, at: ThreadAt) => heldThread(wanted(board, at), board.floors, at)

/** Why a thread couldn't be read, while none is held. */
export const threadFailed = (board: Board, at: ThreadAt) => threadFailure(wanted(board, at), at)

/** Reads a thread again, after a read that failed. */
export function rereadThread(board: Board, at: ThreadAt) {
  const want = threadWant(board.floors, at)
  if (want) threads.dispatch({ ...want, type: 'refresh' })
}
