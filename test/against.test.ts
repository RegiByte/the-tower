import assert from 'node:assert/strict'
import { test } from 'node:test'
import { againstChoice } from '../src/worktrees.ts'

const commits = new Map<string, string | undefined>([
  ['origin/feature', 'aaa'],
  ['origin/gone', undefined],
  ['origin/main', 'bbb'],
])

test("a checkout's work is counted from its recorded base, origin's default once that's gone, its upstream, else HEAD", () => {
  assert.equal(againstChoice('origin/feature', commits, 'origin/main', 'origin/mine'), 'origin/feature')
  assert.equal(againstChoice('origin/gone', commits, 'origin/main', 'origin/mine'), 'origin/main')
  assert.equal(againstChoice('origin/gone', commits, undefined, 'origin/mine'), 'origin/mine')
  assert.equal(againstChoice(undefined, commits, 'origin/main', 'origin/mine'), 'origin/mine')
  assert.equal(againstChoice(undefined, commits, 'origin/main', undefined), 'HEAD')
})
