import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { readRepo } from '../src/worktrees.ts'

const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null' }

test('a kept branch is absorbed only when its every commit landed on its base as an equal patch', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tower-absorbed-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...IDENTITY }, stdio: 'pipe' }).toString()
  const write = (file: string, text: string) => writeFileSync(path.join(dir, file), text)
  const commit = (message: string) => git('commit', '-qam', message)
  try {
    git('init', '-q', '-b', 'main')
    write('f', 'a\nb\nc\n')
    git('add', 'f')
    commit('init')

    git('checkout', '-qb', 'copied')
    write('f', 'a\nB1\nc\n')
    commit('b to B1')
    git('checkout', '-q', 'main')
    write('e', 'e\n')
    git('add', 'e')
    commit('elsewhere')
    git('cherry-pick', 'copied')
    write('f', 'a\nB2\nc\n')
    commit('B1 to B2')

    git('checkout', '-qb', 'resolved', 'main~3')
    write('f', 'A-branch\nb\nc\n')
    commit('a on the branch')
    git('checkout', '-q', 'main')
    write('f', 'A-main\nB2\nc\n')
    commit('a on main')
    assert.throws(() => git('cherry-pick', 'resolved'))
    write('f', 'A-both\nB2\nc\n')
    git('add', 'f')
    git('-c', 'core.editor=true', 'cherry-pick', '--continue')
    write('f', 'A-again\nB2\nc\n')
    commit('a edited again')

    git('checkout', '-qb', 'unlanded', 'main')
    write('g', 'work\n')
    git('add', 'g')
    commit('real work')

    git('checkout', '-qb', 'merged', 'main~3')
    write('h', 'h\n')
    git('add', 'h')
    commit('h')
    git('checkout', '-q', 'main')
    git('cherry-pick', 'merged')
    git('checkout', '-q', 'merged')
    git('merge', '-q', '--no-commit', 'main~1')
    write('f', 'resolution with work of its own\n')
    git('add', 'f')
    commit('merge from main, with work of its own')

    git('checkout', '-q', 'main')
    for (const branch of ['copied', 'resolved', 'unlanded', 'merged']) git('config', `branch.${branch}.towerbase`, 'main')

    const read = await readRepo(dir)
    assert.ok(read.git)
    assert.deepEqual(
      Object.fromEntries(read.kept.map((k) => [k.branch, k.absorbed])),
      { copied: true, resolved: false, unlanded: false, merged: false },
    )
    assert.deepEqual(
      Object.fromEntries(read.kept.map((k) => [k.branch, k.carried])),
      { copied: undefined, resolved: { commits: 1, edited: 1 }, unlanded: undefined, merged: undefined },
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a branch is carried when its commits landed edited, never when amended on the branch after they landed', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tower-carried-'))
  let clock = 1_800_000_000
  const at = () => `@${clock++} +0000`
  const git = (...args: string[]) => {
    const now = at()
    return execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...IDENTITY, GIT_AUTHOR_DATE: now, GIT_COMMITTER_DATE: now }, stdio: 'pipe' }).toString()
  }
  const lander = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...IDENTITY, GIT_COMMITTER_DATE: at() }, stdio: 'pipe' }).toString()
  const write = (file: string, text: string) => writeFileSync(path.join(dir, file), text)
  try {
    git('init', '-q', '-b', 'main')
    write('f', 'a\n')
    git('add', 'f')
    git('commit', '-qm', 'init')

    git('checkout', '-qb', 'edited')
    write('g', 'one\n')
    git('add', 'g')
    git('commit', '-qm', 'g')
    write('h', 'two\n')
    git('add', 'h')
    git('commit', '-qm', 'h')
    git('checkout', '-q', 'main')
    lander('cherry-pick', 'edited~1')
    lander('cherry-pick', 'edited')
    write('h', 'two, as landed\n')
    lander('commit', '-qa', '--amend', '--no-edit')

    git('checkout', '-qb', 'amended', 'main~2')
    write('k', 'first\n')
    git('add', 'k')
    git('commit', '-qm', 'k')
    git('checkout', '-q', 'main')
    lander('cherry-pick', 'amended')
    write('k', 'first, as landed\n')
    lander('commit', '-qa', '--amend', '--no-edit')
    git('checkout', '-q', 'amended')
    write('k', 'second\n')
    lander('commit', '-qa', '--amend', '--no-edit')

    git('checkout', '-q', 'main')
    for (const branch of ['edited', 'amended']) git('config', `branch.${branch}.towerbase`, 'main')
    const read = await readRepo(dir)
    assert.ok(read.git)
    assert.deepEqual(
      Object.fromEntries(read.kept.map((k) => [k.branch, [k.absorbed, k.carried]])),
      { edited: [false, { commits: 2, edited: 1 }], amended: [false, undefined] },
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a new file reads uncommitted whatever the user's status.showUntrackedFiles", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tower-untracked-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...IDENTITY }, stdio: 'pipe' }).toString()
  try {
    git('init', '-q', '-b', 'main')
    git('commit', '-q', '--allow-empty', '-m', 'init')
    git('worktree', 'add', '-q', '-b', 'tower/x', '.worktrees/x')
    git('config', 'status.showUntrackedFiles', 'no')
    writeFileSync(path.join(dir, '.worktrees/x/new'), 'work\n')
    const read = await readRepo(dir)
    assert.ok(read.git)
    assert.equal(read.trees.find((t) => t.name === 'x')!.dirty, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
