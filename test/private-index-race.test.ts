import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { git as towerGit, gitWith } from '../src/git.ts'
import { privateIndex } from '../src/private-index.ts'

const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tower-private-index-race-')))
process.env.TOWER_CONFIG = path.join(root, 'system', 'config.json')

test('a copy handed to one read is not deleted by a second read of the same checkout', async (t) => {
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = path.join(root, 'r')
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...IDENTITY }, stdio: 'pipe' }).toString()
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: { ...process.env, ...IDENTITY } })
  for (const f of ['a', 'b']) writeFileSync(path.join(dir, f), `${f}\n`)
  git('add', '.')
  git('commit', '-qm', 'init')

  // Read A (say, the board's reader thread) gets its copy, then awaits before running status through it.
  const first = await privateIndex(dir, dir, path.join(dir, '.git'))
  // Meanwhile a worker stages a file, and read B (a verb's fetchedReads on the main thread) reads the same checkout.
  writeFileSync(path.join(dir, 'a'), 'staged\n')
  git('add', 'a')
  const second = await privateIndex(dir, dir, path.join(dir, '.git'))
  second!.release()

  // Read A now runs its status through the copy it was handed.
  const real = await towerGit(dir, ['status', '--porcelain'])
  const throughFirst = await gitWith({ GIT_INDEX_FILE: first!.index })(dir, ['status', '--porcelain'])
  first!.release()
  assert.equal(throughFirst, real.replace('M  a', ' M a'), 'read A sees the tree as its copy left it, not every file deleted and untracked')
})
