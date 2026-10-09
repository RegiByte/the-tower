import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { DiffFile } from '../src/bridge/diff.ts'
import type { RepoChanges } from '../src/changes.ts'
import { anchorState, appended, nextNumber, parseThread, printThread, unseenBy, type Anchor } from '../src/shared/reviews.ts'

/** Written by `review/append` on the sandbox: an anchored note, a reply, a diff quote beside a plain one, a bare anchor. */
const text = readFileSync(new URL('./fixtures/review-thread.md', import.meta.url), 'utf8')
const thread = parseThread(text)

test('review thread: each message with its author, time, number and the one it answers', () => {
  assert.equal(thread.checkout, 'main')
  assert.deepEqual(
    thread.messages.map(({ author, at, n, re }) => ({ author, at, n, re })),
    [
      { author: 'user', at: '2026-10-06 15:32', n: 1, re: undefined },
      { author: 'ODIN-42', at: '2026-10-06 15:32', n: 2, re: 1 },
      { author: 'MORIARTY-91', at: '2026-10-06 15:32', n: 3, re: undefined },
      { author: 'user', at: '2026-10-06 15:32', n: 4, re: 3 },
    ],
  )
})

test('review thread: anchors keep their lines as quoted, a longer fence holding backticks', () => {
  assert.deepEqual(thread.messages[0].anchors, [
    {
      repo: 'lab-api',
      path: 'src/routes/ticket.ts',
      from: 31,
      to: 34,
      quote: { lang: 'ts', lines: ['  for (const file of untracked.slice(0, 300)) {', '    const diff = await untrackedDiff(dir, file)', '    outs.push(diff)', '  }'] },
    },
  ])
  assert.deepEqual(thread.messages[2].anchors, [
    { repo: 'lab', path: 'README.md', from: 3, to: 4, quote: { lang: 'diff', lines: ['-Run it with `npm start`.', '+Run it with ``npm run dev``, or:', '+```sh'] } },
    { repo: 'lab-api', path: 'config.ts', from: 2, to: 2, quote: { lang: 'ts', lines: ['export const host = "127.0.0.1"'] } },
  ])
  assert.deepEqual(thread.messages[3].anchors, [{ repo: 'lab-api', path: 'config.ts', from: 1, to: 1, quote: undefined }])
})

test('review thread: a body keeps its paragraphs, and a heading inside its code fence', () => {
  assert.equal(thread.messages[1].body, 'git diff never shows untracked files; 300 caps a fresh node_modules. Added a comment.')
  assert.equal(
    thread.messages[2].body,
    "The README lost its start command, and the host is hard-coded.\n\nA heading in a fence stays body:\n\n```md\n## user · 2026-10-06 14:32 · n9\n```\n\nThat's all.",
  )
  assert.equal(thread.messages[3].body, '')
})

test('review thread: printing what was parsed gives the file back, and a note appends after it', () => {
  assert.equal(printThread(thread), text)
  const note = { author: 'ODIN-42', at: '2026-10-06 16:00', n: nextNumber(thread), re: 4, anchors: [], body: 'Moved to the env.' }
  assert.equal(nextNumber(thread), 5)
  assert.equal(appended(text, 'main', note), `${text}\n## ODIN-42 · 2026-10-06 16:00 · n5 · re n4\nMoved to the env.\n`)
  assert.equal(appended(undefined, 'odin-42', { ...note, n: 1, re: undefined }), '# odin-42\n\n## ODIN-42 · 2026-10-06 16:00 · n1\nMoved to the env.\n')
})

test('review thread: a worker has seen everything up to its own last note, and nothing before it wrote', () => {
  assert.deepEqual(unseenBy(thread, 'ODIN-42').map((m) => m.n), [3, 4])
  assert.deepEqual(unseenBy(thread, 'user').map((m) => m.n), [])
  assert.deepEqual(unseenBy(thread, 'CAESAR-60').map((m) => m.n), [1, 2, 3, 4])
})

const file = (path: string, lines: string[]): DiffFile => ({
  path,
  change: 'modified',
  binary: false,
  added: lines.filter((l) => l[0] === '+').length,
  removed: lines.filter((l) => l[0] === '-').length,
  hash: path,
  hunks: [{ old: 1, new: 1, heading: '', lines }],
})

const repos: RepoChanges[] = [
  { dir: '/w/lab', against: 'origin/main', since: 'a', commits: [], shows: 'all', more: 0, files: [file('README.md', [' # lab', ' ', '-Run it with `npm start`.', '+Run it with ``npm run dev``, or:', '+```sh'])] },
  { dir: '/w/lab-api/.worktrees/odin-42', against: 'origin/main', since: 'b', commits: [], shows: 'all', more: 0, files: [file('config.ts', ['+export const port = 4000', '+export const host = process.env.HOST'])] },
]

test('anchors in the diff: the quoted lines as they were, changed since, or gone from it', () => {
  const [, , third] = thread.messages
  const [readme, host] = third.anchors
  assert.equal(anchorState(readme, repos), 'same')
  assert.equal(anchorState(host, repos), 'changed')
  assert.equal(anchorState(thread.messages[0].anchors[0], repos), 'gone')
  const port: Anchor = { repo: 'lab-api', path: 'config.ts', from: 1, to: 1, quote: { lang: 'ts', lines: ['export const port = 4000'] } }
  assert.equal(anchorState(port, repos), 'same')
})
