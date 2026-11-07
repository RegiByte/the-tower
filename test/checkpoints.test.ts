import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mock, test } from 'node:test'
import { deserialize } from 'node:v8'
import { factsAfter, factsOf, initialFacts, type Facts } from '../src/bridge/facts.ts'
import { FOLD, foldLog, sourceHash, sourcesOf, writeCheckpoint, type Checkpoint } from '../src/checkpoints.ts'
import { gzipSync } from 'node:zlib'
import { screenEvents, readLog } from '../src/tail.ts'
import { fixture } from './replay.ts'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')
const names = readdirSync(FIXTURES).filter((file) => file.endsWith('.jsonl') && file !== 'probe-quota.jsonl').map((file) => file.slice(0, -'.jsonl'.length))
const logPath = (name: string) => path.join(FIXTURES, `${name}.jsonl`)
const freshCache = () => mkdtempSync(path.join(os.tmpdir(), 'tower-checkpoints-'))

/** The byte offset where each line of the log starts, the header's included, and the end of its last line. */
const lineStarts = (name: string): number[] => {
  const buf = readFileSync(logPath(name))
  const starts = [0]
  for (let end = buf.indexOf(0x0a); end !== -1; end = buf.indexOf(0x0a, end + 1)) starts.push(end + 1)
  return starts
}

for (const name of names) {
  test(`${name}: facts resumed from a checkpoint at any event boundary are the facts folded from the start`, () => {
    const log = fixture(name)
    const whole = factsOf(log)
    const starts = lineStarts(name)
    const end = statSync(logPath(name)).size
    const cache = freshCache()
    const step = factsAfter(log.header.startedAt)
    let facts = initialFacts(log.header)
    for (let k = 0; k <= log.events.length; k++) {
      writeCheckpoint(cache, { fold: FOLD, header: log.header, offset: starts[k + 1], facts })
      const folded = foldLog(cache, logPath(name))!
      assert.deepEqual(folded.session.facts, whole, `resumed after event ${k}`)
      assert.equal(folded.offset, end)
      if (k < log.events.length) facts = step(facts, log.events[k])
    }
    rmSync(cache, { recursive: true })
  })
}

/** The fixture as Tidy archives it: gzipped in place, `<name>.jsonl.gz`, in a dir of its own. */
const archived = (name: string) => {
  const file = path.join(freshCache(), `${name}.jsonl.gz`)
  writeFileSync(file, gzipSync(readFileSync(logPath(name))))
  return file
}

for (const name of names) {
  test(`${name}: an archived log folds to the plain log's facts and offset, from its start and from the checkpoint it leaves`, () => {
    const file = archived(name)
    const plain = foldLog(freshCache(), logPath(name))!
    const cache = freshCache()
    assert.deepEqual(foldLog(cache, file), plain)
    assert.deepEqual(foldLog(cache, file), plain)
    assert.deepEqual(readLog(file, screenEvents), readLog(logPath(name), screenEvents))
  })
}

const name = names[0]
const { header } = fixture(name)
const whole = factsOf(fixture(name))
const planted: Facts = { ...initialFacts(header), turns: 999 }
const checkpointFile = (cache: string) => path.join(cache, 'facts', `${header.id}.v8`)

test('a log with no checkpoint is folded from its start, and leaves one at its end', () => {
  const cache = freshCache()
  assert.deepEqual(foldLog(cache, logPath(name))!.session.facts, whole)
  const kept: Checkpoint = deserialize(readFileSync(checkpointFile(cache)))
  assert.equal(kept.offset, statSync(logPath(name)).size)
  assert.deepEqual(kept.facts, whole)
  rmSync(cache, { recursive: true })
  assert.deepEqual(foldLog(cache, logPath(name))!.session.facts, whole)
})

