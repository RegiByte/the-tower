import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lastFrame, screenAt } from '../src/bridge/screen.ts'
import type { LogEvent } from '../src/shared/model.ts'
import { fixture } from './replay.ts'

const RESUME_LINE = 'Resume this session with:'

test('tool-turn: the whole log ends on the normal screen, empty but for the resume line', async () => {
  const rows = await screenAt(fixture('tool-turn'))
  assert.equal(rows.filter((row) => row.trim()).length, 2)
  assert.ok(rows.includes(RESUME_LINE))
})

test("tool-turn: an exited session's last frame is the conversation as Claude last drew it", async () => {
  const rows = await screenAt(lastFrame(fixture('tool-turn')))
  assert.equal(rows[0], ' ▐▛███▛█   Claude Code v2.1.287')
  assert.equal(rows[9], '⏺ Files in src/bridge:')
  assert.equal(rows[33], '✻ Cogitated for 4s · done 11:39 PM')
  assert.equal(rows[36], '❯\u00a0')
  assert.ok(!rows.includes(RESUME_LINE))
})

test('tool-turn: the cut is found with the escape split across two output events', async () => {
  const log = fixture('tool-turn')
  const events = log.events.flatMap((event): LogEvent[] => {
    if (event[1] !== 'o' || !event[2].includes('\x1b[?1049l')) return [event]
    const at = event[2].indexOf('\x1b[?1049l') + 4
    return [[event[0], 'o', event[2].slice(0, at)], [event[0], 'o', event[2].slice(at)]]
  })
  assert.deepEqual(await screenAt(lastFrame({ ...log, events })), await screenAt(lastFrame(log)))
})

test('tool-turn: a session still running is replayed whole', () => {
  const log = fixture('tool-turn')
  const running = { ...log, events: log.events.filter((event) => event[1] !== 'x') }
  assert.equal(lastFrame(running), running)
})
