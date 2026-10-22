import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readViewer, VIEWER_DEFAULT } from '../src/shared/viewer.ts'

/** `tower.store.get` over what a viewer's browser keeps, by key, answering `null` for a key never kept, as tower.js does. */
const storeOf = (kept: Record<string, unknown>) => async (key: string) => kept[key] ?? null

test('a viewer reads back every setting under the key a browser already keeps it', async () => {
  const kept = { 'waits.dismissed': ['w1'], 'waits.ring': 'remind', 'brief.markdown': 'raw', 'changes.layout': 'split', 'changes.tree': true, 'crews.unfolded': ['c1'], 'stats.range': 'month', 'tips.on': false, 'tips.dismissed': ['pattern/p1'] }
  assert.deepEqual(await readViewer(storeOf(kept)), { dismissed: ['w1'], ring: 'remind', briefMarkdown: 'raw', diffLayout: 'split', changesTree: true, crewsUnfolded: ['c1'], statsRange: 'month', tips: false, tipsDismissed: ['pattern/p1'] })
})

test('a setting never kept reads as its default', async () => {
  assert.deepEqual(await readViewer(storeOf({ 'waits.ring': 'off' })), { ...VIEWER_DEFAULT, ring: 'off' })
})

test('a setting kept as another kind of value reads as its default', async () => {
  const kept = { 'changes.tree': '"><img src=x>', 'waits.dismissed': 'w1', 'crews.unfolded': [1], 'waits.ring': 3 }
  assert.deepEqual(await readViewer(storeOf(kept)), VIEWER_DEFAULT)
})
