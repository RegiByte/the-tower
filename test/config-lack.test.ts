import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configLack } from '../src/system.ts'
import type { Config } from '../src/shared/model.ts'

const lack = (config: unknown) => configLack(config as Config)

test('a config holding every key a read stands on lacks nothing, with argv as a list or as named commands', () => {
  assert.equal(lack({ argv: ['claude'], projects: { lab: { name: 'Lab', hub: '/lab', repos: [] } } }), undefined)
  assert.equal(lack({ argv: { claude: ['claude'] }, projects: {} }), undefined)
})

test('a config short of a key every read stands on names the first one it lacks', () => {
  assert.equal(lack([]), 'it holds no JSON object')
  assert.equal(lack({}), 'argv must name the command sessions start with, such as ["claude"]')
  assert.equal(lack({ argv: [], projects: {} }), 'argv must name the command sessions start with, such as ["claude"]')
  assert.equal(lack({ argv: { claude: [] }, projects: {} }), 'argv must name the command sessions start with, such as ["claude"]')
  assert.equal(lack({ argv: ['x'] }), 'projects must be an object of floors, each with name, hub and repos')
  assert.equal(lack({ argv: ['x'], projects: { lab: 'lab' } }), 'projects.lab must be an object with name, hub and repos')
  assert.equal(lack({ argv: ['x'], projects: { lab: { name: 'lab' } } }), 'projects.lab.hub must be the path of a directory')
  assert.equal(lack({ argv: ['x'], projects: { lab: { name: 'lab', hub: '/tmp', repos: [5] } } }), 'projects.lab.repos must be a list of directories, [] for none')
  assert.equal(lack({ argv: ['x'], projects: { lab: { name: 'lab', hub: '/tmp' } } }), 'projects.lab.repos must be a list of directories, [] for none')
})
