/**
 * What a worker changed in its repos, through git: on a branch the tower cut, everything since it left its base
 * (commits, staged, unstaged and untracked); on a branch with an upstream, everything since it left the upstream;
 * anywhere else, everything since `HEAD`. A scope narrows it to what isn't committed yet, or to one of the commits
 * since the base. Files outside the repos aren't seen. Git is read on every request, never kept.
 */
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeCount, linesThrough, MAX_BEFORE_LINES, parseDiff, withBefore, type DiffFile } from './bridge/diff.ts'
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
const DIFF = ['-c', 'core.quotepath=false', '-c', 'diff.suppressBlankEmpty=false', '-c', 'diff.submodule=short', '-c', 'diff.relative=false', 'diff', '-U3', '-M', '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/']

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
/**
 * Characters of lines before a file's hunks, and of a read's, past which they go without them: a minified bundle or a
 * data line above a hunk is one line of megabytes, and highlighting it holds the page for seconds.
 */
const MAX_BEFORE_FILE_CHARS = 64 * 1024
const MAX_READ_BEFORE_CHARS = 256 * 1024
/** Bytes of a working tree's file read for its first lines, past which it goes without them: a long line among them. */
const MAX_HEAD_BYTES = 256 * 1024
/** A commit's blob past this many bytes isn't read: `cat-file` answers a blob whole, however few of its lines are needed. */
const MAX_BEFORE_BLOB_BYTES = 2 * 1024 * 1024
/** Bytes of a commit's blobs one read reads. */
const MAX_READ_BEFORE_BLOB_BYTES = 4 * 1024 * 1024
/** Files read at once for the lines before their hunks. */
const READS_AT_ONCE = 8

/** A file to read for the lines before its hunks: its path, and how many of its first lines `withBefore` needs. */
type Wanted = { path: string; lines: number }

/**
 * Each changed file's hunks with the lines before them (`withBefore`). Which files are read is told by their hunk
 * headers first (`beforeCount`): one with lines to buy, up to `MAX_BEFORE_LINES`, in their order until
 * `MAX_READ_BEFORE_LINES`. A file added or deleted is one hunk from its first line, and has none. `newSides` reads
 * those as they now read (a text that holds at least the lines wanted, or none), and they keep the lines up to
 * `MAX_BEFORE_FILE_CHARS` each and `MAX_READ_BEFORE_CHARS` in all.
 */
const withBeforeAll = async (files: DiffFile[], newSides: (wanted: Wanted[]) => Promise<(string | undefined)[]>): Promise<DiffFile[]> => {
  let left = MAX_READ_BEFORE_LINES
  const read = files.filter((f) => {
    if (!f.hunks?.length || (f.change !== 'modified' && f.change !== 'renamed')) return false
    const n = beforeCount(f)
    if (n === 0 || n > MAX_BEFORE_LINES || n > left) return false
    left -= n
    return true
  })
  if (!read.length) return files
  const texts = new Map((await newSides(read.map((f) => ({ path: f.path, lines: linesThrough(f) })))).map((text, i) => [read[i], text]))
  let chars = MAX_READ_BEFORE_CHARS
  return files.map((f) => {
    const text = texts.get(f)
    if (text === undefined) return f
    const full = withBefore(f, text)
    const sent = full.hunks!.reduce((n, h) => n + (h.before ?? []).reduce((m, l) => m + l.length, 0), 0)
    if (sent > MAX_BEFORE_FILE_CHARS || sent > chars) return f
    chars -= sent
    return full
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

/**
 * A working tree's file read as far as its first `lines` lines, or none: past `MAX_HEAD_BYTES` before them, or not a
 * plain file when opened (a symlink, whose diff is its target's path, is never followed; a submodule; a fifo). The
 * worker may have moved, removed or replaced it since `git diff` read it: any failure to read it is none, for this file.
 */
async function head(file: string, lines: number): Promise<string | undefined> {
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => undefined)
  if (!fd) return undefined
  try {
    if (!(await fd.stat()).isFile()) return undefined
    const chunks: Buffer[] = []
    let size = 0
    let seen = 0
    while (seen < lines) {
      const { bytesRead, buffer } = await fd.read({ buffer: Buffer.alloc(64 * 1024) })
      if (!bytesRead) break
      const chunk = buffer.subarray(0, bytesRead)
      for (let at = chunk.indexOf(10); at !== -1 && seen < lines; at = chunk.indexOf(10, at + 1)) seen++
      chunks.push(chunk)
      size += bytesRead
      if (seen < lines && size > MAX_HEAD_BYTES) return undefined
    }
    return Buffer.concat(chunks).toString('utf8')
  } catch {
    return undefined
  } finally {
    await fd.close()
  }
}

const treeFiles = (dir: string) => (wanted: Wanted[]) => fewAtOnce(wanted.map((w) => () => head(join(dir, w.path), w.lines)))

/** A `git diff-tree -z` record's head: `:<mode> <mode> <oid> <oid> <status>`, the new side's oid third. */
const RAW = /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) [A-Z]/
/** A `cat-file --batch-check` answer for a blob: its id and bytes. */
const BLOB = /^([0-9a-f]{40,64}) blob (\d+)$/

/**
 * Files as `commit` holds them, by their object ids: one `diff-tree` names each new side's blob (asking `cat-file` by
 * `<commit>:<path>` walks the trees once per file, seconds on a wide commit of deep paths), a `cat-file --batch-check`
 * their sizes, and one `cat-file --batch` reads those up to `MAX_BEFORE_BLOB_BYTES` each, `MAX_READ_BEFORE_BLOB_BYTES`
 * in all, each answered as a header (`<oid> blob <bytes>`), its bytes and a newline. Anything but a blob (a submodule)
 * reads as none.
 */
const commitFiles = (dir: string, parent: string, commit: string) => async (wanted: Wanted[]) => {
  const raw = (await gitBytes(dir, ['diff-tree', '-r', '-z', '--no-renames', '--no-commit-id', parent, commit], '')).toString('utf8').split('\0')
  const oids = new Map<string, string>()
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const m = RAW.exec(raw[i])
    if (m) oids.set(raw[i + 1], m[1])
  }
  const asked = wanted.flatMap((w) => (oids.has(w.path) ? [{ path: w.path, oid: oids.get(w.path)! }] : []))
  if (!asked.length) return wanted.map(() => undefined)
  const heads = (await gitBytes(dir, ['cat-file', '--batch-check'], asked.map((a) => `${a.oid}\n`).join(''))).toString('utf8').split('\n')
  let left = MAX_READ_BEFORE_BLOB_BYTES
  const blobs = asked.flatMap((a, i) => {
    const size = Number(BLOB.exec(heads[i])?.[2] ?? Infinity)
    if (size > MAX_BEFORE_BLOB_BYTES || size > left) return []
    left -= size
    return [{ ...a, size }]
  })
  if (!blobs.length) return wanted.map(() => undefined)
  const out = await gitBytes(dir, ['cat-file', '--batch'], blobs.map((b) => `${b.oid}\n`).join(''))
  let at = 0
  const texts = new Map(blobs.map((b) => {
    const start = out.indexOf(10, at) + 1
    at = start + b.size + 1
    return [b.path, out.toString('utf8', start, start + b.size)]
  }))
  return wanted.map((w) => texts.get(w.path))
}

