import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_KEYS, keymapSheetHtml, paneSheetHtml, panesOf } from '../src/shared/keymap.ts'
import { terminalKeymap } from '../src/shared/termkeys.ts'

const press = (code: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ type: 'keydown', code, key: code.replace(/^(Key|Digit)/, '').toLowerCase(), altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, isComposing: false, preventDefault: () => {}, ...mods }) as unknown as KeyboardEvent

test("an extension's chord in a terminal goes to the renderer, and to xterm only when nothing ran", () => {
  const keys = { ...DEFAULT_KEYS, 'x/thing': ['Alt+K'] }
  const ran: string[] = []
  const send = () => assert.fail('nothing is sent')
  const handled = (did: boolean) => terminalKeymap(() => keys, (id) => (ran.push(id), did), send)(press('KeyK', { altKey: true }))
  assert.equal(handled(true), false)
  assert.equal(handled(false), true)
  assert.deepEqual(ran, ['x/thing', 'x/thing'])
})

test("a chord of the keymap's runs before an extension's, and a plain chord is typing", () => {
  const ran: string[] = []
  const keys = { ...DEFAULT_KEYS, 'x/thing': ['G'] }
  const handler = terminalKeymap(() => keys, (id) => (ran.push(id), true), () => {})
  assert.equal(handler(press('KeyG')), true)
  assert.equal(handler(press('Escape', { altKey: true, key: 'Escape' })), false)
  assert.deepEqual(ran, ['leave-terminal'])
})

const started = (views: Record<string, unknown>[]) => [{ state: 'started', views }] as unknown as Parameters<typeof panesOf>[0]['extensions']
const view = (id: string, more: Record<string, unknown> = {}) => ({ id, on: ['card'], scales: ['pane'], words: { label: 'Files', hint: 'the checkout as a tree' }, ...more })
const addedPanes = (extensions: Parameters<typeof panesOf>[0]['extensions'], keys: Record<string, string[]>) =>
  panesOf({ extensions, keys: { ...DEFAULT_KEYS, ...keys } }).filter((p) => !p.name)

test("a view is a pane when it is a worker's tab with a chord bound, a tab export or not", () => {
  const chord = { 'x/tab': ['Ctrl+Shift+5'] }
  assert.deepEqual(addedPanes(started([view('x/tab')]), chord), [{ command: 'x/tab', view: 'x/tab', label: 'Files', does: 'the checkout as a tree' }])
  assert.deepEqual(addedPanes(started([view('x/tab')]), { 'x/tab': [] }), [])
  assert.deepEqual(addedPanes(started([view('x/tab', { on: ['floor'] })]), chord), [])
  assert.deepEqual(addedPanes(started([view('x/tab', { scales: ['cell'] })]), chord), [])
  assert.deepEqual(addedPanes([{ state: 'failed', views: [view('x/tab')] }] as never, chord), [])
})

test("the keymap's panes stay on the list unbound, each once", () => {
  const panes = panesOf({ extensions: started([view('tower/brief')]), keys: { ...DEFAULT_KEYS, 'pane-brief': [], 'tower/brief': ['Ctrl+Shift+5'] } })
  assert.equal(panes.filter((p) => p.view === 'tower/brief').length, 1)
})

test("a pane's row sits with the keymap's panes on the sheet, and the keymap's sheet stays as it was", () => {
  const keys = { ...DEFAULT_KEYS, 'x/tab': ['Ctrl+Shift+5'] }
  const sheet = paneSheetHtml(keys, panesOf({ extensions: started([view('x/tab')]), keys }))
  assert.ok(sheet.indexOf('⌃⇧3') < sheet.indexOf('⌃⇧5') && sheet.indexOf('⌃⇧5') < sheet.indexOf('⌘J'))
  assert.ok(!keymapSheetHtml(keys).includes('⌃⇧5'))
  assert.equal(paneSheetHtml(DEFAULT_KEYS, []), keymapSheetHtml(DEFAULT_KEYS))
})
