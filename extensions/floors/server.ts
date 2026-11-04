/**
 * The floors extension: new floors from the tower. Each verb readies the floor's hub (a folder already there, a clone,
 * or a new repository with a first commit) and adds `projects.<id>` through the core's `config/add`, which checks the
 * config with it and refuses an id already taken. Git runs through `ctx.run`, its env scrubbed of the parent session,
 * with no terminal to ask for a password on.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apiError, isApiError, type ApiError } from '../../src/shared/api.ts'
import type { CallCtx, RunResult, Start } from '../../src/shared/extensions.ts'

/** How long a clone may run before it is killed. */
const CLONE_MS = 10 * 60_000
/** How long a local git step may run. */
const GIT_MS = 30_000
/** A clone asks no one for a password: it fails, saying so. */
const NO_PROMPT = { GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' }

type Settings = { root?: string }
type Added = { t: 'added'; project: string; hub: string }

const isDir = (dir: string) => existsSync(dir) && statSync(dir).isDirectory()
const isRepo = (dir: string) => existsSync(path.join(dir, '.git'))

/** The end of what git said, for a message: its last lines of stderr, else stdout. */
const saidBy = (r: RunResult) => (r.stderr.trim() || r.stdout.trim()).split('\n').slice(-4).join(' ')

/** Why a folder can't be made a new project's or a clone's: it holds something already. */
const takenWhy = (dir: string): ApiError | undefined => {
  if (!existsSync(dir)) return undefined
  if (!statSync(dir).isDirectory()) return apiError('exists', `${dir} is a file: pick a folder that doesn't exist yet`)
  return readdirSync(dir).length ? apiError('exists', `${dir} isn't empty: pick a folder that doesn't exist yet, or add it as an existing folder`) : undefined
}

const start: Start = (ctx) => {
  const root = () => (ctx.settings as Settings | undefined)?.root ?? os.homedir()

  /** `projects.<id>` added for the hub, through the core, which refuses an id the config has. */
  const register = async (c: CallCtx, id: string, name: string, hub: string): Promise<Added | ApiError> => {
    const reply = await c.call('tower/config/add', { key: ['projects', id], value: { name, hub, repos: [] } })
    return isApiError(reply) ? reply : { t: 'added', project: id, hub }
  }

  /** Refused before any folder is made when the id is taken, so a clone isn't fetched for nothing. */
  const idTaken = (c: CallCtx, id: string): ApiError | undefined =>
    c.board().floors.some((f) => f.id === id) ? apiError('exists', `A floor "${id}" is already in the config: pick another id`) : undefined

  /** A refusal after the folder was made: the folder stays, and how to finish is said. */
  const after = (dir: string, err: ApiError): ApiError => ({ ...err, message: `${err.message}. ${dir} is ready: add it as an existing folder once that is fixed` })

  const git = (c: CallCtx, argv: string[], cwd: string, timeoutMs = GIT_MS, env?: Record<string, string>) => c.run(['git', ...argv], { cwd, timeoutMs, ...(env && { env }) })

  return {
    verbs: {
      add: async ({ id, name, hub }: { id: string; name: string; hub: string }, c: CallCtx) => {
        const dir = path.resolve(hub)
        if (!isDir(dir)) return apiError('not_found', `${dir} is no folder on this machine: pick one that exists, or clone or start a project there`)
        return idTaken(c, id) ?? register(c, id, name, dir)
      },
      clone: async ({ id, name, url, into }: { id: string; name: string; url: string; into: string }, c: CallCtx) => {
        const dir = path.resolve(into)
        const refused = idTaken(c, id) ?? takenWhy(dir)
        if (refused) return refused
        mkdirSync(path.dirname(dir), { recursive: true })
        const r = await git(c, ['clone', '--', url, dir], path.dirname(dir), CLONE_MS, NO_PROMPT)
        if (r.timedOut) return apiError('refused', `git clone of ${url} ran past ${CLONE_MS / 60_000} minutes and was stopped`)
        if (r.exit !== 0) return apiError('refused', `git clone of ${url} failed: ${saidBy(r)}`)
        const added = await register(c, id, name, dir)
        return isApiError(added) ? after(dir, added) : added
      },
      start: async ({ id, name, into }: { id: string; name: string; into: string }, c: CallCtx) => {
        const dir = path.resolve(into)
        const refused = idTaken(c, id) ?? takenWhy(dir)
        if (refused) return refused
        mkdirSync(dir, { recursive: true })
        const init = await git(c, ['init'], dir)
        if (init.exit !== 0) return apiError('refused', `git init in ${dir} failed: ${saidBy(init)}`)
        writeFileSync(path.join(dir, 'README.md'), `# ${name}\n`)
        const first = await git(c, ['add', 'README.md'], dir)
        const commit = first.exit === 0 ? await git(c, ['commit', '-m', `Start ${name}`], dir) : first
        if (commit.exit !== 0)
          return apiError('refused', `The first commit in ${dir} failed: ${saidBy(commit)}. Commit there by hand (git needs user.name and user.email), then add it as an existing folder`)
        const added = await register(c, id, name, dir)
        return isApiError(added) ? after(dir, added) : added
      },
    },
    reads: {
      dirs: ({ query }: { query: { path?: string } }) => {
        const dir = path.resolve(query.path ?? root())
        if (!isDir(dir)) return apiError('not_found', `${dir} is no folder on this machine`)
        const dirs = readdirSync(dir, { withFileTypes: true })
          .filter((e) => !e.name.startsWith('.') && (e.isDirectory() || (e.isSymbolicLink() && isDir(path.join(dir, e.name)))))
          .map((e) => ({ name: e.name, git: isRepo(path.join(dir, e.name)) }))
          .sort((a, b) => a.name.localeCompare(b.name))
        const parent = path.dirname(dir)
        return { path: dir, ...(parent !== dir && { parent }), root: root(), git: isRepo(dir), dirs }
      },
    },
  }
}

export default start
