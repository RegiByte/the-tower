import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseLog } from '../src/bridge/log.ts'
import { factsAfter, initialFacts, type FoldEvent } from '../src/bridge/facts.ts'
import type { Status } from '../src/bridge/status.ts'
import { normalizerOf } from '../src/bridge/normalize.ts'
import type { SessionLog } from '../src/shared/model.ts'

export const fixture = (name: string): SessionLog => parseLog(readFileSync(path.join(import.meta.dirname, 'fixtures', `${name}.jsonl`), 'utf8'))

/** A log's events as the folds read them. */
export const normalized = ({ header, events }: SessionLog) => events.flatMap(normalizerOf(header))

/** Every status a session passed through, with the second it entered it, as its facts fold: none after a break. */
export const timeline = ({ header, events }: { header: SessionLog['header']; events: FoldEvent[] }): [Status, number][] => {
  const steps: [Status, number][] = []
  const step = factsAfter(header)
  events.reduce((facts, event) => {
    const next = step(facts, event)
    if (next.state.status !== facts.state.status) steps.push([next.state.status, next.state.since])
    return next
  }, initialFacts(header))
  return steps
}
