import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseLog } from '../src/bridge/log.ts'
import { BOOTING, nextState, type Status } from '../src/bridge/status.ts'
import type { SessionLog } from '../src/shared/model.ts'

export const fixture = (name: string): SessionLog => parseLog(readFileSync(path.join(import.meta.dirname, 'fixtures', `${name}.jsonl`), 'utf8'))

/** Every status a session passed through, with the second it entered it. */
export const timeline = ({ events }: SessionLog): [Status, number][] => {
  const steps: [Status, number][] = []
  events.reduce((state, event) => {
    const next = nextState(state, event)
    if (next.status !== state.status) steps.push([next.status, next.since])
    return next
  }, BOOTING)
  return steps
}
