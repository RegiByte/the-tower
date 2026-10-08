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
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
