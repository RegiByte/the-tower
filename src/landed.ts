/** What landed on each repo's default branch, read from git when asked: nothing is kept. */
import { LANDED_ARGS, landed, parseLog, type RepoLanded } from './bridge/landed.ts'
import { git } from './git.ts'
import { isRepo, originHeadOf } from './worktrees.ts'

/**
 * The landings on the repo's origin/HEAD whose time falls in [from, to), as of the last fetch; a merge counts the
 * commits it brought, itself included (`rev-list --count M^1..M`).
 */
export async function readLanded(dir: string, from: number, to: number): Promise<RepoLanded> {
  if (!(await isRepo(dir))) return { dir, branch: undefined, commits: [] }
  const top = (await git(dir, ['rev-parse', '--show-toplevel'])).trim()
  const branch = await originHeadOf(dir)
  if (!branch) return { dir: top, branch, commits: [] }
  const out = await git(dir, ['log', branch, ...LANDED_ARGS, `--since=${new Date(from).toISOString()}`, `--until=${new Date(to).toISOString()}`])
  const logged = parseLog(out).filter((c) => c.at >= from && c.at < to)
  const commits = await Promise.all(logged.map(async (c) => (c.parents.length > 1 ? Number(await git(dir, ['rev-list', '--count', `${c.hash}^1..${c.hash}`])) : 1)))
  return { dir: top, branch, commits: logged.map((c, i) => landed(c, commits[i])) }
}
