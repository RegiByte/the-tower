/**
 * How the `tower` command fails. An expected failure (a usage slip, a name that isn't there, a refusal) is a
 * `CliError` or a `ConfigError`, printed as one line with its fix; anything else is a bug and keeps its stack.
 */
import { ConfigError } from './shared/model.ts'

/** A failure the command expects, its `fix` the one thing to do about it when there is one. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly fix?: string,
  ) {
    super(message)
  }
}

const CONFIG_FIX = '`tower config check` lists every problem in the config'

/** Prints an expected failure as one line and exits 1; rethrows any other. */
export const reported = (err: unknown): void => {
  if (!(err instanceof CliError || err instanceof ConfigError)) throw err
  const fix = err instanceof CliError ? err.fix : CONFIG_FIX
  console.error(`tower: ${err.message}${fix ? `\n  → ${fix}` : ''}`)
  process.exitCode = 1
}
