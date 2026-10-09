/**
 * The tower's worktrees, through git: reading them, cutting a name's worktree in every repo of a project, restoring a
 * lost one, removing what would lose nothing or landed edited, and discarding what never landed. Git is the only store; what its output means is decided in
 * `src/bridge/worktrees.ts`.
 *
 * Every verb fetches first and re-checks what it was offered on: the board is up to 5 s old, and its remote refs as
 * old as the last fetch. Verbs at once in a repo share its fetch (`fetchOrigin`). Only `discard` throws work away, as
 * shown and once its tips are noted: removal runs without `--force`, a branch is deleted only when it is absorbed into
 * its base or carried there, and a branch is rolled back only when it was cut in the same request. A branch is deleted
 * only while it is still at the commit the read judged; one that moved is kept and named in the verb's `kept`.
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  carriedOf,
  copiesOf,
  floorBranches,
  floorWorktrees,
  parseTowerRecords,
  parseWorktreeList,
  towerTreeName,
  type BranchRead,
  type Exposure,
  type Mark,
  type FloorBranch,
  type FloorWorktree,
  type LandingRead,
  type Occupant,
  type RepoRead,
  type MainRead,
  type Tip,
  type TowerRecord,
  type TreeRead,
  type WorktreeState,
} from './bridge/worktrees.ts'
import { git, gitWith, GitTimeout, run } from './git.ts'
import type { ErrorCode } from './shared/api.ts'
import { worktreeBrief, type WorktreeBrief } from './shared/launch.ts'
import { checkoutDirs, MAIN_CHECKOUT, projectDirs, worktreeName, worktreePath, WORKTREES_DIR, type Project } from './shared/model.ts'

/** A fetch longer than this counts as offline: a base must be fresh. */
const FETCH_TIMEOUT_MS = 10_000
/** Files and commits named per repo when work is at risk. */
const RISK_LINES = 5

/** A verb git or the tower refused, with the API error it answers as. */
export class WorktreeError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

/** Git that answers yes (0) or no (1). */
const ask = async (dir: string, args: string[]): Promise<boolean> => {
  const r = await run(dir, args)
  if (r.code > 1) throw new Error(`git ${args.join(' ')} in ${dir}: ${r.stderr.trim()}`)
  return r.code === 0
}

/** Git whose any failure means no: whether a dir is a repo, has a remote, takes a branch name. */
const succeeds = async (dir: string, args: string[]): Promise<boolean> => (await run(dir, args)).code === 0

export const isRepo = async (dir: string) => existsSync(dir) && (await succeeds(dir, ['rev-parse', '--git-dir']))

const lines = (out: string) => out.split('\n').filter(Boolean)

/** A ref's object, `undefined` when there is no such ref. */
const resolve = async (dir: string, rev: string): Promise<string | undefined> => {
  const r = await run(dir, ['rev-parse', '-q', '--verify', rev])
  return r.code === 0 ? r.stdout.trim() : undefined
}

/** Merging `rev` into `base` would change nothing. A conflict is not absorbed. */
const mergesToNothing = async (dir: string, rev: string, base: string, baseTree: string): Promise<boolean> => {
  const merged = await run(dir, ['merge-tree', '--write-tree', base, rev])
  if (merged.code > 1) throw new Error(`git merge-tree ${base} ${rev} in ${dir}: ${merged.stderr.trim()}`)
  return merged.code === 0 && merged.stdout.split('\n')[0] === baseTree
}

/**
 * Every commit of `rev` missing from `base` and every commit only `base` has, marked (`Mark`): `=` an equal patch
 * (`git patch-id`) on the other side. A merge commit has no patch-id, so it is never `=`.
 */
const marksOf = async (dir: string, rev: string, base: string): Promise<Mark[]> =>
  lines(await git(dir, ['log', '--left-right', '--cherry-mark', '--date=raw', '--format=%m%x00%H%x00%ct%x00%an <%ae> %ad %s', `${base}...${rev}`])).map((l) => {
    const [side, commit, committed, made] = l.split('\0')
    return { side: side as Mark['side'], commit, committed: Number(committed), made }
  })

/** The commits of `rev` missing from `base`. */
const missingFrom = async (dir: string, rev: string, base: string) => Number(await git(dir, ['rev-list', '--count', `${base}..${rev}`]))

/** Whether `rev` is in `base`: `absorbed` exactly, or `carried` there as copies, some edited. */
type Landing = Pick<Exposure, 'absorbed' | 'carried'>

/** Landings by `dir`, `rev`'s commit and `base`'s commit: a pair of commits always gives the same answer. */
const landings = new Map<string, Landing>()
/** Landings kept before they are all forgotten: every new commit on a base makes new pairs. */
const LANDINGS = 1024

/**
 * `rev`'s changes are already in `base`: absorbed when merging it would change nothing, or each of its commits landed
 * there as an equal patch; else carried when each landed as an equal patch or a copy (`copiesOf`). No base is neither.
 */
const landing = async (dir: string, rev: string, base: string | undefined): Promise<Landing> => {
  const baseTree = base && (await resolve(dir, `${base}^{tree}`))
  if (!baseTree) return { absorbed: false }
  const key = `${dir}\0${(await git(dir, ['rev-parse', `${rev}^{commit}`, `${base}^{commit}`])).trim()}`
  const known = landings.get(key)
  if (known) return known
  const answer = await landingNow(dir, rev, base, baseTree)
  if (landings.size >= LANDINGS) landings.clear()
  landings.set(key, answer)
  return answer
}

