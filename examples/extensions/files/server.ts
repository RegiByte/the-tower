/**
 * The files extension's reads, over a worker's checkout: the dirs it works in, from the board (its worktree in each of
 * the floor's dirs, or the floor's main checkouts). `tree` lists one folder, `status` says what git sees changed in
 * each repo, `stat` describes one file, and `raw` serves one, its bytes, for the views by type. Every path is resolved
 * through its links and refused unless it stays inside the repo it names; `.git` is never listed or served.
 */
import { createHash } from 'node:crypto'
import { open, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Card, Floor } from '../../../src/bridge/board.ts'
import type { CallCtx, StartCtx } from '../../../src/shared/extensions.ts'
import { mediaTypeOf } from '../../../src/shared/media.ts'
import { checkoutDirs } from '../../../src/shared/model.ts'
import { repoName } from '../../../src/shared/reviews.ts'

type Refusal = { t: 'error'; code: 'not_found' | 'refused' | 'invalid'; message: string }
type Repo = { repo: string; dir: string }
type Entry = { name: string; kind: 'dir' | 'file'; ignored?: true; link?: true; outside?: true }

/** The most entries a folder lists: the rest are counted, not sent. */
const MAX_ENTRIES = 2000
/** The bytes read to tell a text file from a binary one: a NUL among them is binary. */
const SNIFF_BYTES = 8192
/** The largest file served. */
const MAX_SERVED = 50 * 1024 * 1024

const refusal = (code: Refusal['code'], message: string): Refusal => ({ t: 'error', code, message })

/** Whether `full` is `dir` or below it. */
const inside = (full: string, dir: string) => full === dir || full.startsWith(`${dir}/`)

/** Whether a path names `.git` or anything in it, at any depth. */
const inGit = (rel: string) => rel.split('/').includes('.git')

/** A git status line's mark: `U` untracked, `A` added, `D` deleted, `R` renamed, `C` in conflict, else `M`. */
const markOf = (xy: string): string =>
  xy === '??' ? 'U' : /U|AA|DD/.test(xy) ? 'C' : xy.includes('R') ? 'R' : xy.includes('A') ? 'A' : xy.includes('D') ? 'D' : 'M'

/** `git status --porcelain -z` as a mark by path; a rename's old path is skipped. */
const marksOf = (out: string): Record<string, string> => {
  const marks: Record<string, string> = {}
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]
    if (line.length < 4) continue
    const xy = line.slice(0, 2)
    marks[line.slice(3)] = markOf(xy)
    if (xy.includes('R') || xy.includes('C')) i++
  }
  return marks
}

