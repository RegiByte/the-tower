import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appended, isOpen, msOf, nextProposal, opened, parseRound, presentIn, proposalsOf, roundLines, roundView, type Entry } from '../examples/extensions/coffee/client/rounds.ts'

const entry = (author: string, at: string, act: Entry['act'], body = ''): Entry => ({ author, at, act, body })

/** A round as the verbs write it: called by the user, two workers in, one idea, the user's decision, closed by the tower. */
const round = () => {
  let text = opened(entry('Ana', '2026-11-04 10:58', { t: 'calls' }, 'invited HOLMES-42, ODIN-07 · busy: VESPER-33: working'))
  text = appended(text, entry('HOLMES-42', '2026-11-04 10:59', { t: 'joins' }, 'Fixing the Caps Lock bug in the terminal.\nStuck on WebKit.'))
  text = appended(text, entry('ODIN-07', '2026-11-04 11:01', { t: 'joins' }, 'Writing the coffee extension.'))
  text = appended(text, entry('ODIN-07', '2026-11-04 11:02', { t: 'says' }, 'HOLMES-42, xterm already sent the key: cancel the keypress after.\n\n## not a heading\n```\n## nor this · 2026-11-04 11:02 · says\n```'))
  text = appended(text, entry('HOLMES-42', '2026-11-04 11:03', { t: 'proposes', n: 1, title: 'One fixture per Caps Lock bug' }, 'Record a session with Caps Lock on so the bridge replays it.'))
  text = appended(text, entry('Ana', '2026-11-04 11:10', { t: 'hires', n: 1, session: '20261104-111000-9f2c' }))
  return text
}

test('a round file is a title and entries; bodies keep heading-shaped lines inside fences; nothing else is stored', () => {
  const text = round()
  const parsed = parseRound(text)
  assert.equal(parsed.title, 'Coffee · 2026-11-04 10:58')
  assert.deepEqual(parsed.entries.map((e) => [e.author, e.act.t]), [['Ana', 'calls'], ['HOLMES-42', 'joins'], ['ODIN-07', 'joins'], ['ODIN-07', 'says'], ['HOLMES-42', 'proposes'], ['Ana', 'hires']])
  assert.match(parsed.entries[3].body, /## nor this/)
  assert.ok(isOpen(parsed))
  assert.deepEqual(presentIn(parsed).map((p) => [p.callsign, p.at]), [['HOLMES-42', '2026-11-04 10:59'], ['ODIN-07', '2026-11-04 11:01']])
  assert.deepEqual(proposalsOf(parsed), [{ n: 1, by: 'HOLMES-42', at: '2026-11-04 11:03', title: 'One fixture per Caps Lock bug', body: 'Record a session with Caps Lock on so the bridge replays it.', decision: { t: 'hire', session: '20261104-111000-9f2c', by: 'Ana', at: '2026-11-04 11:10' } }])
  assert.equal(nextProposal(parsed), 2)
  const closed = parseRound(appended(text, entry('the tower', '2026-11-04 11:30', { t: 'closes' }, 'quiet for 20 minutes')))
  assert.ok(!isOpen(closed))
  const view = roundView('20261104T105800Z-coffee.md', 'ivory-otter', closed)
  assert.deepEqual([view.opened, view.by, view.closed, view.said, view.lastAt], ['2026-11-04 10:58', 'Ana', '2026-11-04 11:30', 1, msOf('2026-11-04 11:30')])
  assert.equal(parseRound('').entries.length, 0)
})

test('a round in words: where and who, then each entry, ideas with where they stand', () => {
  const parsed = parseRound(round())
  const lines = roundLines(roundView('x.md', 'ivory-otter', parsed), parsed.entries, 'Tower', (s) => (s === '20261104-111000-9f2c' ? 'ZECA-12' : undefined))
  assert.equal(lines[0], 'Coffee on Tower since 10:58 (round ivory-otter, called by Ana). Here: HOLMES-42, ODIN-07.')
  assert.equal(lines[1], 'Ana (10:58, calls): invited HOLMES-42, ODIN-07 · busy: VESPER-33: working')
  assert.equal(lines[2], 'HOLMES-42 (10:59, joins): Fixing the Caps Lock bug in the terminal. Stuck on WebKit.')
  assert.equal(lines[5], 'HOLMES-42 (11:03, proposes p1 "One fixture per Caps Lock bug" (hired ZECA-12 on it, Ana at 11:10)): Record a session with Caps Lock on so the bridge replays it.')
  assert.equal(lines.length, 6, 'a decision is said on its proposal, not as a line of its own')
})
