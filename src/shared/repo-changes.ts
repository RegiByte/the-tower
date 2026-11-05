/**
 * What a worker's changes are as data: a repo's commits and files, each file's hunks as git printed them. Read by
 * `src/changes.ts` and `src/bridge/diff.ts` on the server, drawn by every renderer, so nothing here does I/O.
 */

/**
 * One region of a file: `old` and `new` are the first line's numbers, each line keeps git's mark (` `, `+`, `-`, `\`).
 * `before`: the unchanged lines since the last hunk (or the file's start), the same on both sides, so a renderer reads
 * each hunk in the code it stands in (a comment or a string opened above it). On every hunk of a file or on none: absent when `withBefore` didn't read them.
 */
export type Hunk = { old: number; new: number; heading: string; lines: string[]; before?: string[] }

export type DiffFile = {
  path: string
  /** The path it was renamed from. */
  from?: string
  change: 'added' | 'deleted' | 'modified' | 'renamed'
  binary: boolean
  added: number
  removed: number
  /** Changes whenever the file's diff does: a mark set on one version of the file holds only for that version. */
  hash: string
  /** Absent for a binary file, or one past `MAX_FILE_LINES`. */
  hunks?: Hunk[]
}

/** A commit since the base: its hash, the first line of its message, and when it was made (ISO). */
export type Commit = { sha: string; subject: string; at: string }

/**
 * One repo's changes. `against`: the ref they're counted from (the branch's base, its upstream, or `HEAD`), and `since` the commit
 * that is (the merge-base with that base). `commits`: the commits since then, newest first, whatever the scope.
 * `shows`: what `files` hold, `all`, `uncommitted`, or a commit of `commits` (none, in a repo without that commit).
 * `more`: untracked files left out past `MAX_UNTRACKED`.
 */
export type RepoChanges = { dir: string; against: string; since: string; commits: Commit[]; shows: 'all' | 'uncommitted' | string; files: DiffFile[]; more: number }
