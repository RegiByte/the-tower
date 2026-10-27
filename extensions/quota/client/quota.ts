import type { Board } from '../../../src/bridge/board.ts'
import type { Attention } from '../../../src/bridge/life.ts'
import type { ProbeStatus as LegacyProbe } from '../../../src/bridge/legacy.ts'
import { span } from '../../../src/shared/format.ts'

/**
 * The quota probe in words: how it stands, when it reads next, and what a read now came to, read from the quota
 * extension's part of the board (`board.x.quota`). The tower serves this module as `/x/quota/quota.js`, its extension's
 * client file.
 */

/** A probe as these words read it: the quota extension's part with its name (`quotaOf`), or an entry of `board.probes`. */
export type ProbeStatus = Omit<LegacyProbe, 'reads'>

/** What `quota/read-now` answers, as these words read it. */
export type ReadNow = { ms: number; ok: boolean; error?: string }

/** The quota probe as the quota extension's part on the board says it stands, by its name: none while it doesn't run. */
export const quotaOf = (b: Pick<Board, 'x'>): ProbeStatus | undefined => {
  const quota = b.x?.quota as Omit<ProbeStatus, 'name'> | undefined
  return quota && { name: 'quota', ...quota }
}

/** A probe's state in words, coloured by how much it asks of you: a failing probe leaves the limits to age. */
export const PROBE_STATE_NAME: Record<ProbeStatus['state'], string> = { new: 'not read yet', ok: 'answering', failing: 'failing', backoff: 'backing off', unavailable: 'nothing to read' }
export const PROBE_ATTENTION: Record<ProbeStatus['state'], Attention> = { new: 'quiet', ok: 'quiet', failing: 'working', backoff: 'broken', unavailable: 'working' }

/** When a probe reads next: `reads now` once due, else in how long, and why when a session's turn holds it. */
const probeNext = (p: ProbeStatus, now: number) =>
  p.nextAt <= now ? 'reads now' : `next in ${span(p.nextAt - now)}${p.held ? ", after a session's reading" : ''}`

/** A probe in a short line: `quota probe · answered 3m ago · next in 7m`. */
export const probeLine = (p: ProbeStatus, now: number) =>
  [
    `${p.name} probe`,
    p.lastAt === undefined ? PROBE_STATE_NAME[p.state] : `${p.error === undefined ? 'answered' : 'failed'} ${span(now - p.lastAt)} ago`,
    probeNext(p, now),
  ].filter(Boolean).join(' · ')

/** A probe in full: its line, then what its state means, why its last read failed and when it last answered. */
export const probeTitle = (p: ProbeStatus, now: number) =>
  [
    probeLine(p, now),
    p.state === 'new' && `reads Claude's usage every ${span(p.every)} while no session's turn has`,
    p.state === 'unavailable' && `the account has no rate limits to read (an API key, a cloud provider, or nobody signed in): it reads again every ${span(p.wait)}`,
    p.error !== undefined && `${p.failsInRow} failed in a row${p.state === 'backoff' ? `, so it waits ${span(p.wait)}` : ''}: ${p.error}`,
    p.error !== undefined && p.answeredAt !== undefined && `last answered ${span(now - p.answeredAt)} ago`,
  ].filter(Boolean).join('\n')

/** What a read now came to: `quota probe answered in 1.4s`, or why it has no answer. */
export const probedLine = (name: string, r: ReadNow) => (r.ok ? `${name} probe answered in ${(r.ms / 1000).toFixed(1)}s` : `${name} probe failed: ${r.error}`)