export default (ctx: StartCtx) => {
  /** The card `id` on floor `project`, and that floor, as the system holds them now: an archived worker's too. */
  const cardOf = (call: CallCtx, project: string, id: string): { card: Card; floor: Floor } | Refusal => {
    const floor = ctx.board().floors.find((f) => f.id === project)
    const card = call.cards().find((c) => c.id === id && c.project === project)
    return floor && card ? { card, floor } : refusal('not_found', `no worker ${id} on ${project}`)
  }

  /** The repos of a worker's checkout that exist, each named as a review anchor names it. */
  const reposOf = async (floor: Floor, card: Card): Promise<Repo[]> => {
    const dirs = checkoutDirs(floor, card.checkout)
    const real = await Promise.all(dirs.map((dir) => realpath(dir).catch(() => undefined)))
    return dirs.flatMap((dir, i) => (real[i] ? [{ repo: repoName(dir), dir: real[i] }] : []))
  }

  /** The real path of `rel` in the repo `repo` of the worker's checkout, or why it can't be read there. */
  const placed = async (call: CallCtx, project: string, id: string, repo: string, rel: string): Promise<{ full: string; at: Repo } | Refusal> => {
    const found = cardOf(call, project, id)
    if ('t' in found) return found
    const at = (await reposOf(found.floor, found.card)).find((r) => r.repo === repo)
    if (!at) return refusal('not_found', `${found.card.callsign}'s checkout has no repo ${repo}`)
    if (path.isAbsolute(rel)) return refusal('refused', `${rel} is absolute: name a path inside ${repo}`)
    if (inGit(rel)) return refusal('refused', `${rel} is inside .git, which the explorer never reads`)
    const named = path.resolve(at.dir, rel)
    if (!inside(named, at.dir)) return refusal('refused', `${rel} leaves ${found.card.callsign}'s checkout of ${repo}`)
    const full = await realpath(named).catch(() => undefined)
    if (!full) return refusal('not_found', `${repo} has no ${rel}`)
    if (!inside(full, at.dir) || inGit(path.relative(at.dir, full))) return refusal('refused', `${rel} links outside ${found.card.callsign}'s checkout of ${repo}`)
    return { full, at }
  }

  /**
   * The paths of `paths` (relative to `dir`, a folder's with a trailing slash, a link's without: git refuses a path
   * through a link) git ignores; none outside a repo.
   */
  const ignoredOf = async (dir: string, paths: string[]): Promise<Set<string>> => {
    if (!paths.length) return new Set()
    const ran = await ctx.run(['git', 'check-ignore', '-z', '--stdin'], { cwd: dir, stdin: paths.join('\0') + '\0' })
    return new Set(ran.exit === 0 ? ran.stdout.split('\0').filter(Boolean) : [])
  }

  /** Whether the first bytes of `full` hold a NUL. */
  const binary = async (full: string): Promise<boolean> => {
    const file = await open(full)
    try {
      const buf = Buffer.alloc(SNIFF_BYTES)
      const { bytesRead } = await file.read(buf, 0, SNIFF_BYTES, 0)
      return buf.subarray(0, bytesRead).includes(0)
    } finally {
      await file.close()
    }
  }

  return {
    reads: {
      'repos/<project>/<id>': async ({ params }: { params: { project: string; id: string } }, call: CallCtx) => {
        const found = cardOf(call, params.project, params.id)
        if ('t' in found) return found
        return { repos: (await reposOf(found.floor, found.card)).map(({ repo }) => repo) }
      },

      'tree/<project>/<id>': async ({ params, query }: { params: { project: string; id: string }; query: { repo: string; path?: string } }, call: CallCtx) => {
        const rel = query.path ?? ''
        const at = await placed(call, params.project, params.id, query.repo, rel || '.')
        if ('t' in at) return at
        const dirents = await readdir(at.full, { withFileTypes: true }).catch(() => undefined)
        if (!dirents) return refusal('not_found', `${rel || query.repo} is no folder`)
        const listed = dirents.filter((d) => d.name !== '.git').sort((a, b) => a.name.localeCompare(b.name))
        const shown = listed.slice(0, MAX_ENTRIES)
        const kinds = await Promise.all(
          shown.map(async (d): Promise<Entry['kind']> => (d.isSymbolicLink() ? ((await stat(path.join(at.full, d.name)).catch(() => undefined))?.isDirectory() ? 'dir' : 'file') : d.isDirectory() ? 'dir' : 'file')),
        )
        const targets = await Promise.all(shown.map((d) => (d.isSymbolicLink() ? realpath(path.join(at.full, d.name)).catch(() => undefined) : undefined)))
        const outside = (i: number) => shown[i].isSymbolicLink() && !(targets[i] && inside(targets[i], at.at.dir) && !inGit(path.relative(at.at.dir, targets[i])))
        const pathOf = (i: number) => (rel ? `${rel}/` : '') + shown[i].name + (kinds[i] === 'dir' && !shown[i].isSymbolicLink() ? '/' : '')
        const ignored = await ignoredOf(at.at.dir, shown.map((_, i) => pathOf(i)))
        const entries = shown
          .map((d, i): Entry => ({
            name: d.name,
            kind: kinds[i],
            ...(ignored.has(pathOf(i)) && { ignored: true as const }),
            ...(d.isSymbolicLink() && { link: true as const }),
            ...(outside(i) && { outside: true as const }),
          }))
          .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'dir' ? -1 : 1))
        return { repo: query.repo, path: rel, entries, more: listed.length - shown.length }
      },

      'status/<project>/<id>': async ({ params }: { params: { project: string; id: string } }, call: CallCtx) => {
        const found = cardOf(call, params.project, params.id)
        if ('t' in found) return found
        const hash = createHash('sha1')
        const repos = await Promise.all(
          (await reposOf(found.floor, found.card)).map(async ({ repo, dir }) => {
            const ran = await ctx.run(['git', '-c', 'core.quotepath=false', 'status', '--porcelain', '-z'], { cwd: dir, timeoutMs: 20_000 })
            hash.update(`${repo}\0${ran.stdout}\0`)
            return ran.exit === 0 ? { repo, marks: marksOf(ran.stdout) } : { repo, marks: {}, problem: ran.stderr.trim() || 'not a git repo' }
          }),
        )
        return { repos, stamp: hash.digest('hex') }
      },

      'stat/<project>/<id>': async ({ params, query }: { params: { project: string; id: string }; query: { repo: string; path: string } }, call: CallCtx) => {
        const at = await placed(call, params.project, params.id, query.repo, query.path)
        if ('t' in at) return at
        const s = await stat(at.full)
        if (!s.isFile()) return refusal('invalid', `${query.path} is no file`)
        const type = mediaTypeOf(query.path)
        const sniffed = type === 'application/octet-stream' && !(await binary(at.full)) ? 'text/plain' : type
        return { repo: query.repo, path: query.path, size: s.size, mtime: s.mtimeMs, type: sniffed, file: at.full }
      },

      'raw/<project>/<id>/<repo>/<file...>': async ({ params }: { params: { project: string; id: string; repo: string; file: string } }, call: CallCtx) => {
        const at = await placed(call, params.project, params.id, params.repo, params.file)
        if ('t' in at) return at
        const s = await stat(at.full)
        if (!s.isFile()) return refusal('invalid', `${params.file} is no file`)
        if (s.size > MAX_SERVED) return refusal('refused', `${params.file} is ${Math.round(s.size / 1024 / 1024)} MB, over the 50 MB the explorer serves: open it in your editor`)
        return { file: at.full }
      },
    },
  }
}
