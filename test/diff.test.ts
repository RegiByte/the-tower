import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MAX_FILE_LINES, parseDiff } from '../src/bridge/diff.ts'

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
