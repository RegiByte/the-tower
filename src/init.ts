/** `tower init`: the first config of a system, its first project from directories on this machine. */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Config } from './shared/model.ts'
import { REVIEWS } from './shared/reviews.ts'
import { CliError } from './cli-error.ts'

/** A project id is one path segment of the tower's routes. */
const projectId = (dir: string): string => path.basename(dir).toLowerCase().replace(/[^\w-]+/g, '-')

/** Sessions start in `hub`, `repos` are added beside it; `user`, when known, signs the user's review notes. */
export const initialConfig = (hub: string, repos: string[], user: string | undefined): Config => ({
  argv: ['claude'],
  env: {},
  port: 4317,
  projects: { [projectId(hub)]: { name: path.basename(hub), hub, repos } },
  collections: {
    drafts: { label: 'Drafts', description: 'Prompts kept for later: each starts a new session or is typed into a worker, then is deleted.' },
    [REVIEWS]: { label: 'Reviews', description: 'One review thread per checkout, written only with `tower note`: not a place for write-ups.' },
  },
  ...(user ? { user: { name: user } } : {}),
})

/** `git config user.name` exits 1 when it is unset. */
const gitUserName = async (): Promise<string | undefined> => {
  try {
    return (await promisify(execFile)('git', ['config', 'user.name'], { encoding: 'utf8' })).stdout.trim() || undefined
  } catch (err) {
    if ((err as { code?: unknown }).code === 1) return undefined
    throw err
  }
}

const directory = (dir: string): string => {
  const full = path.resolve(dir)
  if (!existsSync(full) || !statSync(full).isDirectory()) throw new CliError(`${full} is not a directory`)
  return full
}

/** Writes the config at `file` from the hub and repo directories given; a config already there is never touched. */
export const init = async (file: string, hub: string, repos: string[]): Promise<Config> => {
  if (existsSync(file)) throw new CliError(`${file} exists: tower init writes a first config only`, "edit it by hand and check it with `tower config check`, or move it away to start over")
  const config = initialConfig(directory(hub), repos.map(directory), await gitUserName())
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' })
  return config
}
