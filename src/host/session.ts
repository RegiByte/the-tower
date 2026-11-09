import { withoutParentSession, withoutTerminal } from '../shared/env.ts'
import type { ClaudeHookInput, ModEvent } from '../shared/model.ts'
import { HOST_PROTOCOL, type ToHost } from '../shared/protocol.ts'

type Spawn = Extract<ToHost, { t: 'spawn' }>

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((s) => typeof s === 'string')

/**
 * Throws unless `msg` is a spawn this host takes. A spawn with `args` comes from a tower older than this host, which
 * composes only the spawn of an older protocol.
 */
export const checkSpawn = (msg: Spawn): void => {
  if ('args' in msg || !('argv' in msg)) throw new Error(`This host speaks protocol ${HOST_PROTOCOL}: a spawn carries runtime, argv and env, and the tower that sent this one is older than the host. Restart the tower: tower down tower, then tower up`)
  if (typeof msg.runtime !== 'string' || !msg.runtime) throw new Error(`A spawn's runtime is a name, not ${JSON.stringify(msg.runtime)}`)
  if (!isStrings(msg.argv) || !msg.argv.length) throw new Error(`A spawn's argv is a command and its arguments, strings, not ${JSON.stringify(msg.argv)}`)
  if (typeof msg.env !== 'object' || msg.env === null || Array.isArray(msg.env) || !isStrings(Object.values(msg.env))) throw new Error(`A spawn's env maps names to strings, not ${JSON.stringify(msg.env)}`)
  if (msg.command !== undefined && typeof msg.command !== 'string') throw new Error(`A spawn's command is a name, not ${JSON.stringify(msg.command)}`)
}

/**
 * The env a spawn gives is scrubbed with the parent's: it could otherwise set a parent session's markers again. It may
 * set a terminal's variables: only the parent's terminal is dropped.
 */
export const sessionEnv = (parent: NodeJS.ProcessEnv, given: Record<string, string>, id: string, hooksSocket: string): Record<string, string> => ({
  ...withoutParentSession({ ...withoutTerminal(parent), ...given }),
  TOWER_SESSION_ID: id,
  TOWER_HOOKS_SOCKET: hooksSocket,
})

/**
 * What a hook event is logged as. `PostToolUse` leaves out `tool_response`: whatever the tool returned (file contents,
 * command output, secrets read from `.env` files), most of a log's bytes, read by nothing, and kept in Claude's own
 * transcript.
 */
export const hookFact = (input: ClaudeHookInput | ModEvent): ClaudeHookInput | ModEvent => {
  if (input.hook_event_name !== 'PostToolUse') return input
  const { tool_response, ...fact } = input
  return fact
}

/** Seconds since `startedAt`, at millisecond precision. */
export const elapsed = (startedAt: number, now: number): number => Math.round(now - startedAt) / 1000
