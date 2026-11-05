/**
 * The floors extension: new floors from the tower, and the repos of one. `add` and `start` ready the floor's hub (a
 * folder already there, or a new repository with a first commit) and add `projects.<id>` through the core's
 * `config/add`, which checks the config with it and refuses an id already taken. `add-repo` and `remove-repo` change a
 * floor's `repos` through `config/append` and `config/remove`. Local git steps run through `ctx.run`, its env scrubbed
 * of the parent session.
 *
 * `clone` runs `git clone` as a job of the jobs daemon, so it outlives a restart of the tower, and records the clone it
 * started in floors' own stream. The board trigger reads the board's jobs: each clone that ended with exit 0 and whose
 * floor isn't added, refused or dismissed is handed to `adopt`, which adds the floor and records that it did
 * (`clones.ts`).
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Board } from '/lib/board.js'
import { apiError, type ApiError, type CallCtx, type Config, type FoldCtx, isApiError, type RunResult, type Start, type StartCtx } from '/lib/extension.js'
import { adoptCalls, asksOf, carriesCredentials, CLONES, clonesOf, holding, NO_CLONES, step, type Clone, type CloneStarted, type ClonesState } from './clones.ts'

/** How long a local git step may run. */
const GIT_MS = 30_000

/** A clone asks no one for a password or a host key: nothing types into a job, so a prompt fails it, saying so. */
const NO_PROMPT = { GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' }

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

  /** Floors' clones on the board now. */
  const clones = (c: StartCtx): Clone[] => clonesOf(c.own.streams(CLONES) as ClonesState, c.board().jobs, c.provides)

  /** One of floors' clones on the board, or why there is none. */
  const cloneOf = (c: StartCtx, job: string): Clone | ApiError =>
    clones(c).find((x) => x.job === job) ?? apiError('not_found', `No clone of floors is job "${job}" on the board: \`tower job list\` lists the jobs`)

  /** The clones being started now, before their fact is written: a second clone checked meanwhile sees them. */
  const starting = new Map<string, Pick<CloneStarted, 'id' | 'into'>>()

  /** Refused when a clone starting, running, or cloned and not added yet, holds the id or the folder. */
  const reserved = (c: StartCtx, id: string, into: string): ApiError | undefined => {
    const held = [...holding(c.own.streams(CLONES) as ClonesState, c.board().jobs, c.provides, Date.now()), ...starting.values()]
    if (held.some((x) => x.id === id)) return apiError('exists', `A clone in flight is for the floor "${id}": pick another id, or wait for it`)
    if (held.some((x) => x.into === into)) return apiError('exists', `A clone in flight goes into ${into}: pick another folder, or wait for it`)
    return undefined
  }

  /** The clone started as a job of floors, and recorded as floors' own fact. */
  const startClone = async (c: CallCtx, { id, name, url, into }: Omit<CloneStarted, 'job'>): Promise<{ t: 'started'; job: string } | ApiError> => {
    const parent = path.dirname(into)
    const key = `${id}\n${into}`
    starting.set(key, { id, into })
    try {
      mkdirSync(parent, { recursive: true })
      const job = (await c.jobs.start(['git', 'clone', '--', url, into], { cwd: parent, env: NO_PROMPT, label: `Clone ${url}` })).id
      await c.streams.append(CLONES, {}, 's', { job, id, name, url, into } satisfies CloneStarted)
      return { t: 'started', job }
    } catch (err) {
      const { code, message } = err as Error & { code?: ApiError['code'] }
      return apiError(code ?? 'internal', message)
    } finally {
      starting.delete(key)
    }
  }

  /** Adds in flight, so a trigger that fires again before one is recorded asks for nothing twice. */
  const adopting = new Set<string>()

  return {
    reduce: { [CLONES]: { init: NO_CLONES, step } },
    folds: {
      board: (board: Board, { own }: FoldCtx) => {
        const all = clonesOf(own.streams[CLONES] as ClonesState, board.jobs, ctx.provides)
        const asks = asksOf(all)
        return { x: { clones: all }, ...(asks.length && { asks }) }
      },
    },
    board: (_prev: Board, next: Board) => adoptCalls(((next.x?.[ctx.provides] as { clones?: Clone[] } | undefined)?.clones) ?? []),
    verbs: {
      clone: async ({ id, name, url, into }: { id: string; name: string; url: string; into: string }, c: CallCtx) => {
        if (carriesCredentials(url)) return apiError('refused', `${url} carries credentials, which the jobs log would keep: use a credential helper or an SSH key`)
        const dir = path.resolve(into)
        return idTaken(c, id) ?? reserved(c, id, dir) ?? takenWhy(dir) ?? startClone(c, { id, name, url, into: dir })
      },
      adopt: async ({ job }: { job: string }, c: CallCtx) => {
        const clone = cloneOf(c, job)
        if (isApiError(clone)) return clone
        if (clone.added) return { t: 'added', project: clone.added, hub: clone.into }
        if (clone.outcome !== 'cloned') return apiError('refused', `The clone of ${clone.url} hasn't cloned: it ${clone.outcome === 'running' ? 'is still running' : `came to ${clone.outcome}`}`)
        if (adopting.has(job)) return apiError('refused', `The floor for ${clone.url} is being added`)
        adopting.add(job)
        try {
          const added = await register(c, clone.id, clone.name, clone.into, [])
          const same = isApiError(added) && added.code === 'exists' && c.board().floors.some((f) => f.id === clone.id && f.hub === clone.into)
          if (isApiError(added) && !same) {
            await c.streams.append(CLONES, {}, 'r', { job, message: added.message })
            return added
          }
          await c.streams.append(CLONES, {}, 'a', { job, project: clone.id })
          return { t: 'added', project: clone.id, hub: clone.into }
        } finally {
          adopting.delete(job)
        }
      },
      cancel: async ({ job }: { job: string }, c: CallCtx) => {
        const clone = cloneOf(c, job)
        if (isApiError(clone)) return clone
        if (clone.outcome !== 'running') return apiError('refused', `The clone of ${clone.url} isn't running`)
        try {
          await c.jobs.cancel(job)
        } catch (err) {
          const { code, message } = err as Error & { code?: ApiError['code'] }
          return apiError(code ?? 'internal', message)
        }
        return { ok: true }
      },
      remove: async ({ job }: { job: string }, c: CallCtx) => {
        const clone = cloneOf(c, job)
        if (isApiError(clone)) return clone
        if (clone.outcome === 'running' || clone.outcome === 'cloned') return apiError('refused', `The clone of ${clone.url} ${clone.outcome === 'running' ? 'is running: cancel it first' : 'cloned: its folder is the floor\'s'}`)
        const dir = clone.into
        if (c.board().jobs.some((j) => j.state === 'running' && (j.cwd === dir || j.cwd.startsWith(`${dir}/`) || j.argv.includes(dir))))
          return apiError('refused', `A running job works in ${dir}: let it end first`)
        const within = (d: string) => d === dir || d.startsWith(`${dir}/`)
        if (c.board().floors.some((f) => within(f.hub) || f.repos.some(within))) return apiError('refused', `${dir} is, or holds, a floor's folder: remove it from the floor first`)
        if (!existsSync(dir)) return { ok: true }
        if (!isRepo(dir)) return apiError('refused', `${dir} holds no .git, so git didn't start it: remove it by hand if you mean to`)
        rmSync(dir, { recursive: true, force: true })
        return { ok: true }
      },
      retry: async ({ job }: { job: string }, c: CallCtx) => {
        const clone = cloneOf(c, job)
        if (isApiError(clone)) return clone
        if (clone.outcome === 'running' || clone.outcome === 'cloned') return apiError('refused', `The clone of ${clone.url} ${clone.outcome === 'running' ? 'is running' : 'cloned'}: nothing to retry`)
        const { id, name, url, into } = clone
        const refused = idTaken(c, id) ?? reserved(c, id, into) ?? takenWhy(into)
        if (refused) return { ...refused, message: `${refused.message}${existsSync(into) ? ': Remove deletes what the clone left' : ''}` }
        const started = await startClone(c, { id, name, url, into })
        if (!isApiError(started)) await c.streams.append(CLONES, {}, 'd', { job })
        return started
      },
      dismiss: async ({ job }: { job: string }, c: CallCtx) => {
        const clone = cloneOf(c, job)
        if (isApiError(clone)) return clone
        if (!clone.dismissed) await c.streams.append(CLONES, {}, 'd', { job })
        return { ok: true }
      },
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
        const i = repos.findIndex((r) => r === repo || path.resolve(r) === path.resolve(repo))
        if (i < 0) return apiError('not_found', `${repo} is not one of ${project}'s repos: they are ${repos.join(', ') || 'none'}`)
        const reply = await c.call('tower/config/remove', { key: ['projects', project, 'repos', String(i)], was: repos[i] })
        return isApiError(reply) ? reply : { t: 'removed', project, path: repos[i]! }
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