/** The working tree's diff from `from`, untracked files with it. */
const treeDiff = async (dir: string, from: string) => {
  const untracked = (await git(dir, ['ls-files', '-z', '--others', '--exclude-standard'])).split('\0').filter(Boolean)
  const shown = untracked.slice(0, MAX_UNTRACKED)
  const outs = await Promise.all([git(dir, [...DIFF, from]), ...shown.map((file) => untrackedDiff(dir, file))])
  // git names tracked files from the repo's top, which a hub in a subdirectory of the repo isn't.
  const top = (await git(dir, ['rev-parse', '--show-toplevel'])).trim()
  return { files: byPath(await withBeforeAll(outs.flatMap(parseDiff), treeFiles(top))), more: untracked.length - shown.length }
}

/**
 * What a commit's own changes are diffed from: its first parent, or the empty tree for a root (a history merged in
 * unrelated, `subtree add`, a shallow clone's boundary).
 */
const parentOf = async (dir: string, sha: string): Promise<string> =>
  (await git(dir, ['rev-list', '--parents', '-n', '1', sha])).trim().split(' ')[1] ?? (await git(dir, ['hash-object', '-t', 'tree', '/dev/null'])).trim()

const repoChanges = async (dir: string, scope: ChangesScope): Promise<RepoChanges> => {
  const against = await againstFor(dir)
  const since = (await git(dir, ['merge-base', against, 'HEAD'])).trim()
  const commits = await commitsSince(dir, since)
  const base = { dir, against, since, commits }
  if (scope === 'all') return { ...base, shows: 'all', ...(await treeDiff(dir, since)) }
  if (scope === 'uncommitted') return { ...base, shows: 'uncommitted', ...(await treeDiff(dir, 'HEAD')) }
  const commit = commits.find((c) => c.sha.startsWith(scope.commit))
  if (!commit) return { ...base, shows: scope.commit, files: [], more: 0 }
  const parent = await parentOf(dir, commit.sha)
  const files = parseDiff(await git(dir, [...DIFF, parent, commit.sha]))
  return { ...base, shows: commit.sha, files: byPath(await withBeforeAll(files, commitFiles(dir, parent, commit.sha))), more: 0 }
}

/** The changes in each of a session's dirs that is a repo, in its order, as `scope` shows them. */
export const changesIn = async (dirs: string[], scope: ChangesScope = 'all'): Promise<RepoChanges[]> => {
  const repos = await Promise.all(dirs.map(async (dir) => ((await isRepo(dir)) ? dir : undefined)))
  return Promise.all(repos.filter((dir): dir is string => dir !== undefined).map((dir) => repoChanges(dir, scope)))
}
