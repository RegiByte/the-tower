import type { Card, Floor, TidyPlan } from '../bridge/board.ts'
import type { Call, Replies } from './api.ts'
import { commandName, sizeOf, span } from './format.ts'
import { STATUS_NAME } from './status-words.ts'

/** What a floor's Tidy would do and did, row by row, and what workers left running. */

/** What a floor's workers left running, each process with its worker: the oldest worker first, then by pid. */
export const leftoversOf = (f: Floor) =>
  [...f.cards].sort((a, b) => a.startedAt - b.startedAt).flatMap((card) => [...card.resources].sort((a, b) => a.pid - b.pid).map((resource) => ({ card, resource })))

const counted = (n: number, one: string, many: string) => (n ? [`${n} ${n === 1 ? one : many}`] : [])

/** A floor's Tidy in a line, before the press: `Tidy: 4 leftovers, 2 finished hires`. */
export const tidyLine = ({ worktrees, branches, threads, prune, logs, streams }: TidyPlan) => {
  const parts = [
    ...counted(prune.filter((p) => p.t === 'reap').length, 'leftover', 'leftovers'),
    ...counted(prune.filter((p) => p.t === 'kill').length, 'finished hire', 'finished hires'),
    ...counted(worktrees.length, 'worktree', 'worktrees'),
    ...counted(branches.length, 'merged branch', 'merged branches'),
    ...counted(threads.length, 'landed thread', 'landed threads'),
    ...counted(logs.length, 'old log', 'old logs'),
    ...counted(streams.length, 'closed stream month', 'closed stream months'),
  ]
  return parts.length ? `Tidy: ${parts.join(', ')}` : 'nothing to tidy'
}

export const KILL_COST = 'resumable, but its next turn reads the whole conversation again, uncached'

/**
 * Each thing a floor's Tidy would do, as a row: what it is, what happens to it, and the call that does only that, the
 * floor's plan cut down to this row (`POST /tidy` applies any part of the plan as listed).
 */
export type TidyRow = { what: string; does: string; title: string; call: Call<'tidy'> }

const NOTHING: TidyPlan = { worktrees: [], branches: [], threads: [], prune: [], logs: [], streams: [] }

export const tidyRows = (f: Floor, now: number): TidyRow[] => {
  const card = (id: string) => f.cards.find((c) => c.id === id)!
  const only = (part: Partial<TidyPlan>): Call<'tidy'> => ['tidy', { project: f.id, plan: { ...NOTHING, ...part } }]
  return [
    ...f.tidy.prune.map((p): TidyRow => {
      const c = card(p.id)
      const call = only({ prune: [p] })
      if (p.t === 'kill')
        return { what: c.callsign, does: `kill · landed, ${c.waiting || c.waitsOn ? 'answer unread, ' : ''}${STATUS_NAME[c.status]} ${span(now - p.since)}`, title: `${c.callsign}, hired by ${c.hiredBy!.callsign}: its work has landed and it has sat ${STATUS_NAME[c.status]} for ${span(now - p.since)}. Killed, ${KILL_COST}`, call }
      const r = c.resources.find((r) => r.pid === p.pid)!
      return { what: `${p.pid} ${commandName(r.command)}`, does: `reap · ${c.callsign}`, title: `${r.command}\nleft running by ${c.callsign}, ${STATUS_NAME[c.status]}${r.orphan ? '; orphaned' : ''}`, call }
    }),
    ...f.tidy.worktrees.map((name) => ({ what: `⎇ ${name}`, does: 'remove worktree', title: 'nothing would be lost: clean, and its branch is pushed or absorbed', call: only({ worktrees: [name] }) })),
    ...f.tidy.branches.map((name) => ({ what: `⎇ ${name}`, does: 'delete merged branch', title: 'absorbed into its base', call: only({ branches: [name] }) })),
    ...f.tidy.threads.map((checkout) => ({ what: `◇ ${checkout}`, does: 'file landed thread', title: `its work has landed: filed as ${checkout}@<time>.md`, call: only({ threads: [checkout] }) })),
    ...(f.tidy.logs.length ? [{ ...oldLogsRow(f.tidy.logs), call: only({ logs: f.tidy.logs }) }] : []),
    ...(f.tidy.streams.length ? [{ ...oldStreamsRow(f.tidy.streams), call: only({ streams: f.tidy.streams }) }] : []),
  ]
}

/** The system's stream months Tidy would archive, in one row: every floor's Tidy lists them. */
const oldStreamsRow = (streams: TidyPlan['streams']): Omit<TidyRow, 'call'> => {
  const n = `${streams.length} closed stream ${streams.length === 1 ? 'month' : 'months'}`
  return {
    what: `▤ ${n}`,
    does: `archive · ${sizeOf(streams.reduce((sum, m) => sum + m.bytes, 0))}`,
    title: `${n} of the tower's own logs (${streams.map((m) => m.file).join(', ')}), closed more than retention.days ago, gzipped in place: the limits and the budget read the same`,
  }
}

/** The logs Tidy would archive, in one row: a floor can hold hundreds. */
const oldLogsRow = (logs: TidyPlan['logs']): Omit<TidyRow, 'call'> => {
  const n = `${logs.length} old ${logs.length === 1 ? 'log' : 'logs'}`
  return {
    what: `▤ ${n}`,
    does: `archive · ${sizeOf(logs.reduce((sum, l) => sum + l.bytes, 0))}`,
    title: `${n} of workers that ended more than retention.days ago, gzipped in place: cards, briefs, screens and stats read the same`,
  }
}


/** What Tidy did, in a line. */
export const tidiedLine = (r: Replies['tidy']) => {
  const done = [
    ...counted(r.reaped.length, 'process reaped', 'processes reaped'),
    ...counted(r.killed.length, 'hire killed', 'hires killed'),
    ...r.removed,
    ...r.deleted,
    ...r.threads.map((t) => `thread ${t}`),
    ...counted(r.archived.length, 'log archived', 'logs archived'),
    ...counted(r.streams.length, 'stream month archived', 'stream months archived'),
  ]
  const line = done.length ? `tidied: ${done.join(', ')}` : 'nothing to tidy'
  return r.skipped.length ? `${line}; skipped ${r.skipped.join('; ')}` : line
}

/** What a renderer asks before ending everything a worker left running. */
export const reapAsk = (c: Card) => `End what ${c.callsign} left running?\n\n${c.resources.map((r) => `${r.pid}  ${r.command}`).join('\n')}`

/** What a renderer asks before doing one of Tidy's rows, or all of them. */
export const tidyRowAsk = (r: TidyRow) => `${r.what}: ${r.does}?\n\n${r.title}`
export const tidyAllAsk = (f: Floor, now: number) => `${tidyLine(f.tidy)}\n\n${tidyRows(f, now).map((r) => `${r.what}: ${r.does}`).join('\n')}\n\nDo all of it?`
