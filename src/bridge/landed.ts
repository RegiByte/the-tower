/**
 * What landed on a repo's default branch: its first-parent history, each commit there one landing at the time it
 * reached the branch (its committer time), with the lines it changed against the branch before it. A merge is one
 * landing that brought several commits, its lines those of all of them; a commit made straight on the branch, or a
 * squash, is one.
 */

/** The `git log` format `parseLog` reads: a record separator, then the hash, committer time (s) and parents, unit-separated. */
export const LANDED_FORMAT = '%x1e%H%x1f%ct%x1f%P'

/** The `git log` arguments that walk the landings: first parents only, a merge's lines against its first parent. */
export const LANDED_ARGS = ['--first-parent', '--diff-merges=first-parent', '--numstat', `--format=${LANDED_FORMAT}`]

/** One file of a landing: its path (the new one, for a rename), lines added and removed; a binary file changes none. */
export type LandedFile = [path: string, added: number, removed: number]

/** A landing as `git log` prints it. `at`: the committer time, epoch ms. */
export type Logged = { hash: string; at: number; parents: string[]; files: LandedFile[] }

/** A landing: `commits` it brought to the branch, itself included (a merge's are counted by git), and its lines. */
export type Landed = { hash: string; at: number; merge: boolean; commits: number; files: LandedFile[] }

/**
 * What landed on a repo's default branch in a window. `dir`: the repo's top level, so two dirs in one repo read it
 * once; `branch` is undefined when origin/HEAD isn't set.
 */
export type RepoLanded = { dir: string; branch: string | undefined; commits: Landed[] }

/** `a => b` and `dir/{a => b}/x` name the file after the rename. */
const renamed = (path: string) => path.replace(/\{[^{}]* => ([^{}]*)\}/, '$1').replace(/^.* => /, '').replace('//', '/')

const count = (n: string) => (n === '-' ? 0 : Number(n))

export const parseLog = (stdout: string): Logged[] =>
  stdout.split('\x1e').filter(Boolean).map((record) => {
    const [head, ...lines] = record.split('\n')
    const [hash, ct, parents] = head.split('\x1f')
    const files = lines.filter(Boolean).map((line): LandedFile => {
      const [added, removed, path] = line.split('\t')
      return [renamed(path), count(added), count(removed)]
    })
    return { hash, at: Number(ct) * 1000, parents: parents.trim().split(' ').filter(Boolean), files }
  })

/** A logged landing with the commits it brought, which only a merge's history can tell. */
export const landed = ({ hash, at, parents, files }: Logged, commits: number): Landed => ({ hash, at, merge: parents.length > 1, commits, files })

/** A file's extension as the stats group lines by it: `.ts`, or the whole name when it has none (`Makefile`). */
export const extensionOf = (path: string) => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot) : name
}
