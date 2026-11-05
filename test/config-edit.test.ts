import assert from 'node:assert/strict'
import os from 'node:os'
import { test } from 'node:test'
import { checkedEdit, edited, type ConfigEdit, type Edited } from '../src/config-edit.ts'
import type { ApiError, ErrorCode } from '../src/shared/api.ts'
import type { Config } from '../src/shared/model.ts'

const HUB = os.tmpdir()

const CONFIG: Config = {
  argv: ['claude'],
  env: {},
  projects: { lab: { name: 'Lab', hub: HUB, repos: ['/elsewhere/a', '/elsewhere/b'] } },
}

/** The config with a shelf entry on its floor: objects in an array. */
const SHELVED: Config = { ...CONFIG, projects: { lab: { ...CONFIG.projects.lab, shelf: [{ label: 'KB', html: 'kb.html' }] } } }

const ok = (done: Edited | ApiError): Edited => {
  assert.notEqual(done.t, 'error', JSON.stringify(done))
  return done as Edited
}

const refused = (done: Edited | ApiError, code: ErrorCode) => {
  assert.equal(done.t, 'error', JSON.stringify(done))
  assert.equal((done as ApiError).code, code, (done as ApiError).message)
}

const lab = (config: Config) => config.projects.lab

test('add puts a key the config lacks, making objects on the way, and never overwrites', () => {
  const added = ok(edited(CONFIG, { t: 'add', key: ['projects', 'new'], value: { name: 'New', hub: HUB, repos: [] } }))
  assert.equal(added.t, 'added')
  assert.deepEqual(added.config.projects.new, { name: 'New', hub: HUB, repos: [] })
  assert.equal(CONFIG.projects.new, undefined, 'the config edited is a new value')
  assert.deepEqual(ok(edited(CONFIG, { t: 'add', key: ['renderers', 'page', 'layout'], value: {} })).config.renderers, { page: { layout: {} } })
  refused(edited(CONFIG, { t: 'add', key: ['projects', 'lab'], value: {} }), 'exists')
  refused(edited(CONFIG, { t: 'add', key: ['argv', 'x'], value: 1 }), 'refused')
  refused(edited(CONFIG, { t: 'add', key: ['projects', 'lab', 'name', 'x'], value: 1 }), 'refused')
})

test('add never takes an index: an array on the way is refused, append adds to it', () => {
  refused(edited(CONFIG, { t: 'add', key: ['projects', 'lab', 'repos', '2'], value: '/c' }), 'refused')
  refused(edited(CONFIG, { t: 'add', key: ['projects', 'lab', 'repos', '0', 'x'], value: '/c' }), 'refused')
})

test('append pushes onto an existing array, answers unchanged for a value it holds, and refuses anything else', () => {
  const appended = ok(edited(CONFIG, { t: 'append', key: ['projects', 'lab', 'repos'], value: '/elsewhere/c' }))
  assert.equal(appended.t, 'appended')
  assert.deepEqual(lab(appended.config).repos, ['/elsewhere/a', '/elsewhere/b', '/elsewhere/c'])
  const again = ok(edited(CONFIG, { t: 'append', key: ['projects', 'lab', 'repos'], value: '/elsewhere/a' }))
  assert.equal(again.t, 'unchanged')
  assert.equal(again.config, CONFIG)
  refused(edited(CONFIG, { t: 'append', key: ['projects', 'nope', 'repos'], value: '/c' }), 'not_found')
  refused(edited(CONFIG, { t: 'append', key: ['projects', 'lab', 'name'], value: '/c' }), 'refused')
})

test('append compares objects deep, key order aside', () => {
  const shelf = ['projects', 'lab', 'shelf']
  assert.equal(ok(edited(SHELVED, { t: 'append', key: shelf, value: { html: 'kb.html', label: 'KB' } })).t, 'unchanged')
  assert.equal(ok(edited(SHELVED, { t: 'append', key: shelf, value: { label: 'KB', html: 'other.html' } })).t, 'appended')
})

test('set replaces an existing value while it is still was, deep-equal', () => {
  const set = ok(edited(CONFIG, { t: 'set', key: ['projects', 'lab', 'name'], value: 'Lab 2', was: 'Lab' }))
  assert.equal(set.t, 'set')
  assert.equal(lab(set.config).name, 'Lab 2')
  refused(edited(CONFIG, { t: 'set', key: ['projects', 'lab', 'name'], value: 'Lab 2', was: 'Old' }), 'changed')
  refused(edited(CONFIG, { t: 'set', key: ['projects', 'lab', 'missing'], value: 1, was: 1 }), 'not_found')
  const whole = ok(edited(CONFIG, { t: 'set', key: ['projects', 'lab'], value: { ...lab(CONFIG), name: 'X' }, was: { repos: ['/elsewhere/a', '/elsewhere/b'], hub: HUB, name: 'Lab' } }))
  assert.equal(lab(whole.config).name, 'X')
})

