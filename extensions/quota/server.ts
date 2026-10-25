/**
 * The quota probe: reads the account's rate limits from Claude while no session's turn does, each read appended to
 * its stream, `reads`, an answer as a reading of kind `tower/rate-limits` the core folds beside the turns'. A read only
 * reads: it sends no prompt, starts no session and calls no verb.
 */
import os from 'node:os'
import type { Board } from '../../src/bridge/board.ts'
import { apiError } from '../../src/shared/api.ts'
import type { Start, StartCtx, StreamFact } from '../../src/shared/extensions.ts'
import { probeLine } from '../../src/shared/limits.ts'
import { USAGE_ARGS, usageRan, usageReading, USAGE_REQUEST, USAGE_TIMEOUT_MS } from '../../src/shared/rate-limits.ts'
import { due, FLOOR_MS, NO_READS, periodMs, readOf, statusOf, step, type Answered, type Failed, type Reads } from './status.ts'

/**
 * Asks Claude for `/usage`'s data: the request is its only input, and it exits as its stdin closes. Run as the config
 * runs a session (the same Claude, through any wrapper), from the temp dir, killed if it has not exited within the timeout.
 */
const readUsage = async (ctx: StartCtx): Promise<{ answer: unknown } | { error: string }> => {
  const { argv, env } = ctx.runtime('claude')
  try {
    return usageRan(await ctx.run([...argv, ...USAGE_ARGS], { cwd: os.tmpdir(), timeoutMs: USAGE_TIMEOUT_MS, stdin: `${JSON.stringify(USAGE_REQUEST)}\n`, env }))
  } catch (err) {
    return { error: (err as Error).message }
  }
}

/** What failed reads say to do, by what failed: the command, Claude waiting on something, or anything else. */
const fixOf = (error: string): string =>
  /ENOENT/.test(error)
    ? "argv in the config names a command that isn't on the tower's PATH: fix argv"
    : /no answer within/.test(error)
      ? 'run claude in a terminal: it may wait on an update, a sign-in or a trust prompt'
      : "run claude in a terminal to see why it fails; the tower's log has the tower's side, and `tower probes` follows the next read"

/** How late a read may start past its `nextAt`: the slot's minute and the floor between reads, with room to spare. */
const LATE_MS = 3 * 60_000

const start: Start = (ctx) => {
  const every = () => periodMs((ctx.settings as { every: string }).every)
  const reads = () => ctx.own.streams('reads') as Reads
  const status = () => statusOf(every(), reads(), ctx.board().turnLimits)
  /** The one read in flight, and when the last one started: whatever the stream says, reads start at least `FLOOR_MS` apart. */
  let reading = false
  let lastStart = -Infinity

  const read = async () => {
    reading = true
    const at = Date.now()
    lastStart = at
    try {
      const answer = await readUsage(ctx)
      const ms = Date.now() - at
      if ('error' in answer) {
        await ctx.streams.append('reads', {}, 'f', { ms, error: answer.error } satisfies Failed)
        return { at, ms, ok: false, error: answer.error }
      }
      await ctx.streams.append('reads', {}, 'u', { ms, answer: answer.answer, ...usageReading(answer.answer) } satisfies Answered)
      return { at, ms, ok: true }
    } finally {
      reading = false
    }
  }

  return {
    reduce: { reads: { init: NO_READS, step } },
    slots: {
      tick: async () => {
        if (reading || Date.now() - lastStart < FLOOR_MS) return
        if (due(every(), reads(), ctx.board().turnLimits, Date.now())) await read()
      },
    },
    folds: { board: (board: Board, { own }) => ({ x: statusOf(every(), own.streams.reads as Reads, board.turnLimits) }) },
    verbs: {
      'read-now': async () => {
        if (reading) return apiError('refused', 'A read is in flight: one read at a time')
        const now = Date.now()
        if (now - lastStart < FLOOR_MS) return apiError('refused', `Reads start at least ${FLOOR_MS / 1000}s apart: the next can start in ${Math.ceil((lastStart + FLOOR_MS - now) / 1000)}s`)
        return read()
      },
    },
    reads: {
      reads: async ({ query }: { query: { last?: string } }) => {
        const all: StreamFact[] = []
        for await (const fact of ctx.streams.read('reads', {})) all.push(fact)
        return { reads: all.flatMap((fact) => readOf(fact) ?? []).slice(-Number(query.last ?? 20)).reverse() }
      },
      status: () => {
        const now = Date.now()
        const s = status()
        const line = probeLine({ name: 'quota', ...s }, now)
        if (s.error !== undefined) return apiError('refused', `${line}: ${s.failsInRow} failed in a row: ${s.error}: ${fixOf(s.error)}`)
        if (s.state === 'unavailable')
          return apiError('refused', `${line}: the account has no rate limits to read: sign in to Claude Code with a Claude subscription (claude, then /login): an API key or a cloud provider has none`)
        if (s.lastAt !== undefined && now - s.nextAt > LATE_MS) return apiError('refused', `${line}: overdue by ${Math.round((now - s.nextAt) / 60_000)}m: the tower's log says why`)
        return { ok: true, message: line }
      },
    },
  }
}

export default start
