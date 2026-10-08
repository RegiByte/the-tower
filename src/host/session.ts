import { withoutParentSession } from '../shared/env.ts'
import type { ClaudeHookInput, Config, ModEvent } from '../shared/model.ts'

/**
 * The project's other directories are granted file access only: their CLAUDE.md and `.claude/` skills, commands and
 * agents stay out of the session, so a skill copied into several repos shows up once.
 */
const sessionSettings = (additionalDirectories: string[]) => ({ permissions: { additionalDirectories } })

/**
 * `dirs` are the session's directories, its own first (`sessionDirs`). `modDir` is the tower mod (`src/mod`),
 * which posts Claude's events to the host, read by each Claude as it starts. Only the directory the session starts in
 * configures Claude. `args` come last, so they can end with `-- <prompt>`.
 */
export const sessionArgv = (config: Config, [, ...others]: string[], args: string[], modDir: string): string[] => [
  ...config.argv,
  '--settings',
  JSON.stringify(sessionSettings(others)),
  '--plugin-dir',
  modDir,
  ...args,
]

/** The config's `env` is scrubbed with the parent's: it could otherwise set a parent session's markers again. */
export const sessionEnv = (parent: NodeJS.ProcessEnv, config: Config, id: string, hooksSocket: string): Record<string, string> => ({
  ...withoutParentSession({ ...parent, ...config.env }),
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
