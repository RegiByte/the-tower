import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sessionArgv } from '../src/host/session.ts'
import type { Config } from '../src/shared/model.ts'

test('sessionArgv: the legacy argv always, a named command when given, the first when not or when stale', () => {
  const legacy = { argv: ['claude'], projects: {} } as Config
  assert.deepEqual(sessionArgv(legacy, ['--x'], '/mods'), ['claude', '--plugin-dir', '/mods', '--x'])
  const multi = { argv: { a: ['claude'], b: ['claude-mom'] }, projects: {} } as Config
  assert.deepEqual(sessionArgv(multi, ['--x'], '/mods', 'b'), ['claude-mom', '--plugin-dir', '/mods', '--x'])
  assert.deepEqual(sessionArgv(multi, ['--x'], '/mods', 'missing'), ['claude', '--plugin-dir', '/mods', '--x'])
  assert.deepEqual(sessionArgv(multi, ['--x'], '/mods'), ['claude', '--plugin-dir', '/mods', '--x'])
})
