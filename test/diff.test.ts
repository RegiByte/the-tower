import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { beforeCount, MAX_FILE_LINES, parseDiff, withBefore } from '../src/bridge/diff.ts'

const out = readFileSync(new URL('./fixtures/changes.diff', import.meta.url), 'utf8')
const files = parseDiff(out)
const byPath = (path: string) => files.find((f) => f.path === path)!

test('git diff: one file per block, its path, change and counts', () => {
  assert.deepEqual(
    files.map(({ path, from, change, binary, added, removed }) => ({ path, from, change, binary, added, removed })),
    [
      { path: 'blob.bin', from: undefined, change: 'modified', binary: true, added: 0, removed: 0 },
      { path: 'gone.txt', from: undefined, change: 'deleted', binary: false, added: 0, removed: 1 },
      { path: 'keep.txt', from: undefined, change: 'modified', binary: false, added: 2, removed: 2 },
      { path: 'renamed.txt', from: 'moved.txt', change: 'renamed', binary: false, added: 1, removed: 1 },
      { path: 'same-renamed.txt', from: 'same.txt', change: 'renamed', binary: false, added: 0, removed: 0 },
      { path: 'script.sh', from: undefined, change: 'modified', binary: false, added: 0, removed: 0 },
      { path: 'tab\tname.txt', from: undefined, change: 'modified', binary: false, added: 1, removed: 1 },
      { path: 'tail.txt', from: undefined, change: 'modified', binary: false, added: 2, removed: 1 },
    ],
  )
})

test('git diff: hunks start where git says, lines keep their marks', () => {
  assert.deepEqual(byPath('keep.txt').hunks, [
    { old: 2, new: 2, heading: '', lines: [' 2', ' 3', ' 4', '-5', '+five', ' 6', ' 7', ' 8'] },
    { old: 12, new: 12, heading: '', lines: [' 12', ' 13', ' 14', '-15', '+fifteen', ' 16', ' 17', ' 18'] },
  ])
  assert.deepEqual(byPath('tail.txt').hunks, [
    { old: 1, new: 1, heading: '', lines: ['-no newline', '\\ No newline at end of file', '+no newline', '+now one', '\\ No newline at end of file'] },
  ])
  assert.deepEqual(byPath('gone.txt').hunks, [{ old: 1, new: 0, heading: '', lines: ['-gone'] }])
  assert.equal(byPath('blob.bin').hunks, undefined)
  assert.deepEqual(byPath('script.sh').hunks, [])
})

test('git diff: a file past the limit keeps its counts and drops its hunks', () => {
  const lines = Array.from({ length: MAX_FILE_LINES + 1 }, (_, i) => `+${i}`)
  const [big] = parseDiff(['diff --git a/big b/big', 'new file mode 100644', '--- /dev/null', '+++ b/big', `@@ -0,0 +1,${lines.length} @@`, ...lines, ''].join('\n'))
  assert.equal(big.added, MAX_FILE_LINES + 1)
  assert.equal(big.hunks, undefined)
})

test('git diff: a file hashes the same until its diff changes', () => {
  assert.equal(new Set(files.map((f) => f.hash)).size, files.length)
  assert.deepEqual(parseDiff(out).map((f) => f.hash), files.map((f) => f.hash))
  const edited = parseDiff(out.replace('+fifteen', '+FIFTEEN'))
  assert.notEqual(edited.find((f) => f.path === 'keep.txt')!.hash, byPath('keep.txt').hash)
  assert.equal(edited.find((f) => f.path === 'tail.txt')!.hash, byPath('tail.txt').hash)
})

test('git diff: each hunk carries the unchanged lines since the one before it, cut from the text git diffed', () => {
  const text = Array.from({ length: 20 }, (_, i) => String(i + 1)).map((l) => (l === '5' ? 'five' : l === '15' ? 'fifteen' : l)).join('\n') + '\n'
  const keep = withBefore(byPath('keep.txt'), text)
  assert.deepEqual(keep.hunks!.map((h) => h.before), [['1'], ['9', '10', '11']])
  assert.equal(withBefore(byPath('keep.txt'), ['header', ...text.split('\n')].join('\n')), byPath('keep.txt'))
  assert.deepEqual(withBefore(byPath('keep.txt'), text.replaceAll('\n', '\r\n')).hunks!.map((h) => h.before!.length), [1, 3])
  const [gap] = parseDiff(['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -3 +2,0 @@', '-c', ''].join('\n'))
  assert.equal(withBefore(gap, 'a\nb\nd\n'), gap, 'no own line to tell the text by')
})

test('git diff: the lines before hunks are counted from their headers, before any read', () => {
  assert.equal(beforeCount(byPath('keep.txt')), 4)
  const [gap] = parseDiff(['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -3 +2,0 @@', '-c', ''].join('\n'))
  assert.equal(beforeCount(gap), 2)
  const [deep] = parseDiff(['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -5000 +5000 @@', '-a', '+b', ''].join('\n'))
  assert.equal(beforeCount(deep), 4999)
})
