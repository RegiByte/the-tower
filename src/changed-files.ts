/**
 * Which files a checkout changed, as git reads them: what a worker's Changes show (`src/changes.ts`) and what the board
 * counts of them (`src/worktrees.ts`), one definition for both, so a tally drawn from the board is the one the Changes
 * show once read.
 */
import { git, run } from './git.ts'

/** Untracked files diffed one by one past this many would be a forgotten ignore rule, not work. */
export const MAX_UNTRACKED = 300

/** Every config of the user's that changes what `git diff` prints, set back to what the parser reads. */
export const DIFF = ['-c', 'core.quotepath=false', '-c', 'diff.suppressBlankEmpty=false', '-c', 'diff.submodule=short', '-c', 'diff.relative=false', 'diff', '-U3', '-M', '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/']

/** The files git doesn't track and doesn't ignore, by their paths from `dir`. */
export const untrackedIn = async (dir: string): Promise<string[]> => (await git(dir, ['ls-files', '-z', '--others', '--exclude-standard'])).split('\0').filter(Boolean)

/**
 * The commit a checkout's work is counted from: where `head` left `against`; `undefined` when the two share no history.
 */
export const sinceOf = async (dir: string, against: string, head: string): Promise<string | undefined> => {
  const r = await run(dir, ['merge-base', against, head])
  if (r.code > 1) throw new Error(`git merge-base ${against} ${head} in ${dir}: ${r.stderr.trim()}`)
  return r.code === 0 ? r.stdout.trim() : undefined
}

/**
 * How many files the working tree changed since commit `since`, committed and not: the files of its diff, renames as
 * one, and untracked files up to `MAX_UNTRACKED`. The Changes' files under scope `all`, counted without their diffs.
 */
export const changedSince = async (dir: string, since: string): Promise<number> => {
  const [names, untracked] = await Promise.all([git(dir, [...DIFF, '--name-only', '-z', since]), untrackedIn(dir)])
  return names.split('\0').filter(Boolean).length + Math.min(untracked.length, MAX_UNTRACKED)
}
