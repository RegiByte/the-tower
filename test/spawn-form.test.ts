import assert from 'node:assert/strict'
import { test } from 'node:test'
import { board } from '../src/bridge/board.ts'
import type { Config } from '../src/shared/model.ts'
import { spawnCall, spawnDefaults, spawnFormHtml } from '../src/shared/spawn-form.ts'
import { HOST_PROTOCOL } from '../src/shared/protocol.ts'
import { viewOf } from './view.ts'

const SINGLE: Config = { argv: ['claude'], env: {}, projects: { tower: { name: 'tower', hub: '/hub', repos: [] } } }
const MULTI: Config = { argv: { a: ['claude'], b: ['claude-mom'] }, env: {}, projects: { tower: { name: 'tower', hub: '/hub', repos: [], command: 'b' } } }

const floorOf = (config: Config) => board(viewOf(config, { host: { ids: new Set(), protocol: HOST_PROTOCOL } })).floors[0]

test("spawnDefaults: command defaults to the floor's resolved one, empty in single-command mode", () => {
  assert.equal(spawnDefaults(floorOf(MULTI)).command, 'b')
  assert.equal(spawnDefaults(floorOf(SINGLE)).command, '')
})

test('spawnFormHtml: the command picker is absent with one or no named commands, present with two or more, floor default selected', () => {
  assert.equal(spawnFormHtml(floorOf(SINGLE), { sign: 's' }).includes('name="command"'), false)
  assert.equal(spawnFormHtml(floorOf(SINGLE), { sign: 's', commands: ['a'] }).includes('name="command"'), false)
  const html = spawnFormHtml(floorOf(MULTI), { sign: 's', commands: ['a', 'b'] })
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
