import { withoutParentSession, withoutTerminal } from '../shared/env.ts'
import { resolveCommand, type ClaudeHookInput, type Config, type ModEvent } from '../shared/model.ts'

/**
 * `modDir` is the tower mod (`src/mod`), which posts Claude's events to the host, read by each Claude as it starts.
 * `args` come last, so they can end with `-- <prompt>`. `command` names which of `argv`'s commands to run
 * (`resolveCommand`); left out, it resolves to the legacy array or the object's first.
 */
export const sessionArgv = (config: Config, args: string[], modDir: string, command?: string): string[] => [
  ...resolveCommand(config, command),
  '--plugin-dir',
  modDir,
  ...args,
]

/**
 * The config's `env` is scrubbed with the parent's: it could otherwise set a parent session's markers again. It may set
 * a terminal's variables: only the parent's terminal is dropped.
 */
export const sessionEnv = (parent: NodeJS.ProcessEnv, config: Config, id: string, hooksSocket: string): Record<string, string> => ({
  ...withoutParentSession({ ...withoutTerminal(parent), ...config.env }),
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
