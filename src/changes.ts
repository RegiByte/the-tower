/**
 * What a worker changed in its repos, through git: on a branch the tower cut, everything since it left its base
 * (commits, staged, unstaged and untracked); on a branch with an upstream, everything since it left the upstream;
 * anywhere else, everything since `HEAD`. Files outside the repos aren't
 * seen. Git is read on every request, never kept.
 */
import { parseDiff, type DiffFile } from './bridge/diff.ts'
import { againstFor, git, isRepo, run } from './worktrees.ts'

/** Untracked files diffed one by one past this many would be a forgotten ignore rule, not work. */
const MAX_UNTRACKED = 300

/**
 * One repo's changes. `against`: the ref they're counted from (the branch's base, its upstream, or `HEAD`), and `since` the commit
 * that is (the merge-base with that base). `more`: untracked files left out past `MAX_UNTRACKED`.
 */
export type RepoChanges = { dir: string; against: string; since: string; files: DiffFile[]; more: number }

/** Every config of the user's that changes what `git diff` prints, set back to what the parser reads. */
const DIFF = ['-c', 'core.quotepath=false', 'diff', '-M', '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/']

/** An untracked file as a diff against nothing: `--no-index` exits 1 when there is a difference, which there always is. */
const untrackedDiff = async (dir: string, file: string): Promise<string> => {
  const r = await run(dir, [...DIFF, '--no-index', '--', '/dev/null', file])
  if (r.code > 1) throw new Error(`git diff --no-index ${file} in ${dir}: ${r.stderr.trim()}`)
  return r.stdout
}

const repoChanges = async (dir: string): Promise<RepoChanges> => {
  const against = await againstFor(dir)
  const since = (await git(dir, ['merge-base', against, 'HEAD'])).trim()
  const untracked = (await git(dir, ['ls-files', '-z', '--others', '--exclude-standard'])).split('\0').filter(Boolean)
  const shown = untracked.slice(0, MAX_UNTRACKED)
  const outs = await Promise.all([git(dir, [...DIFF, since]), ...shown.map((file) => untrackedDiff(dir, file))])
  return { dir, against, since, files: outs.flatMap(parseDiff), more: untracked.length - shown.length }
}

/** The changes in each of a session's dirs that is a repo, in its order. */
export const changesIn = async (dirs: string[]): Promise<RepoChanges[]> => {
  const repos = await Promise.all(dirs.map(async (dir) => ((await isRepo(dir)) ? dir : undefined)))
  return Promise.all(repos.filter((dir): dir is string => dir !== undefined).map(repoChanges))
}