const landingNow = async (dir: string, rev: string, base: string, baseTree: string): Promise<Landing> => {
  if (await mergesToNothing(dir, rev, base, baseTree)) return { absorbed: true }
  const marks = await marksOf(dir, rev, base)
  if (!marks.some((m) => m.side === '>')) return { absorbed: true }
  const carried = carriedOf(marks, await missingFrom(dir, rev, base))
  return carried ? { absorbed: false, carried } : { absorbed: false }
}

/**
 * The base a branch's absorbed check runs against: its recorded base while it exists, else origin's default, where an
 * integration branch's work has usually gone once origin deleted it.
 */
export const againstOf = async (dir: string, base: string | undefined, originHead: string | undefined) =>
  base && (await resolve(dir, `${base}^{commit}`)) ? base : originHead

/** Commits of `rev` on no remote and in none of `known`, a few of them named. */
const unpushedOf = async (dir: string, rev: string, known: string[]) => {
  const count = Number(await git(dir, ['rev-list', '--count', rev, '--not', '--remotes', ...known]))
  const named = count ? lines(await git(dir, ['log', `-n${RISK_LINES}`, '--format=%h %s', rev, '--not', '--remotes', ...known])) : []
  return { count, named }
}

/**
 * Whether `rev` holds work found nowhere else. A fork's snapshot is its source's work, so only commits made on top of it
 * count, and a fork with none is absorbed: removing it loses nothing.
 */
const exposureOf = async (dir: string, rev: string, { fork }: TowerRecord, against: string | undefined) => {
  const unpushed = await unpushedOf(dir, rev, fork ? [fork] : [])
  return { unpushed, ...(fork !== undefined && unpushed.count === 0 ? { absorbed: true } : await landing(dir, rev, against)) }
}

/**
 * Commits `branch` gained since it was created, counted from its reflog's first entry; `undefined` once the reflog no
 * longer holds that creation.
 */
const ownCommits = async (dir: string, branch: string): Promise<number | undefined> => {
  const created = lines(await git(dir, ['reflog', 'show', '--format=%H %gs', `refs/heads/${branch}`])).at(-1)
  if (!created?.includes(' branch: Created from ')) return undefined
  return Number(await git(dir, ['rev-list', '--count', `${created.split(' ')[0]}..refs/heads/${branch}`]))
}

const treeRead = async (dir: string, name: string, entry: ReturnType<typeof parseWorktreeList>[number], records: Map<string, TowerRecord>, originHead: string | undefined): Promise<TreeRead> => {
  const record = (entry.branch && records.get(entry.branch)) || {}
  const against = await againstOf(dir, record.base, originHead)
  const present = !entry.prunable
  const status = present ? lines(await git(entry.path, ['status', '--porcelain'])) : []
  const exposure = entry.head ? await exposureOf(dir, entry.head, record, against) : { unpushed: { count: 0, named: [] as string[] }, absorbed: false }
  return {
    name,
    path: entry.path,
    branch: entry.branch,
    head: entry.head,
    base: record.base,
    from: record.from,
    present,
    dirty: status.length,
    unpushed: exposure.unpushed.count,
    against,
    absorbed: exposure.absorbed,
    ...(exposure.carried && { carried: exposure.carried }),
    own: entry.branch ? await ownCommits(dir, entry.branch) : undefined,
    risk: [...status.slice(0, RISK_LINES), ...exposure.unpushed.named],
  }
}

const branchRead = async (dir: string, branch: string, record: TowerRecord & { base: string }, originHead: string | undefined): Promise<BranchRead> => {
  const against = await againstOf(dir, record.base, originHead)
  const head = (await git(dir, ['rev-parse', `refs/heads/${branch}`])).trim()
  const { unpushed, absorbed, carried } = await exposureOf(dir, head, record, against)
  return { branch, head, base: record.base, tree: record.name, against, unpushed: unpushed.count, absorbed, ...(carried && { carried }), own: await ownCommits(dir, branch), risk: unpushed.named }
}

