import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdirSync } from 'node:fs'
import { lastFrame, mirrorOf, screenAt, snapshot } from '../src/bridge/screen.ts'
import type { LogEvent, SessionLog } from '../src/shared/model.ts'
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

/** The log's screen events while the session still ran: its output and resizes. */
const running = (log: SessionLog): SessionLog => ({ ...log, events: log.events.filter((event) => event[1] === 'o' || event[1] === 'r') })

/**
 * A mirror built from the first quarter of the log and drawn the rest of it event by event, without waiting, snapshots
 * at each cut what a replay of the log up to there gives.
 */
const assertMirrorsReplay = async (log: SessionLog) => {
  const { header, events } = running(log)
  const cuts = [0.25, 0.5, 0.75, 1].map((at) => Math.round(events.length * at))
  const mirror = await mirrorOf({ header, events: events.slice(0, cuts[0]) })
  let drawn = cuts[0]
  for (const cut of cuts) {
    for (; drawn < cut; drawn++) mirror.draw(events[drawn])
    assert.equal(await mirror.snapshot(), await snapshot({ header, events: events.slice(0, cut) }), `${header.id} cut at ${cut} of ${events.length} events`)
  }
  mirror.dispose()
}

test('every fixture: a mirror drawn as the log grows snapshots what a replay of the log so far gives', async () => {
  const names = readdirSync(new URL('fixtures', import.meta.url)).filter((file) => file.endsWith('.jsonl'))
  for (const name of names) await assertMirrorsReplay(fixture(name.slice(0, -'.jsonl'.length)))
})

test('tool-turn: a mirror resizes in order with the output around it', async () => {
  const log = fixture('tool-turn')
  const outputs = log.events.flatMap((event, index) => (event[1] === 'o' ? [index] : []))
  const resizeAt = new Map<number, `${number}x${number}`>([
    [outputs[Math.round(outputs.length * 0.3)], '90x24'],
    [outputs[Math.round(outputs.length * 0.55)], `${log.header.cols}x${log.header.rows}`],
    [outputs[Math.round(outputs.length * 0.8)], '70x40'],
  ])
  const events = log.events.flatMap((event, index): LogEvent[] => {
    const size = resizeAt.get(index)
    return size ? [[event[0], 'r', size], event] : [event]
  })
  await assertMirrorsReplay({ ...log, events })
})
