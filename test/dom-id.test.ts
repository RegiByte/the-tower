import assert from 'node:assert/strict'
import { test } from 'node:test'
import { domId } from '../src/shared/dom-id.ts'

test('an id is the place, a colon, and the key as written', () => {
  assert.equal(domId('row', 'card:20261118-1'), 'row:card:20261118-1')
  assert.equal(domId('head/menu', 'shown:w1/1700000000000'), 'head/menu:shown:w1/1700000000000')
})

test('whitespace and percent in a key are percent-encoded, and nothing else', () => {
  assert.equal(domId('tray', 'collection:my floor/drafts'), 'tray:collection:my%20floor/drafts')
  assert.equal(domId('file', 'a\nb\tc'), 'file:a%0Ab%09c')
  assert.equal(domId('file', '50%'), 'file:50%25')
  assert.equal(domId('file', '"<é>#.:'), 'file:"<é>#.:')
})

test('a part named in the place never meets a key that holds a slash', () => {
  assert.notEqual(domId('row/menu', 'card:x'), domId('row', 'card:x/menu'))
})