for (const [why, checkpoint] of [
  ['made by other fold code', { fold: 'other', header, offset: lineStarts(name)[1], facts: planted }],
  ['past the end of its log', { fold: FOLD, header, offset: statSync(logPath(name)).size + 1, facts: planted }],
  ['for another header', { fold: FOLD, header: { ...header, startedAt: header.startedAt + 1 }, offset: lineStarts(name)[1], facts: planted }],
] satisfies [string, Checkpoint][]) {
  test(`a checkpoint ${why} is not used`, () => {
    const cache = freshCache()
    writeCheckpoint(cache, checkpoint)
    assert.deepEqual(foldLog(cache, logPath(name))!.session.facts, whole)
    rmSync(cache, { recursive: true })
  })
}

test('an unreadable checkpoint is a miss, said once', () => {
  const cache = freshCache()
  mkdirSync(path.dirname(checkpointFile(cache)), { recursive: true })
  writeFileSync(checkpointFile(cache), 'not a checkpoint')
  const said = mock.method(console, 'error', () => {})
  try {
    assert.deepEqual(foldLog(cache, logPath(name))!.session.facts, whole)
    assert.deepEqual(foldLog(cache, logPath(name))!.session.facts, whole)
    assert.equal(said.mock.callCount(), 1)
  } finally {
    said.mock.restore()
    rmSync(cache, { recursive: true })
  }
})

test('the fold hash covers every module the fold imports, statically or dynamically, and changes with any of them', () => {
  const covered = [...sourcesOf(path.join(import.meta.dirname, '../src/checkpoints.ts')).keys()].map((f) => path.relative(path.join(import.meta.dirname, '..'), f))
  for (const module of ['src/tail.ts', 'src/bridge/facts.ts', 'src/bridge/status.ts', 'src/bridge/conversation.ts', 'src/bridge/blocked.ts']) assert.ok(covered.includes(module), module)

  const dir = freshCache()
  mkdirSync(path.join(dir, 'lib'))
  writeFileSync(
    path.join(dir, 'main.ts'),
    "/** Like `import { gone } from './gone.ts'`. */\nimport {\n  step,\n} from './lib/step.ts'\nexport const path = './unrelated.ts'\nconst later = () => import('./later.ts')\n",
  )
  writeFileSync(path.join(dir, 'lib', 'step.ts'), "export type { Kind } from '../kind.ts'\nexport const step = 1\n")
  writeFileSync(path.join(dir, 'kind.ts'), 'export type Kind = string\n')
  writeFileSync(path.join(dir, 'later.ts'), 'export const later = 1\n')
  writeFileSync(path.join(dir, 'unrelated.ts'), 'export const other = 1\n')
  assert.deepEqual([...sourcesOf(path.join(dir, 'main.ts')).keys()].map((f) => path.relative(dir, f)).sort(), ['kind.ts', 'later.ts', 'lib/step.ts', 'main.ts'])
  const before = sourceHash(path.join(dir, 'main.ts'))
  writeFileSync(path.join(dir, 'unrelated.ts'), 'export const other = 2\n')
  assert.equal(sourceHash(path.join(dir, 'main.ts')), before)
  writeFileSync(path.join(dir, 'kind.ts'), 'export type Kind = number\n')
  assert.notEqual(sourceHash(path.join(dir, 'main.ts')), before)
  rmSync(dir, { recursive: true })
})

test('a line that isn\'t JSON, left by a host that died mid-write and ended by a let-go, breaks the fold there and the let-go is still folded', () => {
  const name = 'tool-turn'
  const file = path.join(freshCache(), `${name}.jsonl`)
  writeFileSync(file, readFileSync(logPath(name)))
  const cache = freshCache()
  const before = foldLog(cache, file)!
  writeFileSync(file, '[40.5,"h",{"hook_event_name":"Sto\n[41.25,"h",{"hook_event_name":"tower.letGo"}]\n', { flag: 'a' })
  const message = 'a line that isn\'t JSON (Unterminated string in JSON at position 33 (line 1 column 34))'
  const expected = { ...factsOf(fixture(name)), broken: { message, at: 40.5, code: 'h' }, letGoAt: 41.25 }
  assert.deepEqual(foldLog(cache, file)!.session.facts, expected, 'from the checkpoint before it')
  assert.deepEqual(foldLog(freshCache(), file)!.session.facts, expected, 'from the start')
  assert.equal(before.session.facts.broken, undefined)
})

