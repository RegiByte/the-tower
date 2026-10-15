/**
 * What a worker changed in its repos, through git: on a branch the tower cut, everything since it left its base
 * (commits, staged, unstaged and untracked); on a branch with an upstream, everything since it left the upstream;
 * anywhere else, everything since `HEAD`. A scope narrows it to what isn't committed yet, or to one of the commits
 * since the base. Files outside the repos aren't seen. Git is read on every request, never kept.
 */
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeCount, MAX_BEFORE_LINES, parseDiff, withBefore, type DiffFile } from './bridge/diff.ts'
import { git, gitBytes, run } from './git.ts'
import { againstFor, isRepo } from './worktrees.ts'

/** Untracked files diffed one by one past this many would be a forgotten ignore rule, not work. */
const MAX_UNTRACKED = 300
/** Commits listed since the base past this many are a branch that was never rebased, not a review. */
const MAX_COMMITS = 200

/** What a read shows: everything since the base, only what isn't committed (since `HEAD`), or one commit's own changes. */
export type ChangesScope = 'all' | 'uncommitted' | { commit: string }

/** A commit since the base: its hash, the first line of its message, and when it was made (ISO). */
export type Commit = { sha: string; subject: string; at: string }

/**
 * One repo's changes. `against`: the ref they're counted from (the branch's base, its upstream, or `HEAD`), and `since` the commit
 * that is (the merge-base with that base). `commits`: the commits since then, newest first, whatever the scope.
 * `shows`: what `files` hold, `all`, `uncommitted`, or a commit of `commits` (none, in a repo without that commit).
 * `more`: untracked files left out past `MAX_UNTRACKED`.
 */
export type RepoChanges = { dir: string; against: string; since: string; commits: Commit[]; shows: 'all' | 'uncommitted' | string; files: DiffFile[]; more: number }

/** Every config of the user's that changes what `git diff` prints, set back to what the parser reads. */
const DIFF = ['-c', 'core.quotepath=false', '-c', 'diff.suppressBlankEmpty=false', 'diff', '-U3', '-M', '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/']

/** An untracked file as a diff against nothing: `--no-index` exits 1 when there is a difference, which there always is. */
const untrackedDiff = async (dir: string, file: string): Promise<string> => {
  const r = await run(dir, [...DIFF, '--no-index', '--', '/dev/null', file])
  if (r.code > 1) throw new Error(`git diff --no-index ${file} in ${dir}: ${r.stderr.trim()}`)
  return r.stdout
}

const commitsSince = async (dir: string, since: string): Promise<Commit[]> =>
  (await git(dir, ['log', `--max-count=${MAX_COMMITS}`, '--format=%H%x00%s%x00%aI%x00', `${since}..HEAD`]))
    .split('\0\n').filter(Boolean).map((line) => {
      const [sha, subject, at] = line.split('\0')
      return { sha, subject, at }
    })

/** Files in the order of the paths their headers show, untracked ones among the rest; as git sorts its own, for ASCII paths. */
const byPath = (files: DiffFile[]): DiffFile[] => files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

/**
 * Lines before hunks one read sends past this many would be a wide diff of mid-sized files: megabytes on every poll,
 * and seconds of highlighting as the pane opens. The files past it go without them.
 */
const MAX_READ_BEFORE_LINES = 4000
/** A file past this many bytes isn't read for the lines before its hunks: a log or a data dump, read whole on every poll for a few lines. */
const MAX_BEFORE_FILE_BYTES = 2 * 1024 * 1024
/** Bytes one read reads for lines before hunks: a file is read whole even when its hunks sit near its top. */
const MAX_READ_BEFORE_BYTES = 16 * 1024 * 1024
/** Files read at once for the lines before their hunks. */
const READS_AT_ONCE = 8

/**
 * Each changed file's hunks with the lines before them (`withBefore`). Which files are read is told by their hunk
 * headers first (`beforeCount`): one with lines to buy, up to `MAX_BEFORE_LINES`, in their order until
 * `MAX_READ_BEFORE_LINES`. A file added or deleted is one hunk from its first line, and has none. `newSides` reads
 * those as they now read, as many as their sizes afford.
 */
const withBeforeAll = async (files: DiffFile[], newSides: (paths: string[]) => Promise<(string | undefined)[]>): Promise<DiffFile[]> => {
  let left = MAX_READ_BEFORE_LINES
  const read = files.filter((f) => {
    if (!f.hunks?.length || (f.change !== 'modified' && f.change !== 'renamed')) return false
    const n = beforeCount(f)
    if (n === 0 || n > MAX_BEFORE_LINES || n > left) return false
    left -= n
    return true
  })
  if (!read.length) return files
  const texts = new Map((await newSides(read.map((f) => f.path))).map((text, i) => [read[i], text]))
  return files.map((f) => {
    const text = texts.get(f)
    return text === undefined ? f : withBefore(f, text)
  })
}

