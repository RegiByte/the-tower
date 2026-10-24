/**
 * An extension's board trigger as it runs (decision `extensions`): handed each board the publisher builds, it is called
 * from the second on with the board it was last called with, off floors removed from both (`bridge/triggers.ts`), and
 * the calls it asks for are dispatched as the tower. Level-triggered: a change undone between two builds is no change.
 * Past `LIMIT` calls in a minute it is paused for 5 minutes, the boards still followed so it resumes on the latest.
 */
import type { Board } from '../bridge/board.ts'
import { triggerBoards, boardWithout } from '../bridge/triggers.ts'
import { isApiError } from '../shared/api.ts'
import type { BoardTrigger, Caller, ExtensionProblem, TriggerCall } from '../shared/extensions.ts'
import { frozen } from '../bridge/frozen.ts'

/** Who a board trigger's calls are made for: the tower, at a board change. */
export const BOARD_CALLER: Caller = { t: 'tower', id: 'board', via: 'loop', within: [] }

const LIMIT = 30
const WINDOW_MS = 60_000
const PAUSE_MS = 5 * 60_000

type Problem = Pick<ExtensionProblem, 'level' | 'code' | 'message'>

const isCall = (value: unknown): value is TriggerCall => typeof value === 'object' && value !== null && typeof (value as TriggerCall).verb === 'string'

/**
 * A listener of the publisher's boards running `trigger`. `off`: the floors where its capability is off now. `call`: a
 * verb dispatched as `BOARD_CALLER`. `problem`: each failure, a throw, an answer off its shape, a refused call or a pause.
 */
export const runBoardTrigger = (
  trigger: BoardTrigger,
  { off, call, problem }: { off: () => Set<string>; call: (verb: string, input: unknown) => Promise<unknown>; problem: (problem: Problem) => void },
) => {
  let prev: Board | undefined
  let made: number[] = []
  let pausedUntil = 0
  return (board: Board) => {
    if (!prev) return void (prev = frozen(boardWithout(board, off())))
    const boards = triggerBoards(prev, board, off())
    prev = frozen(boards.next)
    const now = Date.now()
    if (now < pausedUntil) return
    let asked: unknown
    try {
      asked = trigger(frozen(boards.prev), boards.next)
    } catch (err) {
      console.error('board trigger:', err)
      return problem({ level: 'error', code: 'threw', message: `its board trigger threw: ${(err as Error).message ?? String(err)}` })
    }
    if (!Array.isArray(asked) || !asked.every(isCall)) return problem({ level: 'error', code: 'shape', message: 'its board trigger returned no array of calls: [{verb, input}]' })
    for (const { verb, input } of asked) {
      made = made.filter((at) => now - at < WINDOW_MS)
      if (made.length >= LIMIT) {
        pausedUntil = now + PAUSE_MS
        return problem({ level: 'warn', code: 'paused', message: `its board trigger asked for more than ${LIMIT} calls in a minute: paused until ${new Date(pausedUntil).toISOString()}` })
      }
      made.push(now)
      void call(verb, input ?? {}).then((reply) => {
        if (isApiError(reply)) problem({ level: 'error', code: 'failed', message: `its board trigger's call of ${verb} failed: ${reply.code}: ${reply.message}` })
      })
    }
  }
}
