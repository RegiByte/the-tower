/**
 * The jobs daemon's one promise about processes, checked on whatever platform runs the tests (CI's is Linux): a daemon
 * killed outright takes its jobs' process groups with it, the next daemon ends what a job that ignores SIGHUP left, and a
 * cancel ends a job's whole group.
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { connectJobs } from '../src/shared/client.ts'
import { withoutParentSession } from '../src/shared/env.ts'
import { systemPaths } from '../src/shared/paths.ts'
import { answers } from '../src/shared/socket.ts'
import { jobGroup, signalGroup } from '../src/jobs/groups.ts'

const DAEMON = path.join(import.meta.dirname, '..', 'src', 'jobs', 'main.ts')
const roots: string[] = []
const daemons: ChildProcess[] = []
const groups: Group[] = []

/** A job's process group, its pgid, and when the job started. */
type Group = { pid: number; startedAt: number }

const until = async (holds: () => Promise<boolean>, ms: number, what: string) => {
  for (const deadline = Date.now() + ms; !(await holds()); await new Promise((r) => setTimeout(r, 100)))
    if (Date.now() > deadline) assert.fail(`${what} within ${ms} ms`)
}

/** A system root of its own: the temp folder, short enough for a socket path. */
const newRoot = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'jobs-'))
  roots.push(root)
  return systemPaths(path.join(root, 'config.json'))
}

const startDaemon = async (paths: ReturnType<typeof systemPaths>) => {
  const daemon = spawn(process.execPath, ['--import', 'tsx', DAEMON], { env: { ...withoutParentSession(process.env), TOWER_CONFIG: paths.config }, stdio: 'ignore' })
  daemons.push(daemon)
  await until(() => answers(paths.jobsSocket), 15_000, 'the jobs daemon answers')
  return daemon
}

const killed = async (daemon: ChildProcess) => {
  const exited = new Promise((resolve) => daemon.once('exit', resolve))
  daemon.kill('SIGKILL')
  await exited
}

/** Starts `script` under `sh` as a job and answers its group once `members` processes run in it. */
const startJob = async (paths: ReturnType<typeof systemPaths>, script: string, members: number) => {
  const jobs = await connectJobs(paths.jobsSocket)
  const started = await jobs.request({ t: 'start', argv: ['sh', '-c', script], cwd: os.tmpdir(), owner: 'test', label: script })
  assert.equal(started.t, 'started', JSON.stringify(started))
  const listed = await jobs.request({ t: 'list' })
  jobs.close()
  assert.equal(listed.t, 'jobs')
  const { pid, startedAt } = listed.jobs.find((j) => j.id === (started as { id: string }).id)!
  groups.push({ pid, startedAt })
  await until(async () => (await jobGroup(pid, startedAt)).length === members, 5000, `${members} processes run in the job "${script}"`)
  return { pid, startedAt }
}

const alive = async ({ pid, startedAt }: Group) => (await jobGroup(pid, startedAt)).length > 0

after(async () => {
  for (const group of groups) if (await alive(group)) signalGroup(group.pid, 'SIGKILL')
  for (const daemon of daemons) if (daemon.exitCode === null && daemon.signalCode === null) daemon.kill('SIGKILL')
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

test('a jobs daemon killed outright takes its jobs with it: a lone command, and a shell with a child in its group', async () => {
  const paths = newRoot()
  const daemon = await startDaemon(paths)
  const lone = await startJob(paths, 'exec sleep 300', 1)
  const parent = await startJob(paths, 'sleep 300 & wait', 2)
  await killed(daemon)
  await until(async () => !(await alive(lone)) && !(await alive(parent)), 5000, "every job's process group ends with the daemon")
})

test('a job that ignores SIGHUP outlives a daemon killed outright, and the next daemon ends its group', async () => {
  const paths = newRoot()
  const first = await startDaemon(paths)
  const group = await startJob(paths, `trap '' HUP; sleep 300 & wait`, 2)
  await killed(first)
  await new Promise((r) => setTimeout(r, 1000))
  assert.ok(await alive(group), 'the job ignoring SIGHUP and its child still run once the daemon is gone')
  const next = await startDaemon(paths)
  await until(async () => !(await alive(group)), 10_000, 'the next daemon ends the group the job left')
  next.kill('SIGTERM')
})

test('a cancel ends the whole group: a member that ignores TERM and HUP is killed once the grace runs out', async () => {
  const paths = newRoot()
  const daemon = await startDaemon(paths)
  const group = await startJob(paths, `(trap '' TERM HUP; exec sleep 300) & wait`, 2)
  const jobs = await connectJobs(paths.jobsSocket)
  const listed = await jobs.request({ t: 'list' })
  const { id } = (listed as { jobs: { id: string; pid: number }[] }).jobs.find((j) => j.pid === group.pid)!
  assert.equal((await jobs.request({ t: 'cancel', id, by: 'test' })).t, 'ok')
  jobs.close()
  await until(async () => !(await alive(group)), 10_000, "the job's group ends, the member ignoring TERM included")
  daemon.kill('SIGTERM')
})
