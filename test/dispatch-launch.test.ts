import assert from 'node:assert/strict'
import { test } from 'node:test'
import { launchWithDefaults, spawnLaunchOf } from '../src/tower/dispatch.ts'
import type { Config } from '../src/shared/model.ts'

test("spawnLaunchOf: carries every field the API lets a spawn set, command included", () => {
  assert.deepEqual(spawnLaunchOf({ model: 'opus', effort: 'high', prompt: 'go', command: 'mom' }), { model: 'opus', effort: 'high', prompt: 'go', command: 'mom' })
  assert.equal(spawnLaunchOf({ prompt: 'go' }).command, undefined)
})

test("launchWithDefaults: fills in Claude's defaults and the project's preferred command when the spawn named neither", () => {
  const config: Config = { runtimes: { claude: { argv: { a: ['claude'], b: ['claude-mom'] } } }, env: {}, projects: { p: { name: 'p', hub: '/h', repos: [], runtimes: { claude: { command: 'b' } } } } }
  assert.equal(launchWithDefaults(config, 'p', 'claude', { prompt: 'go' }, {}).command, 'b')
  assert.equal(launchWithDefaults(config, 'p', 'claude', { prompt: 'go', command: 'a' }, {}).command, 'a', "a spawn's own choice wins over the project's preference")
  const single: Config = { runtimes: { claude: { argv: ['claude'] } }, env: {}, projects: { p: { name: 'p', hub: '/h', repos: [] } } }
  assert.equal(launchWithDefaults(single, 'p', 'claude', { prompt: 'go' }, {}).command, undefined)
})
