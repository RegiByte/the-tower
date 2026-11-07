import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_KEYS } from '../src/shared/keymap.ts'
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

test("an extension's chord that nothing ran keeps its keypress, where xterm types ⌥ text", () => {
  const keys = { ...DEFAULT_KEYS, 'x/thing': ['Alt+K'] }
  const handler = terminalKeymap(() => keys, () => false, () => assert.fail('nothing is sent'))
  assert.equal(handler(press('KeyK', { altKey: true })), true)
  assert.equal(handler(press('KeyK', { altKey: true, type: 'keypress' })), true)
})

test("a chord of the keymap's runs before an extension's, and a plain chord is typing", () => {
  const ran: string[] = []
  const keys = { ...DEFAULT_KEYS, 'x/thing': ['G'] }
  const handler = terminalKeymap(() => keys, (id) => (ran.push(id), true), () => {})
  assert.equal(handler(press('KeyG')), true)
  assert.equal(handler(press('Escape', { altKey: true, key: 'Escape' })), false)
  assert.deepEqual(ran, ['leave-terminal'])
})