const LOST = '20261002-023909-f6dc'
const LOST_AT = Date.UTC(2026, 9, 2, 2, 39, 9)

/** The fixture with its first line replaced by `first`, under a log file named as the host names one. */
const headless = (first: string, name = 'tool-turn') => {
  const file = path.join(freshCache(), `${LOST}.jsonl`)
  writeFileSync(file, `${first}\n${readFileSync(logPath(name), 'utf8').split('\n').slice(1).join('\n')}`)
  return file
}

for (const [first, message] of [
  ['{"id":"20261002', "its first line isn't JSON (Unterminated string in JSON at position 15 (line 1 column 16))"],
  ['null', "its first line isn't a session's header (null)"],
  ['{}', "its first line isn't a session's header ({})"],
  ['[0.1,"o","output"]', 'its first line isn\'t a session\'s header ([0.1,"o","output"])'],
] as const) {
  test(`a first line ${first} costs its session alone: the log folds to a session broken from its start, as plain or archived, and every reader reads it`, () => {
    const file = headless(first)
    const cwd = fixture('tool-turn').header.cwd
    const { session, offset } = foldLog(freshCache(), file)!
    assert.deepEqual(session.header, { id: LOST, project: '', cwd, argv: [], startedAt: LOST_AT, cols: 80, rows: 24 })
    assert.deepEqual(session.facts, { ...initialFacts(session.header), broken: { message, at: 0, code: 'header' } })
    assert.equal(offset, statSync(file).size)
    assert.equal(readLog(file, screenEvents).log.header.id, LOST)
    assert.ok(readLog(file, screenEvents).log.events.length > 0)
    const zipped = path.join(path.dirname(file), `${LOST}.jsonl.gz`)
    writeFileSync(zipped, gzipSync(readFileSync(file)))
    assert.deepEqual(foldLog(freshCache(), zipped)!.session, session)
  })
}

test('a broken header is folded the same from the checkpoint it leaves, and a log that holds no hook has no directory', () => {
  const file = headless('null')
  const cache = freshCache()
  assert.deepEqual(foldLog(cache, file), foldLog(cache, file))
  const bare = path.join(freshCache(), `${LOST}.jsonl`)
  writeFileSync(bare, 'null\n')
  assert.equal(foldLog(freshCache(), bare)!.session.header.cwd, '')
})

test("a log with no whole line isn't a broken session: the host hasn't written its header yet", () => {
  const file = path.join(freshCache(), `${LOST}.jsonl`)
  writeFileSync(file, '{"id":"2026')
  assert.equal(foldLog(freshCache(), file), undefined)
})

for (const line of ['null', '{}', '5', '"text"', '[]', '[1]']) {
  test(`an event line ${line} breaks the fold there and says what it found, and the screen skips it`, () => {
    const file = path.join(freshCache(), 'tool-turn.jsonl')
    writeFileSync(file, readFileSync(logPath('tool-turn')))
    const cache = freshCache()
    const before = foldLog(cache, file)!
    const screen = readLog(file, screenEvents).log.events
    writeFileSync(file, `${line}\n[41.25,"h",{"hook_event_name":"tower.letGo"}]\n`, { flag: 'a' })
    const expected = { ...before.session.facts, broken: { message: `a line that isn't an event (${line})`, at: 0, code: '?' }, letGoAt: 41.25 }
    assert.deepEqual(foldLog(cache, file)!.session.facts, expected, 'from the checkpoint before it')
    assert.deepEqual(foldLog(freshCache(), file)!.session.facts, expected, 'from the start')
    assert.deepEqual(readLog(file, screenEvents).log.events, screen)
  })
}
