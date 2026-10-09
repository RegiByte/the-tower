/**
 * What a worker changed in its repos, through git: on a branch the tower cut, everything since it left its base
 * (commits, staged, unstaged and untracked); on a branch with an upstream, everything since it left the upstream;
 * anywhere else, everything since `HEAD`. A scope narrows it to what isn't committed yet, or to one of the commits
 * since the base. Files outside the repos aren't seen. Git is read on every request, never kept.
 */
import { parseDiff, type DiffFile } from './bridge/diff.ts'
import { git, run } from './git.ts'
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
const DIFF = ['-c', 'core.quotepath=false', 'diff', '-M', '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/']

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

/** The working tree's diff from `from`, untracked files with it. */
const treeDiff = async (dir: string, from: string) => {
  const untracked = (await git(dir, ['ls-files', '-z', '--others', '--exclude-standard'])).split('\0').filter(Boolean)
  const shown = untracked.slice(0, MAX_UNTRACKED)
  const outs = await Promise.all([git(dir, [...DIFF, from]), ...shown.map((file) => untrackedDiff(dir, file))])
  return { files: outs.flatMap(parseDiff), more: untracked.length - shown.length }
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
  return { ...base, shows: commit.sha, files: parseDiff(await git(dir, [...DIFF, `${commit.sha}^`, commit.sha])), more: 0 }
}

/** The changes in each of a session's dirs that is a repo, in its order, as `scope` shows them. */
export const changesIn = async (dirs: string[], scope: ChangesScope = 'all'): Promise<RepoChanges[]> => {
  const repos = await Promise.all(dirs.map(async (dir) => ((await isRepo(dir)) ? dir : undefined)))
  return Promise.all(repos.filter((dir): dir is string => dir !== undefined).map((dir) => repoChanges(dir, scope)))
}
