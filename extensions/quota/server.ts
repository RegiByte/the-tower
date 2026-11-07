/**
 * The quota probe: reads each `argv` command's rate limits from Claude while no turn of that command does, each read
 * appended to its stream, `reads`, naming the command, an answer as a reading of kind `tower/rate-limits` the core
 * folds beside the turns'. A read only reads: it sends no prompt, starts no session and calls no verb.
 */
import os from 'node:os'
import { defaultLimits, limitsOf, type Board } from '/lib/board.js'
import { apiError, type Start, type StartCtx, type StreamFact } from '/lib/extension.js'
import { commandProbe, PROBE_STATE_NAME, probedLine, probedLines, probeLine, probeName } from './client/quota.ts'
import { commandLimitsLine, due, FLOOR_MS, NO_COMMAND_READS, periodMs, readOf, statusOf, stepByCommand, withReads, type Answered, type CommandStatus, type Failed, type QuotaPart, type Read, type ReadsByCommand } from './status.ts'
import { USAGE_ARGS, usageRan, usageReading, USAGE_REQUEST, USAGE_TIMEOUT_MS } from './usage.ts'

type Command = ReturnType<StartCtx['commands']>[number]

/**
 * Asks Claude for `/usage`'s data: the request is its only input, and it exits as its stdin closes. Run as the config
 * runs a session of that command (the same Claude, through any wrapper), from the temp dir, killed if it has not
 * exited within the timeout.
 */
const readUsage = async (ctx: StartCtx, { argv, env }: Command): Promise<{ answer: unknown } | { error: string }> => {
  try {
    return usageRan(await ctx.run([...argv, ...USAGE_ARGS], { cwd: os.tmpdir(), timeoutMs: USAGE_TIMEOUT_MS, stdin: `${JSON.stringify(USAGE_REQUEST)}\n`, env }))
  } catch (err) {
    return { error: (err as Error).message }
  }
}

/** What failed reads of a command say to do, by what failed: the command itself, Claude waiting on something, or anything else. */
const fixOf = (error: string, name: string | undefined): string => {
  const claude = name === undefined ? 'claude' : `argv.${name}'s command`
  return /ENOENT/.test(error)
    ? name === undefined
      ? "argv in the config names a command that isn't on the tower's PATH: fix argv"
      : `argv.${name} names a command that isn't on the tower's PATH: fix argv.${name}`
    : /no answer within/.test(error)
      ? `run ${claude} in a terminal: it may wait on an update, a sign-in or a trust prompt`
      : `run ${claude} in a terminal to see why it fails; the tower's log has the tower's side, and \`tower x quota probes\` follows the next read`
}

const turnsOf = (board: Board, name: string | undefined) => (name === undefined ? defaultLimits(board) : limitsOf(board, name))?.turnLimits

/** How late a read may start past its `nextAt`: the slot's minute and the floor between reads, with room to spare. */
const LATE_MS = 3 * 60_000

