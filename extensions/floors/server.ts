/**
 * The floors extension: new floors from the tower, and the repos of one. `add` and `start` ready the floor's hub (a
 * folder already there, or a new repository with a first commit) and add `projects.<id>` through the core's
 * `config/add`, which checks the config with it and refuses an id already taken. `add-repo` and `remove-repo` change a
 * floor's `repos` through `config/append` and `config/remove`. Git runs through `ctx.run`, its env scrubbed of the
 * parent session.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apiError, isApiError, type ApiError } from '../../src/shared/api.ts'
import type { CallCtx, RunResult, Start } from '../../src/shared/extensions.ts'
import type { Config } from '../../src/shared/model.ts'

/** How long a local git step may run. */
const GIT_MS = 30_000

type Settings = { root?: string }
type Added = { t: 'added'; project: string; hub: string }
type RepoChanged = { t: 'added' | 'unchanged' | 'removed'; project: string; path: string }

const isDir = (dir: string) => existsSync(dir) && statSync(dir).isDirectory()
const isRepo = (dir: string) => existsSync(path.join(dir, '.git'))

/** The end of what git said, for a message: its last lines of stderr, else stdout. */
const saidBy = (r: RunResult) => (r.stderr.trim() || r.stdout.trim()).split('\n').slice(-4).join(' ')

/** Why a folder can't be made a new project's: it holds something already. */
const takenWhy = (dir: string): ApiError | undefined => {
  if (!existsSync(dir)) return undefined
  if (!statSync(dir).isDirectory()) return apiError('exists', `${dir} is a file: pick a folder that doesn't exist yet`)
  return readdirSync(dir).length ? apiError('exists', `${dir} isn't empty: pick a folder that doesn't exist yet, or add it as an existing folder`) : undefined
}

/** Why `dir` can't be a repo of the floor whose hub is `hub`: a folder that isn't there, or the hub itself. */
const repoRefused = (dir: string, hub: string): ApiError | undefined => {
  if (!isDir(dir)) return apiError('not_found', `${dir} is no folder on this machine: pick one that exists`)
  if (dir === hub) return apiError('refused', `${dir} is the floor's hub, where its sessions work already: pick another folder as a repo`)
  return undefined
}

/** The first repo named twice, a repo that isn't a folder, or one that is the hub. */
const reposRefused = (repos: string[], hub: string): ApiError | undefined => {
  const twice = repos.find((dir, i) => repos.indexOf(dir) !== i)
  if (twice !== undefined) return apiError('invalid', `${twice} is named twice in repos: name each folder once`)
  for (const dir of repos) {
    const refused = repoRefused(dir, hub)
    if (refused) return refused
  }
  return undefined
}

const start: Start = (ctx) => {
  const root = () => (ctx.settings as Settings | undefined)?.root ?? os.homedir()

  /** `projects.<id>` added for the hub and its repos, through the core, which refuses an id the config has. */
  const register = async (c: CallCtx, id: string, name: string, hub: string, repos: string[]): Promise<Added | ApiError> => {
    const reply = await c.call('tower/config/add', { key: ['projects', id], value: { name, hub, repos } })
    return isApiError(reply) ? reply : { t: 'added', project: id, hub }
  }

  /** Refused before any folder is made when the id is taken. */
  const idTaken = (c: CallCtx, id: string): ApiError | undefined =>
    c.board().floors.some((f) => f.id === id) ? apiError('exists', `A floor "${id}" is already in the config: pick another id`) : undefined

  /** The floor's hub, as the board has it, or why there is none. */
  const hubOf = (c: CallCtx, project: string): string | ApiError =>
    c.board().floors.find((f) => f.id === project)?.hub ?? apiError('not_found', `No floor "${project}" is on the board: \`tower x floors\` adds one`)

  /** A refusal after the folder was made: the folder stays, and how to finish is said. */
  const after = (dir: string, err: ApiError): ApiError => ({ ...err, message: `${err.message}. ${dir} is ready: add it as an existing folder once that is fixed` })

  const git = (c: CallCtx, argv: string[], cwd: string) => c.run(['git', ...argv], { cwd, timeoutMs: GIT_MS })

  return {
    verbs: {
      add: async ({ id, name, hub, repos = [] }: { id: string; name: string; hub: string; repos?: string[] }, c: CallCtx) => {
        const dir = path.resolve(hub)
        if (!isDir(dir)) return apiError('not_found', `${dir} is no folder on this machine: pick one that exists, or start a project there`)
        const dirs = repos.map((r) => path.resolve(r))
        return idTaken(c, id) ?? reposRefused(dirs, dir) ?? register(c, id, name, dir, dirs)
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
        const added = await register(c, id, name, dir, [])
        return isApiError(added) ? after(dir, added) : added
      },
      'add-repo': async ({ project, path: repo }: { project: string; path: string }, c: CallCtx): Promise<RepoChanged | ApiError> => {
        const hub = hubOf(c, project)
        if (isApiError(hub)) return hub
        const dir = path.resolve(repo)
        const refused = repoRefused(dir, hub)
        if (refused) return refused
        const reply = await c.call('tower/config/append', { key: ['projects', project, 'repos'], value: dir })
        if (isApiError(reply)) return reply
        return { t: (reply as { t: string }).t === 'unchanged' ? 'unchanged' : 'added', project, path: dir }
      },
      'remove-repo': async ({ project, path: repo }: { project: string; path: string }, c: CallCtx): Promise<RepoChanged | ApiError> => {
        const config = (await c.read('tower/config')) as Config | ApiError
        if (isApiError(config)) return config
        const repos = Object.hasOwn(config.projects, project) ? config.projects[project]!.repos : undefined
        if (!repos) return apiError('not_found', `No floor "${project}" is in the config: \`tower x floors\` adds one`)
        const i = repos.indexOf(repo)
        if (i < 0) return apiError('not_found', `${repo} is not one of ${project}'s repos: they are ${repos.join(', ') || 'none'}`)
        const reply = await c.call('tower/config/remove', { key: ['projects', project, 'repos', String(i)], was: repo })
        return isApiError(reply) ? reply : { t: 'removed', project, path: repo }
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
