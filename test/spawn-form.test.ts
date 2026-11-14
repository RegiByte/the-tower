import assert from 'node:assert/strict'
import { test } from 'node:test'
import { board } from '../src/bridge/board.ts'
import type { Config } from '../src/shared/model.ts'
import { can } from '../src/shared/offered.ts'
import { cutWhy, spawnCall, spawnDefaults, spawnFormHtml } from '../src/shared/spawn-form.ts'
import type { FirstRead } from '../src/bridge/worktrees.ts'
import { HOST_PROTOCOL } from '../src/shared/protocol.ts'
import { viewOf } from './view.ts'

const SINGLE: Config = { runtimes: { claude: { argv: ['claude'] } }, env: {}, projects: { tower: { name: 'tower', hub: '/hub', repos: [] } } }
const MULTI: Config = { runtimes: { claude: { argv: { a: ['claude'], b: ['claude-mom'] } } }, env: {}, projects: { tower: { name: 'tower', hub: '/hub', repos: [], runtimes: { claude: { command: 'b' } } } } }

const boardOf = (config: Config) => board(viewOf(config, { host: { ids: new Set(), protocol: HOST_PROTOCOL } }))
const floorOf = (config: Config) => boardOf(config).floors[0]
const CLAUDE = boardOf(SINGLE).runtimes.claude

test("spawnDefaults: command defaults to the floor's resolved one, empty in single-command mode", () => {
  assert.equal(spawnDefaults(floorOf(MULTI)).command, 'b')
  assert.equal(spawnDefaults(floorOf(SINGLE)).command, '')
})

test('spawnFormHtml: the command picker is absent with one or no named commands, present with two or more, floor default selected', () => {
  assert.equal(spawnFormHtml(floorOf(SINGLE), { sign: 's', runtime: CLAUDE }).includes('name="command"'), false)
  assert.equal(spawnFormHtml(floorOf(SINGLE), { sign: 's', runtime: { ...CLAUDE, commands: ['a'] } }).includes('name="command"'), false)
  const html = spawnFormHtml(floorOf(MULTI), { sign: 's', runtime: boardOf(MULTI).runtimes.claude })
  assert.equal(html.includes('name="command"'), true)
  assert.match(html, /<option value="b" selected>/)
})

test('spawnCall: a chosen command is sent, an empty one is left out', () => {
  const floor = floorOf(MULTI)
  const [, withCommand] = spawnCall(floor, { ...spawnDefaults(floor), command: 'b' })
  assert.equal(withCommand.command, 'b')
  const [, withoutCommand] = spawnCall(floor, spawnDefaults(floorOf(SINGLE)))
  assert.equal('command' in withoutCommand, false)
})

const TWO_DIRS: Config = { runtimes: { claude: { argv: ['claude'] } }, env: {}, projects: { tower: { name: 'tower', hub: '/hub', repos: ['/api'] } } }
const refsOf = (dir: string): FirstRead => ({ refs: { dir, at: 1, git: true, bases: ['origin/main'], originHead: 'origin/main' } })
const readingFloor = (firstReads: [string, FirstRead][]) => board(viewOf(TWO_DIRS, { host: { ids: new Set(), protocol: HOST_PROTOCOL }, firstReads: new Map(firstReads) })).floors[0]

test("a floor whose refs are read and checkouts aren't offers a cut, and says it is still reading", () => {
  const floor = readingFloor([['/hub', refsOf('/hub')], ['/api', refsOf('/api')]])
  assert.equal(can(floor, 'cut'), true)
  assert.equal(cutWhy(floor), undefined)
  assert.deepEqual(floor.reading, [{ dir: '/hub' }, { dir: '/api' }])
  assert.deepEqual([floor.bases, floor.defaultBase, floor.git], [['origin/main'], 'origin/main', true])
  assert.deepEqual(floor.worktrees, [])
})

test('a floor whose refs are still being read offers no cut, and says so rather than that a dir is no repo', () => {
  const floor = readingFloor([['/hub', refsOf('/hub')]])
  assert.equal(can(floor, 'cut'), false)
  assert.equal(cutWhy(floor), 'its git is still being read')
})

test('a floor whose first read failed says what git said', () => {
  const floor = readingFloor([['/hub', refsOf('/hub')], ['/api', { failed: 'git rev-parse in /api took over 60s and was stopped' }]])
  assert.equal(can(floor, 'cut'), false)
  assert.deepEqual(floor.reading, [{ dir: '/hub' }, { dir: '/api', failed: 'git rev-parse in /api took over 60s and was stopped' }])
  assert.equal(cutWhy(floor), "git couldn't read api: git rev-parse in /api took over 60s and was stopped")
})
