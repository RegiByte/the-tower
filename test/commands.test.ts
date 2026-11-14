import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configProblems } from '../src/config-check.ts'
import { commandNames, projectPreferredCommand, resolveCommand, type Config } from '../src/shared/model.ts'

const config = ({ argv = ['claude'], ...over }: { argv?: unknown } & Record<string, unknown>): Config => ({ runtimes: { claude: { argv } }, projects: {}, ...over }) as Config

test('commandNames: undefined for the array shape, every key in source order for the object shape', () => {
  assert.equal(commandNames(config({ argv: ['claude'] }), 'claude'), undefined)
  assert.deepEqual(commandNames(config({ argv: { mom: ['claude-mom'], main: ['claude'] } }), 'claude'), ['mom', 'main'])
})

test('resolveCommand: the array shape always, a named key when it exists, the first key otherwise', () => {
  assert.deepEqual(resolveCommand(config({ argv: ['claude'] }), 'claude', 'anything'), ['claude'])
  const multi = config({ argv: { a: ['claude'], b: ['claude-mom'] } })
  assert.deepEqual(resolveCommand(multi, 'claude', 'b'), ['claude-mom'])
  assert.deepEqual(resolveCommand(multi, 'claude', 'missing'), ['claude'])
  assert.deepEqual(resolveCommand(multi, 'claude', undefined), ['claude'])
  assert.deepEqual(resolveCommand(multi, 'claude', ''), ['claude'])
})

test("projectPreferredCommand: undefined in single-command mode, the project's command when valid, the first key otherwise", () => {
  const single = config({ argv: ['claude'], projects: { p: { name: 'p', hub: '/h', repos: [] } } })
  assert.equal(projectPreferredCommand(single, 'p', 'claude'), undefined)
  const multi = config({ argv: { a: ['claude'], b: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/h', repos: [], runtimes: { claude: { command: 'b' } } }, q: { name: 'q', hub: '/h', repos: [], runtimes: { claude: { command: 'nope' } } } } })
  assert.equal(projectPreferredCommand(multi, 'p', 'claude'), 'b')
  assert.equal(projectPreferredCommand(multi, 'q', 'claude'), 'a')
})

test('configProblems: the array shape of argv is accepted; the object shape is too; anything else fails', () => {
  assert.deepEqual(configProblems(config({ argv: ['claude'] })).filter((p) => p.key === 'runtimes.claude.argv'), [])
  assert.deepEqual(configProblems(config({ argv: { a: ['claude'] } })).filter((p) => p.key === 'runtimes.claude.argv'), [])
  assert.equal(configProblems(config({ argv: {} })).some((p) => p.key === 'runtimes.claude.argv'), true)
  assert.equal(configProblems(config({ argv: { a: [] } })).some((p) => p.key === 'runtimes.claude.argv'), true)
  assert.equal(configProblems(config({ argv: 'claude' as unknown as string[] })).some((p) => p.key === 'runtimes.claude.argv'), true)
})

test("configProblems: a project's command must be a string naming one of argv's, and is never an unknown key", () => {
  const valid = config({ argv: { claude: ['claude'], mom: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/', repos: [], runtimes: { claude: { command: 'mom' } } } } })
  assert.deepEqual(configProblems(valid).filter((p) => p.key.startsWith('projects.p')), [])
  const unknown = config({ argv: { claude: ['claude'], mom: ['claude-mom'] }, projects: { p: { name: 'p', hub: '/', repos: [], runtimes: { claude: { command: 'nope' } } } } })
  assert.deepEqual(configProblems(unknown).filter((p) => p.key === 'projects.p.runtimes.claude.command'), [{ level: 'fail', key: 'projects.p.runtimes.claude.command', problem: 'names no command of runtimes.claude.argv: they are claude, mom' }])
  const ignored = config({ projects: { p: { name: 'p', hub: '/', repos: [], runtimes: { claude: { command: 'mom' } } } } })
  assert.deepEqual(configProblems(ignored).filter((p) => p.key === 'projects.p.runtimes.claude.command'), [{ level: 'warn', key: 'projects.p.runtimes.claude.command', problem: 'runtimes.claude.argv names only one command: this is ignored' }])
  const badCommand = config({ projects: { p: { name: 'p', hub: '/', repos: [], runtimes: { claude: { command: 3 as unknown as string } } } } })
  assert.equal(configProblems(badCommand).some((p) => p.level === 'fail' && p.key === 'projects.p.runtimes.claude.command'), true)
})
