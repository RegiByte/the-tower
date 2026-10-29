/**
 * Autotidy: what a worker leaves as it goes home, tidied by itself. Its floor fold says who is going home now, read
 * from the cards that stay on the board as they go, and its board trigger adds those that left the board as they went,
 * and asks Tidy once for each entry of theirs as it comes to be listed, a kind a call, so one that went stale
 * (a process exiting on its own) takes down only its kind. It keeps nothing: going home is the session log's fact, and only workers going home while it is on
 * are tidied, only as they go. What isn't safe to remove then is left for Tidy's press; Tidy's own checks hold.
 */
import type { Floor } from '../../src/bridge/board.ts'
import type { Start, TriggerCall } from '../../src/shared/extensions.ts'
import { addedOf, byKind, fresh, leftBoard, listedBefore, partOf, planOf, tidyInput, type Settings } from './plan.ts'

const start: Start = () => ({
  folds: { floor: (f: Floor, { settings, now }) => ({ x: partOf(settings as Settings, f, now) }) },
  board: (prev, next) =>
    next.floors.flatMap((f): TriggerCall[] => {
      const was = prev.floors.find((p) => p.id === f.id)
      if (!was) return []
      const asked = listedBefore(was, fresh(planOf(was, addedOf(prev, was)), planOf(f, addedOf(next, f), leftBoard(was, f))))
      return byKind(asked).map((entry) => ({ verb: 'tower/tidy', input: tidyInput(f.id, entry) }))
    }),
})

export default start