test('remove deletes a key while it is still was', () => {
  const config = { ...CONFIG, renderer: 'page' } as Config
  const removed = ok(edited(config, { t: 'remove', key: ['renderer'], was: 'page' }))
  assert.equal(removed.t, 'removed')
  assert.equal(Object.hasOwn(removed.config, 'renderer'), false)
  refused(edited(config, { t: 'remove', key: ['renderer'], was: 'tower3d' }), 'changed')
  refused(edited(config, { t: 'remove', key: ['nope'], was: null }), 'not_found')
})

test('through arrays: an index is digits below the length; set replaces the element, remove splices it out', () => {
  const repos = ['projects', 'lab', 'repos']
  assert.deepEqual(lab(ok(edited(CONFIG, { t: 'set', key: [...repos, '1'], value: '/elsewhere/z', was: '/elsewhere/b' })).config).repos, ['/elsewhere/a', '/elsewhere/z'])
  assert.deepEqual(lab(ok(edited(CONFIG, { t: 'remove', key: [...repos, '0'], was: '/elsewhere/a' })).config).repos, ['/elsewhere/b'])
  refused(edited(CONFIG, { t: 'remove', key: [...repos, '0'], was: '/elsewhere/b' }), 'changed')
  for (const index of ['2', '-1', '01x', 'length', '1.0']) {
    refused(edited(CONFIG, { t: 'set', key: [...repos, index], value: '/x', was: '/elsewhere/b' }), 'not_found')
    refused(edited(CONFIG, { t: 'remove', key: [...repos, index], was: '/elsewhere/b' }), 'not_found')
  }
  const label = ok(edited(SHELVED, { t: 'set', key: ['projects', 'lab', 'shelf', '0', 'label'], value: 'Docs', was: 'KB' }))
  assert.equal(lab(label.config).shelf?.[0]?.label, 'Docs')
})

test('a key through a prototype name is invalid, whatever the verb', () => {
  const edits: ConfigEdit[] = [
    { t: 'add', key: ['__proto__', 'x'], value: 1 },
    { t: 'append', key: ['projects', 'constructor'], value: 1 },
    { t: 'set', key: ['prototype'], value: 1, was: 1 },
    { t: 'remove', key: ['projects', '__proto__'], was: 1 },
  ]
  for (const edit of edits) refused(edited(CONFIG, edit), 'invalid')
})

test('an edit bringing a new problem is refused, a warning included; problems the config had already hold nothing back', () => {
  refused(checkedEdit(CONFIG, { t: 'add', key: ['extentions'], value: {} }), 'config')
  refused(checkedEdit(CONFIG, { t: 'add', key: ['projects', 'lab', 'colour'], value: 'red' }), 'config')
  refused(checkedEdit(CONFIG, { t: 'set', key: ['projects', 'lab', 'hub'], value: '/no/such/folder', was: HUB }), 'config')
  const failing = { ...CONFIG, projects: { ...CONFIG.projects, broken: { name: 'Broken', hub: '/no/such/folder', repos: [] } } }
  const warned = { ...failing, colour: 'red' } as Config
  const done = ok(checkedEdit(warned, { t: 'add', key: ['projects', 'new'], value: { name: 'New', hub: HUB, repos: [] } }))
  assert.equal(done.t, 'added')
  assert.equal(ok(checkedEdit(warned, { t: 'append', key: ['projects', 'lab', 'repos'], value: '/elsewhere/a' })).t, 'unchanged')
})

test('removing a repo before one the user already had broken is not refused for the broken one moving up', () => {
  const removed = checkedEdit(CONFIG, { t: 'remove', key: ['projects', 'lab', 'repos', '0'], was: '/elsewhere/a' })
  assert.notEqual(removed.t, 'error', JSON.stringify(removed))
  const doubled = { ...CONFIG, projects: { lab: { ...CONFIG.projects.lab, repos: [HUB, '/elsewhere/b'] } } }
  refused(checkedEdit(doubled, { t: 'set', key: ['projects', 'lab', 'repos', '0'], value: '/elsewhere/b', was: HUB }), 'config')
})
