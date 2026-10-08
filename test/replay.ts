import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseLog } from '../src/bridge/log.ts'
import { factsAfter, initialFacts } from '../src/bridge/facts.ts'
import type { Status } from '../src/bridge/status.ts'
import type { SessionLog } from '../src/shared/model.ts'

export const fixture = (name: string): SessionLog => parseLog(readFileSync(path.join(import.meta.dirname, 'fixtures', `${name}.jsonl`), 'utf8'))

/** Every status a session passed through, with the second it entered it, as its facts fold: none after a break. */
export const timeline = ({ header, events }: SessionLog): [Status, number][] => {
  const steps: [Status, number][] = []
  const step = factsAfter(header.startedAt)
  events.reduce((facts, event) => {
    const next = step(facts, event)
    if (next.state.status !== facts.state.status) steps.push([next.state.status, next.state.since])
    return next
  }, initialFacts(header))
  return steps
}