const start: Start = (ctx) => {
  const every = () => periodMs((ctx.settings as { every: string }).every)
  const commands = (all: ReadsByCommand) => withReads(all, ctx.commands('claude'))
  const statuses = (board: Board, all: ReadsByCommand): CommandStatus[] =>
    commands(all).map(({ name, reads }) => ({ ...(name !== undefined && { command: name }), ...statusOf(every(), reads, turnsOf(board, name)) }))
  const nowStatuses = () => statuses(ctx.board(), ctx.own.streams('reads') as ReadsByCommand)
  /** Whether a read is in flight, and when each command's last one started: whatever the stream says, a command's reads start at least `FLOOR_MS` apart. */
  let reading = false
  const started = new Map<string | undefined, number>()
  const flooredUntil = ({ name }: Command) => (started.get(name) ?? -Infinity) + FLOOR_MS

  const read = async (command: Command) => {
    const at = Date.now()
    started.set(command.name, at)
    const named = command.name === undefined ? {} : { command: command.name }
    const answer = await readUsage(ctx, command)
    const ms = Date.now() - at
    if ('error' in answer) {
      await ctx.streams.append('reads', {}, 'f', { ...named, ms, error: answer.error } satisfies Failed)
      return { ...named, at, ms, ok: false, error: answer.error }
    }
    await ctx.streams.append('reads', {}, 'u', { ...named, ms, answer: answer.answer, ...usageReading(answer.answer) } satisfies Answered)
    return { ...named, at, ms, ok: true }
  }

  /**
   * Reads each command in turn, so two accounts never run Claude at once and one failing doesn't stop the next. A stop
   * ends the walk: a read started after it could not be killed, and would run beside the next instance's.
   */
  const readInTurn = async (each: Command[]) => {
    reading = true
    try {
      const done = []
      for (const command of each) {
        if (ctx.signal.aborted) break
        done.push(await read(command))
      }
      return done
    } finally {
      reading = false
    }
  }

  return {
    reduce: { reads: { init: NO_COMMAND_READS, step: stepByCommand } },
    slots: {
      tick: async () => {
        if (reading) return
        const now = Date.now()
        const board = ctx.board()
        const dueNow = commands(ctx.own.streams('reads') as ReadsByCommand).filter(
          (command) => now >= flooredUntil(command) && due(every(), command.reads, turnsOf(board, command.name), now),
        )
        if (dueNow.length) await readInTurn(dueNow)
      },
    },
    folds: {
      board: (board: Board, { own }) => {
        const each = statuses(board, own.streams.reads as ReadsByCommand)
        const { command: _, ...first } = each[0]
        return { x: { ...first, commands: each } satisfies QuotaPart }
      },
    },
    verbs: {
      'read-now': async ({ command }: { command?: string }) => {
        if (reading) return apiError('refused', 'A read is in flight: one read at a time')
        const all = ctx.commands('claude')
        const asked = command === undefined ? all : all.filter((c) => c.name === command)
        if (!asked.length) return apiError('not_found', `No command "${command}": argv names ${all.map((c) => c.name ?? 'one unnamed command').join(', ')}`)
        const now = Date.now()
        const ready = asked.filter((c) => now >= flooredUntil(c))
        if (!ready.length) {
          const soonest = asked.reduce((a, c) => (flooredUntil(c) < flooredUntil(a) ? c : a))
          const reads = soonest.name === undefined ? 'Reads' : `Reads of ${soonest.name}`
          return apiError('refused', `${reads} start at least ${FLOOR_MS / 1000}s apart: the next can start in ${Math.ceil((flooredUntil(soonest) - now) / 1000)}s`)
        }
        const done = await readInTurn(ready)
        if (!done.length) return apiError('unavailable', 'The quota extension stopped before it read: `tower extensions` says how it stands')
        const answer = { ...done[0], commands: done }
        return { ...answer, said: probedLines(answer) }
      },
    },
    reads: {
      reads: async ({ query }: { query: { last?: string } }) => {
        const all: StreamFact[] = []
        for await (const fact of ctx.streams.read('reads', {})) all.push(fact)
        return { reads: all.flatMap((fact) => readOf(fact) ?? []).slice(-Number(query.last ?? 20)).reverse() }
      },
      said: async () => {
        const now = Date.now()
        const each = nowStatuses()
        const lastAts = each.flatMap((s) => s.lastAt ?? [])
        const last = new Map<string | undefined, Read>()
        if (lastAts.length)
          for await (const fact of ctx.streams.read('reads', {}, { from: Math.min(...lastAts) })) {
            const read = readOf(fact)
            if (read) last.set(read.command ?? each[0].command, read)
          }
        const line = each
          .map((s) => [probeLine(commandProbe(s), now), ...(s.state === 'new' ? [] : [PROBE_STATE_NAME[s.state]]), ...(s.error === undefined ? [] : [s.error])].join(' · '))
          .join('\n')
        const lastLines = each.flatMap((s) => {
          const read = last.get(s.command)
          return read ? [probedLine(probeName(s.command), read)] : []
        })
        return { line, ...(lastLines.length && { last: lastLines.join('\n') }) }
      },
      limits: () => {
        const now = Date.now()
        return { lines: ctx.board().limits.map((limits) => commandLimitsLine(limits, now)) }
      },
      status: () => {
        const now = Date.now()
        const each = nowStatuses()
        const problems = each.flatMap((s) => {
          const line = probeLine(commandProbe(s), now)
          if (s.error !== undefined) return [`${line}: ${s.failsInRow} failed in a row: ${s.error}: ${fixOf(s.error, s.command)}`]
          if (s.state === 'unavailable') return [`${line}: the account has no rate limits to read: sign in to Claude Code with a Claude subscription (claude, then /login): an API key or a cloud provider has none`]
          if (s.lastAt !== undefined && now - s.nextAt > LATE_MS) return [`${line}: overdue by ${Math.round((now - s.nextAt) / 60_000)}m: the tower's log says why`]
          return []
        })
        if (problems.length) return apiError('refused', problems.join('\n'))
        return { ok: true, message: each.map((s) => probeLine(commandProbe(s), now)).join('\n') }
      },
    },
  }
}

export default start
