/**
 * `tower update`: moves this checkout to the newest release, a tag `vX.Y.Z` here or on its remote. It shows the
 * CHANGELOG.md entries it passes, checks the tag out (refused while tracked files have changes), installs, rebuilds
 * Tower 3D when it was built, and restarts the tower when it was running. The host is never restarted, since that
 * ends every session: when a file the host's code is built from changed after the running host started (its control
 * socket was made), the update says so, after this update or any before it. The jobs daemon is restarted when its code
 * changed so and it runs no job, since a restart ends every running job; while one runs, the update says so instead.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { bringDown, bringUp, daemonsNamed, heldJobs, hostLive, JOBS_SCRIPT, REPO, startedPid, type Daemon } from './machine.ts'
import { towerPort } from './shared/model.ts'
import type { SystemPaths } from './shared/model.ts'
import { readConfig } from './system.ts'
import { withoutParentSession } from './shared/env.ts'
import { git, run, wholeTree } from './git.ts'
import { CliError } from './cli-error.ts'

const RELEASE = 'v*.*.*'

/** The releases after `from` up to `to`, oldest first, out of `tags` sorted as versions; every one up to `to` without `from`. */
export const releasesBetween = (tags: string[], from: string | undefined, to: string): string[] =>
  tags.slice(from === undefined ? 0 : tags.indexOf(from) + 1, tags.indexOf(to) + 1)

/** The changelog's entries for `releases`, newest first as written: each its `## <tag>` heading and what follows. */
export const entriesFor = (changelog: string, releases: string[]): string[] =>
  changelog.split(/^(?=## )/m).filter((section) => releases.includes(section.split('\n')[0].slice('## '.length).trim()))

/** Every file a daemon's code is built from, relative to the checkout, read from the imports of its `script`. */
const sourcesOf = async (script: string): Promise<string[]> => {
  const { build } = await import('esbuild')
  const { metafile } = await build({
    entryPoints: [script],
    absWorkingDir: REPO,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    write: false,
    metafile: true,
    logLevel: 'silent',
  })
  return Object.keys(metafile.inputs)
}

const npm = (...args: string[]) => execFileSync('npm', args, { cwd: REPO, stdio: 'inherit', env: withoutParentSession(process.env) })

export async function update(paths: SystemPaths): Promise<void> {
  await git(REPO, ['fetch', '--tags', '--quiet'])
  const tags = (await git(REPO, ['tag', '--list', RELEASE, '--sort=v:refname'])).split('\n').filter(Boolean)
  const newest = tags.at(-1)
  if (newest === undefined) throw new CliError(`No release tag (${RELEASE}) in ${REPO} or on its remote`)
  if ((await run(REPO, ['merge-base', '--is-ancestor', newest, 'HEAD'])).code === 0) return console.log(`Up to date: this checkout has ${newest}, the newest release.`)
  const described = await run(REPO, ['describe', '--tags', '--abbrev=0', '--match', RELEASE])
  const from = described.code === 0 ? described.stdout.trim() : undefined
  const changelog = await git(REPO, ['show', `${newest}:CHANGELOG.md`])
  console.log(`${from ?? 'this checkout'} → ${newest}\n\n${entriesFor(changelog, releasesBetween(tags, from, newest)).join('').trim()}\n`)
  if ((await git(REPO, ['status', '--porcelain', '--untracked-files=no'])).trim()) throw new CliError(`${REPO} has uncommitted changes: commit or stash them, then update again`)

  const [jobs, tower] = daemonsNamed(paths, towerPort(readConfig(paths.config)), ['jobs', 'tower'])
  const towerUp = (await tower.holder()).t === 'ours' || (await startedPid(tower)) !== undefined
  const tower3d = existsSync(path.join(REPO, 'renderers', 'tower3d', 'out'))
  if (towerUp) console.log(`tower: ${await bringDown(tower)}`)
  try {
    await wholeTree(REPO, ['checkout', '--quiet', newest])
    console.log(`checked out ${newest}`)
    npm('ci')
    if (tower3d) npm('run', 'tower3d')
  } finally {
    if (towerUp) console.log(`tower: ${await bringUp(tower)} · ${tower.where}`)
  }

  await updateJobs(paths, jobs)
  if (!(await hostLive(paths))) return
  const changed = await changedSince(paths.control, 'src/host/main.ts')
  if (changed.length)
    console.log(
      `\nThe running host is older than this checkout (${changed.join(', ')}): it updates when restarted (tower down, then tower up), which ends every session and shell. Restart it when no session is mid-turn; sessions can be resumed.`,
    )
}

/** The files `script` is built from that changed after the daemon serving at `socket` started, when it made the socket. */
const changedSince = async (socket: string, script: string): Promise<string[]> => {
  const started = statSync(socket).birthtimeMs
  return (await sourcesOf(script)).filter((file) => statSync(path.join(REPO, file)).mtimeMs > started)
}

/** Restarts the jobs daemon when its code changed since it started and it runs no job; says why not otherwise. */
const updateJobs = async (paths: SystemPaths, jobs: Daemon) => {
  const held = await heldJobs(paths)
  if (!held) return console.log(`jobs: not running · tower up starts it`)
  const changed = await changedSince(jobs.where, JOBS_SCRIPT)
  if (!changed.length) return
  const running = held.filter((job) => job.endedAt === undefined)
  if (!running.length) {
    console.log(`jobs: ${await bringDown(jobs)}`)
    return console.log(`jobs: ${await bringUp(jobs)} · ${jobs.where}`)
  }
  console.log(
    `\nThe running jobs daemon is older than this checkout (${changed.join(', ')}), and runs ${running.length} job(s): it updates when restarted (tower down jobs, then tower up jobs), which ends every running job. Restart it once they end.`,
  )
}
