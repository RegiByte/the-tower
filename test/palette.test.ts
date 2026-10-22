import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WEIGHTS, matchScore, rankPalette, type Entry, type Ranking } from '../src/shared/palette.ts'

const entry = (id: string, label: string, more: Partial<Entry> = {}): Entry => ({ id, group: 'Commands', label, keywords: [], does: { t: 'command', id: 'help' }, ...more })

const nowhere: Ranking = { selected: undefined, floor: undefined, recent: [], waiting: [] }

const ids = (groups: ReturnType<typeof rankPalette>) => groups.flatMap((g) => g.entries.map((e) => e.id))

test('a prefix beats a word start, which beats a substring, which beats a subsequence', () => {
  const scores = ['send', 'home', 'end', 'sdhm', 'xyz'].map((q) => matchScore('Send home', q))
  assert.deepEqual(scores, [WEIGHTS.prefix, WEIGHTS.wordStart, WEIGHTS.substring, WEIGHTS.subsequence, 0])
  const entries = [entry('subsequence', 'Ready set'), entry('substring', 'Unrest'), entry('word', 'Go rest'), entry('prefix', 'Restart'), entry('none', 'Brief')]
  assert.deepEqual(ids(rankPalette(entries, 'rest', nowhere)), ['prefix', 'word', 'substring', 'subsequence'])
})

test('letters in order match only a label, and not a Learn sentence', () => {
  const entries = [entry('label', 'Send home'), entry('keyword', 'Brief', { keywords: ['Send home'] }), entry('learn', 'Send a worker home', { group: 'Learn', learn: true })]
  assert.deepEqual(ids(rankPalette(entries, 'sdhm', nowhere)), ['label'])
})

test('a plural query finds the singular label, ranked above a Learn sentence it matches as typed', () => {
  const entries = [entry('learn:shells', 'Shells keep running', { group: 'Learn', learn: true }), entry('command:shell-here', 'Shell here'), entry('command:help', 'Keys')]
  assert.equal(matchScore('Shell here', 'shells'), 0)
  assert.deepEqual(ids(rankPalette(entries, 'shells', nowhere)), ['command:shell-here', 'learn:shells'])
})

test('a match on a keyword counts less than the same match on the label', () => {
  const entries = [entry('keyword', 'Brief', { keywords: ['changes'] }), entry('label', 'Changes')]
  assert.deepEqual(ids(rankPalette(entries, 'chan', nowhere)), ['label', 'keyword'])
})

test('the selected worker, its floor and recent picks each lift an entry over an equal one', () => {
  const plain = entry('plain', 'Resume')
  const cases: [Entry, Ranking][] = [
    [entry('selected', 'Resume', { card: 'w1' }), { ...nowhere, selected: 'w1' }],
    [entry('floor', 'Resume', { project: 'p1' }), { ...nowhere, selected: 'w1', floor: 'p1' }],
    [entry('recent', 'Resume'), { ...nowhere, recent: ['recent'] }],
  ]
  for (const [lifted, r] of cases) assert.deepEqual(ids(rankPalette([plain, lifted], 'res', r)), [lifted.id, 'plain'], lifted.id)
})

test('no boost lifts an entry over a better match', () => {
  const r: Ranking = { selected: 'w1', floor: 'p1', recent: ['boosted'], waiting: [] }
  const entries = [entry('boosted', 'Go resume', { card: 'w1', project: 'p1' }), entry('prefix', 'Resume')]
  assert.deepEqual(ids(rankPalette(entries, 'resume', r)), ['prefix', 'boosted'])
  const keyword = [entry('boosted', 'Brief', { keywords: ['resume'], card: 'w1', project: 'p1' }), entry('label', 'Go resume')]
  assert.deepEqual(ids(rankPalette(keyword, 'resume', { ...r, recent: ['boosted'] })), ['label', 'boosted'], 'a boosted keyword prefix stays below a word start on a label')
})

test('groups come in the order of their best entry', () => {
  const entries = [entry('a', 'Unresume', { group: 'Commands' }), entry('b', 'Resume', { group: 'Workers' })]
  assert.deepEqual(rankPalette(entries, 'resume', nowhere).map((g) => g.group), ['Workers', 'Commands'])
})

test('with nothing typed: the selected worker’s verbs, who waits, then recent picks, each capped', () => {
  const own = Array.from({ length: 7 }, (_, n) => entry(`card/${n}`, `Verb ${n}`, { group: 'ODIN-07', card: 'w1', does: { t: 'action', subject: 'card', verb: 'review', id: 'w1' } }))
  const workers = Array.from({ length: 7 }, (_, n) => entry(`worker:w${n + 2}`, `W${n + 2}`, { group: 'Workers', card: `w${n + 2}`, does: { t: 'go', target: { t: 'worker', id: `w${n + 2}` } } }))
  const commands = Array.from({ length: 7 }, (_, n) => entry(`command:${n}`, `Command ${n}`))
  const r: Ranking = { selected: 'w1', floor: 'p1', recent: ['card/0', ...commands.map((e) => e.id)], waiting: workers.map((e) => e.card!) }
  const groups = rankPalette([...own, ...workers, ...commands], '', r)
  assert.deepEqual(groups.map((g) => g.group), ['ODIN-07', 'Waiting on you', 'Recent'])
  assert.deepEqual(groups.map((g) => g.entries.length), [WEIGHTS.groupCap, WEIGHTS.groupCap, WEIGHTS.groupCap])
  assert.deepEqual(groups[1].entries.map((e) => e.id), workers.slice(0, WEIGHTS.groupCap).map((e) => e.id))
  assert.ok(!groups[2].entries.some((e) => e.id === 'card/0'), 'a recent pick already shown is not repeated')
})

test('a recent Learn pick stays out of the empty palette', () => {
  const learn = entry('learn:shells', 'Shells keep running', { group: 'Learn', learn: true })
  assert.deepEqual(rankPalette([learn, entry('command:help', 'Keys')], '', { ...nowhere, recent: ['learn:shells', 'command:help'] }).flatMap((g) => g.entries.map((e) => e.id)), ['command:help'])
})

test('Learn shows only on a match, at most two', () => {
  const learn = Array.from({ length: 4 }, (_, n) => entry(`learn:${n}`, `Shells keep running ${n}`, { group: 'Learn', learn: true }))
  assert.deepEqual(rankPalette(learn, '', nowhere), [])
  assert.equal(rankPalette(learn, 'shells', nowhere)[0].entries.length, WEIGHTS.learnCap)
})