/** The branch checked out in `dir`'s upstream, `origin/<x>`; `undefined` on a detached HEAD or a branch tracking nothing. */
export const upstreamOf = async (dir: string) => {
  const r = await run(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  return r.code === 0 ? r.stdout.trim() : undefined
}

/**
 * The ref a checkout's work is counted from: its branch's recorded base (origin's default once that's gone), else its
 * upstream, so a commit not yet pushed is still work to review, else `HEAD`.
 */
export const againstFor = async (dir: string): Promise<string> => {
  const branch = (await run(dir, ['symbolic-ref', '-q', '--short', 'HEAD'])).stdout.trim()
  const base = branch && (await run(dir, ['config', '--get', `branch.${branch}.towerBase`])).stdout.trim()
  return (base && (await againstOf(dir, base, await originHeadOf(dir)))) || (await upstreamOf(dir)) || 'HEAD'
}

/** The main checkout's unlanded work: files git status lists, and commits its upstream doesn't have. */
const mainRead = async (dir: string): Promise<MainRead> => {
  const upstream = await upstreamOf(dir)
  return {
    dirty: lines(await git(dir, ['status', '--porcelain'])).length,
    ahead: upstream ? Number(await git(dir, ['rev-list', '--count', `${upstream}..HEAD`])) : 0,
  }
}

/** Origin's default branch as `origin/<x>`, as of the last fetch; `undefined` when origin/HEAD isn't set. */
export const originHeadOf = async (dir: string) => (await run(dir, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'])).stdout.trim() || undefined

/** Origin's branches as `origin/<x>`, its default first. */
const originBases = async (dir: string, head: string | undefined): Promise<string[]> => {
  const branches = lines(await git(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'])).filter((b) => b !== 'origin/HEAD' && b !== 'origin')
  return head ? [head, ...branches.filter((b) => b !== head)] : branches
}

/** Git prints resolved paths; the tower speaks the config's, which may pass through a symlink (`/tmp` on macOS). */
const inConfigTerms = (dir: string) => {
  const real = realpathSync(dir)
  return (p: string) => (p === real || p.startsWith(`${real}/`) ? `${dir}${p.slice(real.length)}` : p)
}

/** Every worktree git knows in the repo, the main checkout first, its paths in the config's spelling. */
const worktreeList = async (dir: string) => {
  const spelled = inConfigTerms(dir)
  return parseWorktreeList(await git(dir, ['worktree', 'list', '--porcelain'])).map((e) => ({ ...e, path: spelled(e.path) }))
}

/** What a project dir's git says about the tower's worktrees and branches, without fetching. */
export const readRepo = async (dir: string): Promise<RepoRead> => {
  if (!(await isRepo(dir))) return { dir, git: false }
  const entries = await worktreeList(dir)
  const records = parseTowerRecords((await run(dir, ['config', '--get-regexp', '^branch\\..*\\.tower(base|name|fork|from)$'])).stdout)
  const heads = new Set(lines(await git(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])))
  const checkedOut = new Set(entries.flatMap((e) => (e.branch ? [e.branch] : [])))
  const towerEntries = entries.flatMap((e) => {
    const name = towerTreeName(dir, e.path)
    return name === undefined ? [] : [{ name, entry: e }]
  })
  const originHead = await originHeadOf(dir)
  const [main, trees, kept, originBranches] = await Promise.all([
    mainRead(dir),
    Promise.all(towerEntries.map(({ name, entry }) => treeRead(dir, name, entry, records, originHead))),
    Promise.all(
      [...records]
        .filter((r): r is [string, TowerRecord & { base: string }] => r[1].base !== undefined && heads.has(r[0]) && !checkedOut.has(r[0]))
        .map(([branch, record]) => branchRead(dir, branch, record, originHead)),
    ),
    originBases(dir, originHead),
  ])
  return { dir, git: true, bases: originBranches, main, trees, kept }
}

export const readRepos = (dirs: string[]): Promise<RepoRead[]> => Promise.all(dirs.map(readRepo))

/**
 * The brief of the worktree `cwd` is, with the branch checked out there and its links' sources; `undefined` for a main
 * checkout. `links`: the config's `worktrees.links`.
 */
export const briefFor = async (project: Project, links: Record<string, string>, cwd: string): Promise<WorktreeBrief | undefined> => {
  if (worktreeName(project, cwd) === undefined) return undefined
  const branch = (await git(cwd, ['branch', '--show-current'])).trim()
  return worktreeBrief(project, cwd, branch || undefined, linkedSources(project, links))
}

/** The worktree names the repo's branches were cut under, kept branches included: a recut takes its name back. */
const recordedNames = async (dir: string) =>
  new Set([...parseTowerRecords((await run(dir, ['config', '--get-regexp', '^branch\\..*\\.towername$'])).stdout).values()].map((r) => r.name))

/** Whether `name` is free in every dir: as a worktree path, its default branch as a local branch, and as a branch's recorded name. */
export const nameIsFree = async (dirs: string[], name: string, branch: string): Promise<boolean> => {
  const free = await Promise.all(
    dirs.map(async (dir) => !existsSync(worktreePath(dir, name)) && !(await resolve(dir, `refs/heads/${branch}`)) && !(await recordedNames(dir)).has(name)),
  )
  return free.every(Boolean)
}

/** Git talking to origin: one longer than FETCH_TIMEOUT_MS throws `offline`. */
const fromOrigin = (dir: string, args: string[]) =>
  run(dir, args, FETCH_TIMEOUT_MS).catch((err) => {
    throw err instanceof GitTimeout ? new WorktreeError('offline', err.message) : err
  })

const fetchNow = async (dir: string, prune: boolean) => {
  const r = await fromOrigin(dir, ['fetch', ...(prune ? ['--prune'] : []), 'origin'])
  if (r.code !== 0) throw new WorktreeError('offline', `Couldn't fetch origin in ${dir}: ${r.stderr.trim()}`)
}

/**
 * How long a finished fetch stands for a new one: long enough for a burst of hires, each cutting in the same repos
 * within a second or two, to share one; no staler than the 5 s old board a verb was offered on.
 */
const FETCH_FRESH_MS = 5_000

type Fetch = { prune: boolean; done: Promise<void>; at?: number }

/** Each repo's latest fetch of origin, in flight or finished at `at`. A failed one is forgotten as it fails. */
const fetches = new Map<string, Fetch>()

/**
 * Origin fetched into `dir`: callers share a fetch in flight or finished within FETCH_FRESH_MS, a pruning one
 * standing for a plain one; a fetch it can't stand for starts after it, so a repo runs one at a time. A failure fails
 * every caller sharing it, and the next call fetches again.
 */
const fetchOrigin = (dir: string, prune: boolean): Promise<void> => {
  const last = fetches.get(dir)
  if (last && (last.prune || !prune) && (last.at === undefined || Date.now() - last.at < FETCH_FRESH_MS)) return last.done
  const inFlight = last?.at === undefined ? last?.done.catch(() => undefined) : undefined
  const started: Fetch = { prune, done: inFlight ? inFlight.then(() => fetchNow(dir, prune)) : fetchNow(dir, prune) }
  fetches.set(dir, started)
  started.done.then(
    () => (started.at = Date.now()),
    () => fetches.get(dir) === started && fetches.delete(dir),
  )
  return started.done
}

/** The project's git dirs, each fetched (and its gone remote branches pruned), then read again. */
const fetchedReads = async (project: Project, prune: boolean): Promise<RepoRead[]> => {
  const dirs = projectDirs(project)
  const repos = await Promise.all(dirs.map(isRepo))
  await Promise.all(dirs.filter((_, i) => repos[i]).map((dir) => fetchOrigin(dir, prune)))
  return readRepos(dirs)
}

const isIgnored = (dir: string, key: string) => ask(dir, ['check-ignore', '-q', key])
const isTracked = (dir: string, key: string) => ask(dir, ['ls-files', '--error-unmatch', '--', key])

const linkSource = (dir: string, source: string) => (path.isAbsolute(source) ? source : path.join(dir, source))

/** The links whose source exists in `dir`, each with its source's absolute path. */
const presentLinks = (dir: string, links: Record<string, string>): [key: string, source: string][] =>
  Object.entries(links)
    .map(([key, source]) => [key, linkSource(dir, source)] as [string, string])
    .filter(([, source]) => existsSync(source))

/**
 * The directory sources of the links a cut makes in the project's repos, once each: where a worktree session's links
 * lead. A file link has none: Claude takes only directories as its own, and a file's is a main checkout.
 */
export const linkedSources = (project: Project, links: Record<string, string>): string[] => [
  ...new Set(
    projectDirs(project).flatMap((dir) =>
      presentLinks(dir, links)
        .map(([, source]) => source)
        .filter((source) => statSync(source).isDirectory()),
    ),
  ),
]

/**
 * The links that apply in `dir`: those whose source exists there. Each must be ignored and untracked, or the link would
 * show as an untracked file, or replace tracked ones.
 */
const linksIn = async (dir: string, links: Record<string, string>): Promise<[key: string, source: string][]> => {
  const present = presentLinks(dir, links)
  for (const [key] of present) {
    if (!(await isIgnored(dir, key))) throw new WorktreeError('refused', `The link "${key}" isn't ignored by git in ${dir}: add it to .gitignore or your global excludes`)
    if (await isTracked(dir, key)) throw new WorktreeError('refused', `The link "${key}" is tracked by git in ${dir}: a link would replace it`)
  }
  return present
}

/**
 * The ignored files the repo's `.worktreeinclude` names, copied, then the links made, each checked ignored as the
 * link it is: in the main checkout its source may be a directory, which a pattern ending in "/" matches.
 */
const furnish = async (dir: string, tree: string, links: [string, string][]) => {
  if (existsSync(path.join(dir, '.worktreeinclude'))) {
    const files = (await git(dir, ['ls-files', '-z', '--others', '--ignored', '--exclude-from=.worktreeinclude'])).split('\0').filter((f) => f && !f.startsWith(`${WORKTREES_DIR}/`))
    for (const file of files) {
      mkdirSync(path.dirname(path.join(tree, file)), { recursive: true })
      cpSync(path.join(dir, file), path.join(tree, file))
    }
  }
  for (const [key, source] of links) {
    mkdirSync(path.dirname(path.join(tree, key)), { recursive: true })
    symlinkSync(source, path.join(tree, key))
    if (!(await isIgnored(tree, key))) throw new Error(`git doesn't ignore the link "${key}" in ${tree}, so it would count as uncommitted work: a pattern ending in "/" matches directories only, never a link (write "${key}", not "${key}/")`)
  }
}

/** `.worktrees/` in the repo's own excludes, shared by all its worktrees: no file of the repo changes. */
const excludeWorktrees = async (dir: string) => {
  const exclude = path.join(path.resolve(dir, (await git(dir, ['rev-parse', '--git-common-dir'])).trim()), 'info', 'exclude')
  const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  const patterns = new Set([WORKTREES_DIR, `${WORKTREES_DIR}/`, `/${WORKTREES_DIR}`, `/${WORKTREES_DIR}/`])
  if (current.split('\n').some((line) => patterns.has(line.trim()))) return
  mkdirSync(path.dirname(exclude), { recursive: true })
  appendFileSync(exclude, `${current && !current.endsWith('\n') ? '\n' : ''}/${WORKTREES_DIR}/\n`)
}

export type CutRequest = { name: string; branch: string; base: string | undefined }

/** What one repo got from a cut: rollback undoes exactly this. `baseCommit`: where the branch was cut, when this request cut it. */
export type Made = { dir: string; path: string; branch: string; baseCommit?: string }

export type CutResult = { name: string; branch: string; made: Made[]; bases: { dir: string; base: string; why: string }[] }

/** Origin's default branch, set from origin when the clone never recorded it. */
const defaultBase = async (dir: string): Promise<string | undefined> =>
  (await originHeadOf(dir)) ?? ((await fromOrigin(dir, ['remote', 'set-head', 'origin', '--auto'])).code === 0 ? originHeadOf(dir) : undefined)

/** A new worktree's place in one repo, checked free, and the links it gets. */
type Planned = { dir: string; path: string; links: [string, string][] }

/** Where a new worktree's branch starts in one repo (`commit`), and the record it carries: the base and, for a fork, what it forked. */
type Start = { commit: string; record: TowerRecord & { base: string }; why: string }

const refuseMain = (name: string) => {
  if (name === MAIN_CHECKOUT) throw new WorktreeError('invalid', `"${MAIN_CHECKOUT}" names the main checkouts: pick another worktree name`)
}

/** Every check a worktree `name` on a new `branch` must pass in `dir` before anything is made. */
const preflight = async (dir: string, name: string, branch: string, links: Record<string, string>): Promise<Planned> => {
  if (!(await isRepo(dir))) throw new WorktreeError('refused', `${dir} is not a git repository: a worktree is cut in every directory of the project`)
  if (!(await succeeds(dir, ['check-ref-format', '--branch', branch]))) throw new WorktreeError('invalid', `"${branch}" is not a valid branch name`)
  const tree = worktreePath(dir, name)
  if (existsSync(tree)) throw new WorktreeError('exists', `${tree} already exists`)
  if ((await worktreeList(dir)).some((e) => e.path === tree)) throw new WorktreeError('exists', `"${name}" is a lost worktree in ${dir}: recut or forget it first`)
  if (await resolve(dir, `refs/heads/${branch}`)) throw new WorktreeError('exists', `The branch "${branch}" already exists in ${dir}`)
  return { dir, path: tree, links: await linksIn(dir, links) }
}

/** The latest verb writing a repo's `.git/config`, each starting after it: git refuses a second writer at once. */
let configWrites: Promise<unknown> = Promise.resolve()

/**
 * `write` once every earlier config writer has finished. Every verb that records, cuts or deletes a branch goes through
 * here, and never from inside another: the inner one would wait on the outer forever.
 */
const writingConfig = <T>(write: () => Promise<T>): Promise<T> => {
  const done = configWrites.then(write)
  configWrites = done.catch(() => undefined)
  return done
}

const make = (name: string, branch: string, plan: (Planned & { start: Start })[]): Promise<Made[]> => writingConfig(() => makeNow(name, branch, plan))

/** Each planned worktree made on `branch` from its start, recorded and furnished; a failure rolls back what was made. */
const makeNow = async (name: string, branch: string, plan: (Planned & { start: Start })[]): Promise<Made[]> => {
  const made: Made[] = []
  let step = ''
  let at = ''
  try {
    for (const { dir, path: tree, links, start } of plan) {
      at = dir
      step = 'exclude .worktrees/'
      await excludeWorktrees(dir)
      step = 'worktree add'
      await git(dir, ['worktree', 'add', '--no-track', '-b', branch, tree, start.commit])
      made.push({ dir, path: tree, branch, baseCommit: start.commit })
      step = 'record the base'
      await record(dir, branch, { ...start.record, name })
      step = 'copy and link'
      await furnish(dir, tree, links)
    }
  } catch (err) {
    await undo(made)
    throw new WorktreeError('worktree_failed', `Making "${name}" failed at "${step}" in ${at}, and was rolled back: ${(err as Error).message}`)
  }
  return made
}

const cutResult = (name: string, branch: string, made: Made[], plan: { dir: string; start: Start }[]): CutResult => ({
  name,
  branch,
  made,
  bases: plan.map(({ dir, start }) => ({ dir, base: start.record.base, why: start.why })),
})

/**
 * A worktree named `name` on a new branch in every dir of the project, each cut from `base` on origin after a fetch.
 * Preflight checks every repo before anything is made; a failure while making rolls back what was made.
 */
export const cut = async (project: Project, links: Record<string, string>, { name, branch, base }: CutRequest): Promise<CutResult> => {
  refuseMain(name)
  const plan: Planned[] = []
  for (const dir of projectDirs(project)) {
    if ((await isRepo(dir)) && !(await succeeds(dir, ['remote', 'get-url', 'origin']))) throw new WorktreeError('refused', `${dir} has no origin remote to cut from`)
    plan.push(await preflight(dir, name, branch, links))
  }

  await Promise.all(plan.map(({ dir }) => fetchOrigin(dir, false)))
  const started: (Planned & { start: Start })[] = []
  for (const planned of plan) {
    const chosen = base ?? (await defaultBase(planned.dir))
    if (!chosen) throw new WorktreeError('refused', `origin has no default branch in ${planned.dir}: pick a base`)
    const commit = await resolve(planned.dir, `${chosen}^{commit}`)
    if (!commit) throw new WorktreeError('refused', `${planned.dir} has no "${chosen}" on origin: push it there first`)
    started.push({ ...planned, start: { commit, record: { base: chosen }, why: base ? 'asked for' : "origin's default branch" } })
  }
  return cutResult(name, branch, await make(name, branch, started), started)
}

/**
 * A commit of the checkout at `dir` as it is now: its HEAD with every staged, unstaged and untracked file on top, built
 * in a copy of its index so the checkout itself is never touched; its HEAD when nothing is on top. It is on no branch:
 * only a worktree forked from it keeps it.
 */
export const snapshot = async (dir: string, message: string): Promise<string> => {
  const head = (await git(dir, ['rev-parse', 'HEAD'])).trim()
  const scratch = mkdtempSync(path.join(tmpdir(), 'tower-snapshot-'))
  try {
    const index = path.join(scratch, 'index')
    cpSync(path.resolve(dir, (await git(dir, ['rev-parse', '--git-path', 'index'])).trim()), index)
    const inCopy = gitWith({ GIT_INDEX_FILE: index })
    await inCopy(dir, ['add', '-A'])
    const tree = (await inCopy(dir, ['write-tree'])).trim()
    if (tree === (await git(dir, ['rev-parse', 'HEAD^{tree}'])).trim()) return head
    return (await git(dir, ['commit-tree', tree, '-p', head, '-m', message])).trim()
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export type ForkRequest = { name: string; branch: string; from: string }

/**
 * A worktree named `name` on a new branch in every dir of the project, each started from a snapshot of checkout `from`
 * as it is now, uncommitted work included, and counted from the base `from`'s work is counted from: its Changes start
 * as `from`'s did at the snapshot. Nothing is fetched; everything it needs is in the repo.
 */
export const fork = async (project: Project, links: Record<string, string>, { name, branch, from }: ForkRequest): Promise<CutResult> => {
  refuseMain(name)
  if (name === from) throw new WorktreeError('invalid', `A worktree can't be forked into its own name "${name}"`)
  const sources = checkoutDirs(project, from)
  const plan: (Planned & { source: string })[] = []
  for (const [i, dir] of projectDirs(project).entries()) {
    if (!existsSync(sources[i])) throw new WorktreeError('not_found', `Checkout "${from}" has no copy in ${dir} (${sources[i]})`)
    plan.push({ ...(await preflight(dir, name, branch, links)), source: sources[i] })
  }

  const started: (Planned & { start: Start })[] = []
  for (const { source, ...planned } of plan) {
    const against = await againstFor(source)
    const base = against === 'HEAD' ? (await git(source, ['rev-parse', 'HEAD'])).trim() : against
    const commit = await snapshot(source, `Snapshot of ${from} for ${name}`)
    started.push({ ...planned, start: { commit, record: { base, fork: commit, from }, why: `a snapshot of ${from} (${commit.slice(0, 7)})` } })
  }
  return cutResult(name, branch, await make(name, branch, started), started)
}

/** A branch marked as the tower's: the base it was cut from, the worktree name it was cut under and, for a fork, its snapshot and source. */
const record = async (dir: string, branch: string, fields: TowerRecord) => {
  const keys = { base: 'towerBase', name: 'towerName', fork: 'towerFork', from: 'towerFrom' } as const
  for (const [field, key] of Object.entries(keys)) {
    const value = fields[field as keyof TowerRecord]
    if (value !== undefined) await git(dir, ['config', `branch.${branch}.${key}`, value])
  }
}

/** Undoes a cut: its worktrees, and the branches it cut while still at the commit they were cut from. */
export const rollback = (made: Made[]) => writingConfig(() => undo(made))

const undo = async (made: Made[]) => {
  for (const { dir, path: tree, branch, baseCommit } of made) {
    await git(dir, ['worktree', 'remove', '--force', tree])
    if (baseCommit !== undefined) await deleteAt(dir, branch, baseCommit)
  }
}

/** The project's worktree `name` after a fetch, in one of the states `expected`, else a refusal that says why not. */
const worktreeIn = (reads: RepoRead[], projectId: string, name: string, occupants: Occupant[], expected: WorktreeState[]): FloorWorktree => {
  const tree = floorWorktrees(projectId, reads, occupants, false).find((w) => w.name === name)
  if (!tree) throw new WorktreeError('not_found', `"${projectId}" has no worktree "${name}"`)
  if (expected.includes(tree.state)) return tree
  if (tree.state === 'at-risk') {
    const why = tree.repos.filter((r) => r.atRisk).map((r) => `${r.dir}: ${r.dirty} uncommitted, ${r.unpushed} unpushed (${r.risk.join('; ')})`)
    throw new WorktreeError('would_lose', `"${name}" holds work found nowhere else. ${why.join('. ')}`)
  }
  if (tree.state === 'live') throw new WorktreeError('refused', `"${name}" is in use by ${tree.sessions.join(', ')}`)
  throw new WorktreeError('refused', `"${name}" is ${tree.state}, not ${expected.join(' or ')}`)
}

/**
 * Git's record of a worktree whose folder is gone, cleared for this one worktree alone: `git worktree prune` would clear
 * every lost worktree's, and with it the only sign that they are lost. With no folder, `--force` has nothing to lose.
 */
const forgetLost = (dir: string, tree: string) => git(dir, ['worktree', 'remove', '--force', tree])

/** A repo's branch as a read found it: `head`, the commit it was at; `base`, recorded when the tower cut it. */
type Read = { dir: string; branch?: string; head?: string; base?: string }

type Landed = Read & Pick<Exposure, 'absorbed' | 'carried'>

/**
 * `branch` deleted with its config only while it is still at `head`, the commit the read judged: git refuses once it
 * moved, so a commit made since stays. Returns why it was kept, when it was.
 */
const deleteAt = async (dir: string, branch: string, head: string): Promise<string | undefined> => {
  const r = await run(dir, ['update-ref', '-d', `refs/heads/${branch}`, head])
  if (r.code !== 0) return `${branch} in ${dir}: kept, it moved since it was read (${r.stderr.trim()})`
  await git(dir, ['config', '--remove-section', `branch.${branch}`])
}

/**
 * Deletes each repo's branch the tower cut, still at its head as read; returns why each other one was kept. A branch
 * with no record of a cut is someone else's, checked out in the worktree by hand.
 */
const deleteBranches = (repos: Read[]) =>
  writingConfig(async () => {
    const kept: string[] = []
    for (const { dir, branch, head, base } of repos) {
      if (!branch) continue
      const why = base === undefined ? `${branch} in ${dir}: kept, the tower didn't cut it` : await deleteAt(dir, branch, head!)
      if (why) kept.push(why)
    }
    return kept
  })

/** Deletes the branch of each repo where it's absorbed: the work is in its base. Others are kept. */
const deleteAbsorbed = (repos: Landed[]) => deleteBranches(repos.filter((r) => r.absorbed))

/** Deletes the branch of each repo where it's absorbed or carried: the work is in its base, maybe edited. Others are kept. */
const deleteLanded = (repos: Landed[]) => deleteBranches(repos.filter((r) => r.absorbed || r.carried))

/**
 * Without `--force`: git's own guard runs again. Ignored files go with it; a link goes, never what it points to.
 * Returns why each branch it didn't delete was kept.
 */
const removeTree = async (tree: FloorWorktree) => {
  for (const repo of tree.repos) await git(repo.dir, ['worktree', 'remove', repo.path])
  return (tree.state === 'carried' ? deleteLanded : deleteAbsorbed)(tree.repos)
}

/** A worktree that would lose nothing, or whose work landed as copies: the press is one per worktree, never Tidy's. */
export const removeWorktree = async (project: Project, projectId: string, name: string, occupants: Occupant[]) =>
  removeTree(worktreeIn(await fetchedReads(project, true), projectId, name, occupants, ['removable', 'carried']))

export const pruneWorktree = async (project: Project, projectId: string, name: string, occupants: Occupant[]) => {
  const lost = worktreeIn(await fetchedReads(project, true), projectId, name, occupants, ['lost']).repos.filter((r) => !r.present)
  for (const r of lost) await forgetLost(r.dir, r.path)
  return deleteAbsorbed(lost)
}

/** What a repo's worktree held as the board showed it: its HEAD and its count of uncommitted files. */
export type Held = { dir: string; head: string; dirty: number }

/**
 * The at-risk worktree `name` after a fetch, each repo as `held` says the board showed it, with what each holds as a
 * tip: its HEAD, or a snapshot of it with its uncommitted files (`snapshot`), on no branch. Refused when any moved.
 */
export const discardable = async (project: Project, projectId: string, name: string, occupants: Occupant[], held: Held[]): Promise<Tip[]> => {
  const tree = worktreeIn(await fetchedReads(project, true), projectId, name, occupants, ['at-risk'])
  const moved = tree.repos.filter((r) => !held.some((h) => h.dir === r.dir && h.head === r.head && h.dirty === r.dirty))
  if (moved.length || held.length !== tree.repos.length)
    throw new WorktreeError('refused', `"${name}" moved since it was shown: ${moved.map((r) => `${r.dir} is at ${r.head?.slice(0, 7)} with ${r.dirty} uncommitted`).join(', ') || 'its repos changed'}`)
  return Promise.all(
    tree.repos.map(async (r) => ({
      dir: r.dir,
      branch: r.branch,
      base: r.base,
      head: r.head!,
      dirty: r.dirty,
      tip: r.dirty ? await snapshot(r.path, `Uncommitted work of ${name}, discarded`) : r.head!,
      unpushed: lines(await git(r.dir, ['log', '--format=%h %s', r.head!, '--not', '--remotes'])),
    })),
  )
}

/** Each repo's worktree removed with `--force`, and its branch deleted at the head `discardable` read, once noted. */
export const discard = async (name: string, tips: Tip[]) => {
  for (const t of tips) await git(t.dir, ['worktree', 'remove', '--force', worktreePath(t.dir, name)])
  return deleteBranches(tips)
}

/** The lost folders of `name` checked out again from their branches, then furnished as a cut would. */
export const recutWorktree = async (project: Project, projectId: string, links: Record<string, string>, name: string, occupants: Occupant[]) => {
  const tree = worktreeIn(await fetchedReads(project, false), projectId, name, occupants, ['lost'])
  const lost = tree.repos.filter((r) => !r.present)
  const detached = lost.find((r) => !r.branch)
  if (detached) throw new WorktreeError('refused', `${detached.path} was on a detached HEAD: there is no branch to recut it from`)
  const plans = await Promise.all(lost.map(async (r) => ({ ...r, links: await linksIn(r.dir, links) })))
  for (const r of plans) {
    await forgetLost(r.dir, r.path)
    await git(r.dir, ['worktree', 'add', r.path, r.branch!])
    await furnish(r.dir, r.path, r.links)
  }
}

/** The worktree name a kept branch goes back to: the one recorded at its cut. */
const keptTreeName = (b: FloorBranch) => {
  const name = b.repos.find((r) => r.tree)?.tree
  if (!name) throw new WorktreeError('refused', `"${b.name}" has no worktree name on record: check it out by hand`)
  return name
}

/**
 * A kept branch checked out again at `<dir>/.worktrees/<name>` in every repo, under the name it was cut under, so the
 * workers that worked in it resume. A repo whose copy was deleted (absorbed there) gets the branch afresh from origin's
 * default. A failure rolls back what this request made, never the kept branch.
 */
export const recutBranch = async (project: Project, projectId: string, links: Record<string, string>, branch: string) => {
  const kept = floorBranches(projectId, await fetchedReads(project, false)).find((b) => b.name === branch)
  if (!kept) throw new WorktreeError('not_found', `"${projectId}" keeps no branch "${branch}"`)
  const name = keptTreeName(kept)
  const plan: { dir: string; tree: string; base?: string; links: [string, string][] }[] = []
  for (const dir of projectDirs(project)) {
    if (!(await isRepo(dir))) throw new WorktreeError('refused', `${dir} is not a git repository: a worktree is cut in every directory of the project`)
    const tree = worktreePath(dir, name)
    if (existsSync(tree) || (await worktreeList(dir)).some((e) => e.path === tree)) throw new WorktreeError('exists', `${tree} is taken: remove or forget that worktree first`)
    const has = kept.repos.some((r) => r.dir === dir)
    const base = has ? undefined : await defaultBase(dir)
    if (!has && !base) throw new WorktreeError('refused', `${dir} has no "${branch}" and origin has no default branch to cut it from`)
    plan.push({ dir, tree, base, links: await linksIn(dir, links) })
  }

  await writingConfig(async () => {
    const made: Made[] = []
    let at = ''
    try {
      for (const { dir, tree, base, links } of plan) {
        at = dir
        await excludeWorktrees(dir)
        if (base) {
          await git(dir, ['worktree', 'add', '--no-track', '-b', branch, tree, base])
          made.push({ dir, path: tree, branch, baseCommit: await resolve(dir, `${base}^{commit}`) })
          await record(dir, branch, { base, name })
        } else {
          await git(dir, ['worktree', 'add', tree, branch])
          made.push({ dir, path: tree, branch })
          await record(dir, branch, { name })
        }
        await furnish(dir, tree, links)
      }
    } catch (err) {
      await undo(made)
      throw new WorktreeError('worktree_failed', `Recutting "${branch}" as "${name}" failed in ${at}, and was rolled back: ${(err as Error).message}`)
    }
  })
}

export const deleteBranch = async (project: Project, projectId: string, name: string) => {
  const branch = floorBranches(projectId, await fetchedReads(project, true)).find((b) => b.name === name)
  if (!branch) throw new WorktreeError('not_found', `"${projectId}" keeps no branch "${name}"`)
  if (!branch.repos.some((r) => r.absorbed || r.carried)) throw new WorktreeError('would_lose', `"${name}" isn't absorbed into its base, or carried there, in any repo`)
  return deleteLanded(branch.repos.map((r) => ({ ...r, branch: name })))
}

/**
 * The named worktrees removed and kept branches deleted, after one fetch; refused before touching any when one of them
 * is no longer removable or absorbed.
 */
export const tidy = async (project: Project, projectId: string, occupants: Occupant[], named: { worktrees: string[]; branches: string[] }) => {
  const reads = await fetchedReads(project, true)
  const removable = floorWorktrees(projectId, reads, occupants, false).filter((w) => w.state === 'removable')
  const absorbed = floorBranches(projectId, reads).filter((b) => b.absorbed)
  const gone = [
    ...named.worktrees.filter((name) => !removable.some((w) => w.name === name)).map((name) => `worktree ${name}`),
    ...named.branches.filter((name) => !absorbed.some((b) => b.name === name)).map((name) => `branch ${name}`),
  ]
  if (gone.length) throw new WorktreeError('refused', `Tidy's list moved on: ${gone.join(', ')} no longer qualif${gone.length === 1 ? 'ies' : 'y'}`)
  const kept: string[] = []
  for (const tree of removable.filter((w) => named.worktrees.includes(w.name))) kept.push(...(await removeTree(tree)))
  for (const branch of absorbed.filter((b) => named.branches.includes(b.name))) kept.push(...(await deleteAbsorbed(branch.repos.map((r) => ({ ...r, branch: branch.name })))))
  return { removed: named.worktrees, deleted: named.branches, kept }
}

/**
 * What landing changed on `branch`, in each of the project's repos holding it: each commit that landed as an edited
 * copy in its base (`copiesOf`), with `git range-diff` between the two.
 */
export const landingOf = async (project: Project, branch: string): Promise<LandingRead> => {
  const repos = await Promise.all(
    projectDirs(project).map(async (dir) => {
      if (!(await isRepo(dir)) || !(await resolve(dir, `refs/heads/${branch}`))) return []
      const base = (await run(dir, ['config', '--get', `branch.${branch}.towerBase`])).stdout.trim()
      const against = await againstOf(dir, base || undefined, await originHeadOf(dir))
      if (!against) return []
      const copies = copiesOf(await marksOf(dir, `refs/heads/${branch}`, against)) ?? []
      const edits = await Promise.all(
        copies.map(async ({ commit, copy }) => ({
          commit,
          copy,
          subject: (await git(dir, ['log', '-1', '--format=%s', commit])).trim(),
          rangeDiff: await git(dir, ['range-diff', '--no-color', '--creation-factor=999', `${commit}^!`, `${copy}^!`]),
        })),
      )
      return [{ dir, against, edits }]
    }),
  )
  if (!repos.flat().length) throw new WorktreeError('not_found', `No repo of the project holds a branch "${branch}" with a base`)
  return { branch, repos: repos.flat() }
}
