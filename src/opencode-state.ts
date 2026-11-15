/**
 * Each opencode session's own state dir (its `XDG_STATE_HOME`): the TUI's preferences, which outrank the config the
 * tower composes, its prompt history and its tabs. A cache in the system's sense: the tower never reads it, nothing
 * resumes from it (opencode keeps conversations in its data dir), and every launch gets a fresh one, so the folder of a
 * session that isn't running is free to delete.
 */
import { readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { hostLive } from './machine.ts'
import type { SystemPaths } from './shared/model.ts'

const statesOf = (paths: SystemPaths) => path.join(paths.cache, 'opencode')

/** Session `id`'s state dir, which opencode makes as it starts. */
export const opencodeStateDir = (paths: SystemPaths, id: string): string => path.join(statesOf(paths), id)

/**
 * Every state dir whose session the host doesn't run, deleted, so a killed or crashed session leaves none behind. The
 * folders are listed before the host is asked: a folder listed was made by a session the host had started by then, so
 * one starting meanwhile is never swept.
 */
export const sweepOpencodeStates = async (paths: SystemPaths): Promise<void> => {
  let names: string[]
  try {
    names = readdirSync(statesOf(paths))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
  const live = await hostLive(paths)
  if (!live) return
  for (const name of names) if (!live.ids.has(name)) rmSync(path.join(statesOf(paths), name), { recursive: true, force: true })
}
