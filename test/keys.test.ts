import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { towerClient } from '../src/tower/served.ts'

type Write = { id: string; data: string }

/**
 * `/tower.js` run in a page of its own at `/r/test/`, its `keys` requests held: each is answered only when the test
 * says so, as a page slow to hear its answers would be.
 */
function heldPage() {
  const writes: Write[] = []
  const answers: (() => void)[] = []
  const listener = { addEventListener: () => {} }
  const ok = { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ t: 'ok' }) }
  const page: Record<string, unknown> = {
    document: { currentScript: null, documentElement: { dataset: {}, style: { setProperty: () => {}, removeProperty: () => {} } } },
    location: { origin: 'http://127.0.0.1', pathname: '/r/test/', search: '' },
    matchMedia: () => ({ matches: false, ...listener }),
    localStorage: { getItem: () => null },
    crypto: globalThis.crypto,
    fetch: (url: string, init: { body: string }) => {
      assert.equal(url, '/keys')
      writes.push(JSON.parse(init.body))
      return new Promise((resolve) => answers.push(() => resolve(ok)))
    },
    ...listener,
  }
  page.window = page
  page.parent = page
  vm.runInNewContext(towerClient({ id: 'test', version: null }), page)
  const tower = page.tower as { keys(id: string, data: string): void }
  /** Lets every promise settle that can. */
  const settled = () => new Promise((resolve) => setImmediate(resolve))
  /** Answers the write in flight, and waits for the next to be sent. */
  const answer = async () => {
    answers.shift()!()
    await settled()
  }
  return { tower, writes, answer, inFlight: () => answers.length, settled }
}

test('the keys typed while a write is answered go as one write per terminal, Enter, escapes and Ctrl+C each their own', async () => {
  const { tower, writes, answer, inFlight, settled } = heldPage()
  tower.keys('s1', 'a')
  await settled()
  for (const data of ['b', 'c', '\r', 'd', '\x1b[A', 'e', 'f', '\x03']) tower.keys('s1', data)
  tower.keys('s2', 'x')
  tower.keys('s1', 'g')
  const sent: Write[][] = [writes.slice()]
  while (inFlight()) {
    assert.equal(inFlight(), 1, 'one write at a time')
    const before = writes.length
    await answer()
    sent.push(writes.slice(before))
  }
  assert.deepEqual(
    sent.flat(),
    [
      { id: 's1', data: 'a' },
      { id: 's1', data: 'bc' },
      { id: 's1', data: '\r' },
      { id: 's1', data: 'd' },
      { id: 's1', data: '\x1b[A' },
      { id: 's1', data: 'ef' },
      { id: 's1', data: '\x03' },
      { id: 's2', data: 'x' },
      { id: 's1', data: 'g' },
    ],
  )
})

test('a key typed with nothing in flight is written at once', async () => {
  const { tower, writes, answer, settled } = heldPage()
  tower.keys('s1', 'a')
  await settled()
  assert.deepEqual(writes, [{ id: 's1', data: 'a' }])
  await answer()
  tower.keys('s1', 'b')
  await settled()
  assert.deepEqual(writes, [{ id: 's1', data: 'a' }, { id: 's1', data: 'b' }])
})
