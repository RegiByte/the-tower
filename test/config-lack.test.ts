import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configLack } from '../src/system.ts'
import type { Config } from '../src/shared/model.ts'

const lack = (config: unknown) => configLack(config as Config)

test('a config holding every key a read stands on lacks nothing, with runtimes.claude.argv as a list or as named commands', () => {
  assert.equal(lack({ runtimes: { claude: { argv: ['claude'] } }, projects: { lab: { name: 'Lab', hub: '/lab', repos: [] } } }), undefined)
  assert.equal(lack({ runtimes: { claude: { argv: { claude: ['claude'] } } }, projects: {} }), undefined)
})

test('a config short of a key every read stands on names the first one it lacks', () => {
  assert.equal(lack([]), 'it holds no JSON object')
  assert.equal(lack({}), 'runtimes.claude.argv must name the command Claude sessions start with, such as {"runtimes": {"claude": {"argv": ["claude"]}}}')
  assert.equal(lack({ runtimes: { claude: { argv: [] } }, projects: {} }), 'runtimes.claude.argv must name the command Claude sessions start with, such as {"runtimes": {"claude": {"argv": ["claude"]}}}')
  assert.equal(lack({ runtimes: { claude: { argv: { claude: [] } } }, projects: {} }), 'runtimes.claude.argv must name the command Claude sessions start with, such as {"runtimes": {"claude": {"argv": ["claude"]}}}')
  assert.equal(lack({ runtimes: { claude: { argv: ['x'] } } }), 'projects must be an object of floors, each with name, hub and repos')
  assert.equal(lack({ runtimes: { claude: { argv: ['x'] } }, projects: { lab: 'lab' } }), 'projects.lab must be an object with name, hub and repos')
  assert.equal(lack({ runtimes: { claude: { argv: ['x'] } }, projects: { lab: { name: 'lab' } } }), 'projects.lab.hub must be the path of a directory')
  assert.equal(lack({ runtimes: { claude: { argv: ['x'] } }, projects: { lab: { name: 'lab', hub: '/tmp', repos: [5] } } }), 'projects.lab.repos must be a list of directories, [] for none')
  assert.equal(lack({ runtimes: { claude: { argv: ['x'] } }, projects: { lab: { name: 'lab', hub: '/tmp' } } }), 'projects.lab.repos must be a list of directories, [] for none')
})

test('a key 2.0 moved under runtimes is refused at its old place, naming the new one, before anything else is checked', () => {
  const moved = (key: string, to: string) => `${key} moved to ${to} in 2.0: move it there (docs/migrating-to-2.md)`
  assert.equal(lack({ argv: ['claude'], projects: {} }), moved('argv', 'runtimes.claude.argv'))
  assert.equal(lack({ runtimes: { claude: { argv: ['claude'] } }, plugins: ['/p'], projects: {} }), moved('plugins', 'runtimes.claude.plugins'))
  const project = (over: object) => ({ runtimes: { claude: { argv: ['claude'] } }, projects: { lab: { name: 'lab', hub: '/tmp', repos: [], ...over } } })
  assert.equal(lack(project({ plugins: ['/p'] })), moved('projects.lab.plugins', 'projects.lab.runtimes.claude.plugins'))
  assert.equal(lack(project({ command: 'mom' })), moved('projects.lab.command', 'projects.lab.runtimes.claude.command'))
})
