import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { changedSince } from '../src/changed-files.ts'
import { git as towerGit, gitWith } from '../src/git.ts'
import { privateIndex } from '../src/private-index.ts'

const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tower-private-index-')))
process.env.TOWER_CONFIG = path.join(root, 'system', 'config.json')

/** A repo at a fresh dir with files `a` to `e` committed on `main`, and its helpers. */
const repo = (name: string) => {
  const dir = path.join(root, name)
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...IDENTITY }, stdio: 'pipe' }).toString()
  const write = (file: string, text: string) => writeFileSync(path.join(dir, file), text)
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: { ...process.env, ...IDENTITY } })
  for (const f of ['a', 'b', 'c', 'd', 'e']) write(f, `${f}\n`)
  git('add', '.')
  git('commit', '-qm', 'init')
  const index = path.join(dir, '.git', 'index')
  /** `file` rewritten at its size, dated to the index's last write: racily clean, which only hashing tells apart. */
  const racyEdit = (file: string, text: string) => {
    write(file, text)
    const { atime, mtime } = statSync(index)
    utimesSync(path.join(dir, file), atime, mtime)
  }
  return { dir, git, write, racyEdit, index }
}

type Repo = ReturnType<typeof repo>

const identity = (file: string) => {
  const s = statSync(file, { bigint: true })
  return `${s.ino}-${s.mtimeNs}-${s.size}`
}

/** What the board reads of the checkout through the real index and through its private copy, which must be equal. */
const readBoth = async ({ dir, index }: Repo) => {
  const before = identity(index)
  const copy = await privateIndex(dir, dir, path.join(dir, '.git'))
  assert.ok(copy && existsSync(copy))
  assert.equal(identity(index), before, "the checkout's own index is never written")
  const through = gitWith({ GIT_INDEX_FILE: copy })
  const read = async (gitIn: typeof towerGit) => ({
    status: await gitIn(dir, ['status', '--porcelain']),
    changed: await changedSince(gitIn, dir, 'main'),
  })
  return { real: await read(towerGit), copy: await read(through), path: copy }
}

const equalThroughCopy = async (r: Repo) => {
  const { real, copy } = await readBoth(r)
  assert.deepEqual(copy, real)
  return real
}

test('a checkout read through its private index answers as its own index does, whatever state its work is in', async (t) => {
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const r = repo('states')
  r.write('a', 'staged\n')
  r.git('add', 'a')
  r.racyEdit('b', 'B\n')
  r.write('c', 'changed at another size\n')
  r.write('new', 'untracked\n')
  r.git('mv', 'd', 'moved')
  r.git('rm', '-q', 'e')
  const states = await equalThroughCopy(r)
  assert.match(states.status, /^ M b$/m, 'the racily clean edit is seen')
  assert.match(states.status, /^R {2}d -> moved$/m)

  const conflicted = repo('conflicted')
  conflicted.git('checkout', '-qb', 'side')
  conflicted.write('a', 'side\n')
  conflicted.git('commit', '-qam', 'side')
  conflicted.git('checkout', '-q', 'main')
  conflicted.write('a', 'main\n')
  conflicted.git('commit', '-qam', 'main')
  assert.throws(() => conflicted.git('merge', '-q', 'side'))
  assert.match((await equalThroughCopy(conflicted)).status, /^UU a$/m)

  const rebasing = repo('rebasing')
  rebasing.git('checkout', '-qb', 'topic')
  rebasing.write('b', 'topic\n')
  rebasing.git('commit', '-qam', 'topic')
  rebasing.git('checkout', '-q', 'main')
  rebasing.write('b', 'main\n')
  rebasing.git('commit', '-qam', 'main')
  rebasing.git('checkout', '-q', 'topic')
  assert.throws(() => rebasing.git('rebase', '-q', 'main'))
  rebasing.write('fresh', 'mid-rebase\n')
  assert.match((await equalThroughCopy(rebasing)).status, /^UU b$/m)

  const sparse = repo('sparse')
  for (const f of ['in/x', 'out/y']) {
    execFileSync('mkdir', ['-p', path.dirname(path.join(sparse.dir, f))])
    sparse.write(f, `${f}\n`)
  }
  sparse.git('add', '.')
  sparse.git('commit', '-qm', 'dirs')
  sparse.git('sparse-checkout', 'set', '--cone', '--sparse-index', 'in')
  sparse.racyEdit('in/x', 'IN/X\n')
  sparse.write('in/new', 'untracked\n')
  assert.match((await equalThroughCopy(sparse)).status, /^ M in\/x$/m)

  const split = repo('split')
  split.git('config', 'core.splitIndex', 'true')
  split.git('update-index', '--split-index')
  split.write('a', 'staged in a split index\n')
  split.git('add', 'a')
  split.racyEdit('b', 'B\n')
  await equalThroughCopy(split)
  const shared = (dir: string) => execFileSync('ls', [path.join(dir, '.git')]).toString().split('\n').filter((f) => f.startsWith('sharedindex.'))
  assert.equal(shared(split.dir).length, 1, 'no shared index is written into the repo')

  const stale = repo('stale')
  stale.racyEdit('a', 'A\n')
  const first = await readBoth(stale)
  assert.deepEqual(first.copy, first.real)
  stale.git('add', 'a')
  stale.write('b', 'changed after the copy\n')
  const second = await readBoth(stale)
  assert.notEqual(second.path, first.path, 'a changed index is copied again')
  assert.ok(!existsSync(first.path), "the checkout's older copy goes")
  assert.deepEqual(second.copy, second.real)
})
