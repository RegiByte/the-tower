import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CAPABILITIES, parsePattern, tipAt, tipKey, tipsOf, TIP_MS } from '../src/shared/capabilities.ts'
import { readPatterns } from '../src/patterns.ts'

test('every pattern the checkout ships parses', () => {
  const patterns = readPatterns()
  assert.ok(patterns.length > 0)
  for (const p of patterns) assert.ok(p.title && p.summary && p.story, p.id)
})

test('a pattern without a title, a summary and a story is refused, naming its file', () => {
  assert.throws(() => parsePattern('bare', '# Only a title\n\nAnd a summary.'), /docs\/patterns\/bare\.md/)
})

test('capabilities and patterns are named apart', () => {
  const keys = tipsOf(CAPABILITIES, readPatterns(), []).map(tipKey)
  assert.equal(new Set(keys).size, keys.length)
})

test('a dismissed tip is left out, and the next shows every TIP_MS', () => {
  const tips = tipsOf(CAPABILITIES.slice(0, 3), [], ['capability/' + CAPABILITIES[1].id])
  assert.deepEqual(tips.map((t) => t.id), [CAPABILITIES[0].id, CAPABILITIES[2].id])
  assert.equal(tipAt(tips, 0, 0)?.id, CAPABILITIES[0].id)
  assert.equal(tipAt(tips, 0, TIP_MS)?.id, CAPABILITIES[2].id)
  assert.equal(tipAt([], 0, 0), undefined)
})
