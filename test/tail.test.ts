import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { screenAt } from '../src/bridge/screen.ts'
import { BOOTING } from '../src/bridge/status.ts'
import { factEvents, readLog, screenEvents } from '../src/tail.ts'
import { fixture, timeline } from './replay.ts'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')
const names = readdirSync(FIXTURES).filter((file) => file.endsWith('.jsonl')).map((file) => file.slice(0, -'.jsonl'.length))
const logPath = (name: string) => path.join(FIXTURES, `${name}.jsonl`)

test('the fixtures hold PostToolUse with its tool response, which the fact filter reads by name alone', () => {
  assert.ok(names.some((name) => readFileSync(logPath(name), 'utf8').includes('"hook_event_name":"PostToolUse"')))
})

for (const name of names) {
  test(`${name}: the fact filter folds the same facts as every event`, () => {
    assert.deepEqual(factsOf(readLog(logPath(name), factEvents(BOOTING)).log), factsOf(fixture(name)))
  })

  test(`${name}: the fact filter passes every status the session went through`, () => {
    assert.deepEqual(timeline(readLog(logPath(name), factEvents(BOOTING)).log), timeline(fixture(name)))
  })

  test(`${name}: the screen filter draws the same screen as every event`, async () => {
    assert.deepEqual(await screenAt(readLog(logPath(name), screenEvents).log), await screenAt(fixture(name)))
  })
}
