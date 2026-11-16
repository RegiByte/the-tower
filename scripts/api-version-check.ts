/**
 * Check: a pull request that moves `API_VERSION` moves it past the base's.
 *
 *   tsx scripts/api-version-check.ts <base> <head>
 *
 * Two branches that set the same number merge with no conflict, because git sees one identical change, so the merged
 * tree holds a number the base already had. The change is the PR's own diff (merge base to head): when it touches
 * `API_VERSION`, the head's value must exceed the base's, else the message names the base's and the next free number.
 * CI runs it on a pull request's merge commit with its two parents (`HEAD^1`, `HEAD^2`); locally, `origin/main HEAD`.
 * The served `tower.js` reads the value from `src/shared/api.ts`, so that is the one constant.
 */
import { execFileSync } from 'node:child_process'

const FILE = 'src/shared/api.ts'

type Version = { major: number; minor: number }

export const parseVersion = (source: string): Version => {
  const m = /export const API_VERSION = '(\d+)\.(\d+)'/.exec(source)
  if (!m) throw new Error(`${FILE} has no \`export const API_VERSION = 'major.minor'\`: update scripts/api-version-check.ts to where it now lives`)
  return { major: Number(m[1]), minor: Number(m[2]) }
}

const show = ({ major, minor }: Version) => `${major}.${minor}`
const exceeds = (a: Version, b: Version) => a.major !== b.major ? a.major > b.major : a.minor > b.minor

/** The failure message, or null when the pull request leaves `API_VERSION` alone or moves it past the base. */
export const verdict = (mergeBase: Version, head: Version, base: Version): string | null => {
  const touched = show(mergeBase) !== show(head)
  if (!touched || exceeds(head, base)) return null
  return `API_VERSION: this pull request sets ${show(head)}, and the base already holds ${show(base)}. Set ${base.major}.${base.minor + 1} (or a major bump) so the two do not merge as one change.`
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const versionAt = (rev: string) => parseVersion(git('show', `${rev}:${FILE}`))

if (import.meta.main) {
  const [base, head] = process.argv.slice(2)
  if (!base || !head) throw new Error('usage: tsx scripts/api-version-check.ts <base> <head>')
  const message = verdict(versionAt(git('merge-base', base, head)), versionAt(head), versionAt(base))
  if (message) { console.error(message); process.exit(1) }
  console.log('API_VERSION: ok')
}