/** Which of files of these sizes are read, in their order: each up to `MAX_BEFORE_FILE_BYTES`, all until `MAX_READ_BEFORE_BYTES`. */
const affordable = (sizes: (number | undefined)[]): boolean[] => {
  let left = MAX_READ_BEFORE_BYTES
  return sizes.map((size) => {
    if (size === undefined || size > MAX_BEFORE_FILE_BYTES || size > left) return false
    left -= size
    return true
  })
}

/** Tasks run `READS_AT_ONCE` at a time, their results in their order. */
const fewAtOnce = async <T>(tasks: (() => Promise<T>)[]): Promise<T[]> => {
  const results: T[] = []
  let next = 0
  const work = async () => {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(READS_AT_ONCE, tasks.length) }, work))
  return results
}

/** A file read, or none when the worker removed it since `git diff` read it. */
const unlessGone = <T>(read: Promise<T>): Promise<T | undefined> =>
  read.catch((err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  })

/**
 * Files of the working tree, as `affordable` allows; none for a symlink (its diff is its target's path, not the file
 * it reads), a submodule, and a file the worker removed since `git diff` read it.
 */
const treeFiles = (dir: string) => async (paths: string[]) => {
  const sizes = await Promise.all(paths.map(async (path) => {
    const stat = await unlessGone(lstat(join(dir, path)))
    return stat?.isFile() ? stat.size : undefined
  }))
  const read = affordable(sizes)
  return fewAtOnce(paths.map((path, i) => () => (read[i] ? unlessGone(readFile(join(dir, path), 'utf8')) : Promise.resolve(undefined))))
}

/** A `cat-file --batch-check` answer for an object found: its id, type and bytes. Any other (`<name> missing`) doesn't match. */
const FOUND = /^([0-9a-f]{40,64}) (\S+) (\d+)$/

/**
 * Files as `commit` holds them, as `affordable` allows. A `cat-file --batch-check` names each one's object, type and
 * size, then one `cat-file --batch` reads the blobs by their ids, each answered as a header (`<oid> blob <bytes>`), its
 * bytes and a newline. Anything but a blob (a submodule, an object missing) reads as none. The check asks one name per
 * line, so a path holding a newline isn't asked, and reads as none.
 */
const commitFiles = (dir: string, commit: string) => async (paths: string[]) => {
  const named = paths.filter((p) => !p.includes('\n'))
  const heads = (await gitBytes(dir, ['cat-file', '--batch-check'], named.map((p) => `${commit}:${p}\n`).join(''))).toString('utf8').split('\n')
  const found = named.map((_, i) => FOUND.exec(heads[i]))
  const read = affordable(found.map((m) => (m?.[2] === 'blob' ? Number(m[3]) : undefined)))
  const asked = named.flatMap((p, i) => (read[i] ? [{ p, oid: found[i]![1], size: Number(found[i]![3]) }] : []))
  if (!asked.length) return paths.map(() => undefined)
  const out = await gitBytes(dir, ['cat-file', '--batch'], asked.map((a) => `${a.oid}\n`).join(''))
  let at = 0
  const texts = new Map(asked.map((a) => {
    const start = out.indexOf(10, at) + 1
    at = start + a.size + 1
    return [a.p, out.toString('utf8', start, start + a.size)]
  }))
  return paths.map((p) => texts.get(p))
}

/** The working tree's diff from `from`, untracked files with it. */
const treeDiff = async (dir: string, from: string) => {
  const untracked = (await git(dir, ['ls-files', '-z', '--others', '--exclude-standard'])).split('\0').filter(Boolean)
  const shown = untracked.slice(0, MAX_UNTRACKED)
  const outs = await Promise.all([git(dir, [...DIFF, from]), ...shown.map((file) => untrackedDiff(dir, file))])
  return { files: byPath(await withBeforeAll(outs.flatMap(parseDiff), treeFiles(dir))), more: untracked.length - shown.length }
}

const repoChanges = async (dir: string, scope: ChangesScope): Promise<RepoChanges> => {
  const against = await againstFor(dir)
  const since = (await git(dir, ['merge-base', against, 'HEAD'])).trim()
  const commits = await commitsSince(dir, since)
  const base = { dir, against, since, commits }
  if (scope === 'all') return { ...base, shows: 'all', ...(await treeDiff(dir, since)) }
  if (scope === 'uncommitted') return { ...base, shows: 'uncommitted', ...(await treeDiff(dir, 'HEAD')) }
  const commit = commits.find((c) => c.sha.startsWith(scope.commit))
  if (!commit) return { ...base, shows: scope.commit, files: [], more: 0 }
  const files = parseDiff(await git(dir, [...DIFF, `${commit.sha}^`, commit.sha]))
  return { ...base, shows: commit.sha, files: byPath(await withBeforeAll(files, commitFiles(dir, commit.sha))), more: 0 }
}

/** The changes in each of a session's dirs that is a repo, in its order, as `scope` shows them. */
export const changesIn = async (dirs: string[], scope: ChangesScope = 'all'): Promise<RepoChanges[]> => {
  const repos = await Promise.all(dirs.map(async (dir) => ((await isRepo(dir)) ? dir : undefined)))
  return Promise.all(repos.filter((dir): dir is string => dir !== undefined).map((dir) => repoChanges(dir, scope)))
}
