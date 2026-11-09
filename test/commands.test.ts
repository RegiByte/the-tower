import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configProblems } from '../src/config-check.ts'
import { commandNames, projectPreferredCommand, resolveCommand, type Config } from '../src/shared/model.ts'

const config = (over: Partial<Config> & Record<string, unknown>): Config => ({ argv: ['claude'], projects: {}, ...over }) as Config

test('commandNames: undefined for the legacy array shape, every key in source order for the object shape', () => {
  assert.equal(commandNames(config({ argv: ['claude'] })), undefined)
  assert.deepEqual(commandNames(config({ argv: { mom: ['claude-mom'], main: ['claude'] } })), ['mom', 'main'])
})

test('resolveCommand: the legacy array always, a named key when it exists, the first key otherwise', () => {
  assert.deepEqual(resolveCommand(config({ argv: ['claude'] }), 'anything'), ['claude'])
  const multi = config({ argv: { a: ['claude'], b: ['claude-mom'] } })
  assert.deepEqual(resolveCommand(multi, 'b'), ['claude-mom'])
  assert.deepEqual(resolveCommand(multi, 'missing'), ['claude'])
  assert.deepEqual(resolveCommand(multi, undefined), ['claude'])
  assert.deepEqual(resolveCommand(multi, ''), ['claude'])
})

test("projectPreferredCommand: undefined in single-command mode, the project's command when valid, the first key otherwise", () => {
  const single = config({ argv: ['claude'], projects: { p: { name: 'p', hub: '/h', repos: [] } } })
  assert.equal(projectPreferredCommand(single, 'p'), undefined)
  const multi = config({ argv: { a: ['claude'], b: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/h', repos: [], command: 'b' }, q: { name: 'q', hub: '/h', repos: [], command: 'nope' } } })
  assert.equal(projectPreferredCommand(multi, 'p'), 'b')
  assert.equal(projectPreferredCommand(multi, 'q'), 'a')
})

test('configProblems: the legacy array argv is still accepted; the object shape is too; anything else fails', () => {
  assert.deepEqual(configProblems(config({ argv: ['claude'] })).filter((p) => p.key === 'argv'), [])
  assert.deepEqual(configProblems(config({ argv: { a: ['claude'] } })).filter((p) => p.key === 'argv'), [])
  assert.equal(configProblems(config({ argv: {} })).some((p) => p.key === 'argv'), true)
  assert.equal(configProblems(config({ argv: { a: [] } })).some((p) => p.key === 'argv'), true)
  assert.equal(configProblems(config({ argv: 'claude' as unknown as string[] })).some((p) => p.key === 'argv'), true)
})

test("configProblems: a project's command must be a string naming one of argv's, and is never an unknown key", () => {
  const valid = config({ argv: { claude: ['claude'], mom: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/', repos: [], command: 'mom' } } })
  assert.deepEqual(configProblems(valid).filter((p) => p.key.startsWith('projects.p')), [])
  const unknown = config({ argv: { claude: ['claude'], mom: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/', repos: [], command: 'nope' } } })
  assert.deepEqual(configProblems(unknown).filter((p) => p.key === 'projects.p.command'), [{ level: 'fail', key: 'projects.p.command', problem: 'names no command of argv: they are claude, mom' }])
  const ignored = config({ projects: { p: { name: 'p', hub: '/', repos: [], command: 'mom' } } })
  assert.deepEqual(configProblems(ignored).filter((p) => p.key === 'projects.p.command'), [{ level: 'warn', key: 'projects.p.command', problem: 'argv names only one command: this is ignored' }])
  const badCommand = config({ projects: { p: { name: 'p', hub: '/', repos: [], command: 3 as unknown as string } } })
  assert.equal(configProblems(badCommand).some((p) => p.level === 'fail' && p.key === 'projects.p.command'), true)
})
