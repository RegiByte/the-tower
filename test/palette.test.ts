import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WEIGHTS, matchScore, rankPalette, type Entry, type GoTarget, type Ranking } from '../src/shared/palette.ts'

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

const go = (id: string, label: string, target: GoTarget, more: Partial<Entry> = {}): Entry => entry(id, label, { does: { t: 'go', target }, ...more })

test('with nothing typed: the selected worker’s verbs, who waits and recent picks, the last two capped, then every other entry once, Learn last', () => {
  const own = Array.from({ length: 7 }, (_, n) => entry(`card/${n}`, `Verb ${n}`, { group: 'ODIN-07', card: 'w1', project: 'p1', does: { t: 'action', subject: 'card', verb: 'review', id: 'w1' } }))
  const workers = Array.from({ length: 7 }, (_, n) => go(`worker:w${n + 2}`, `W${n + 2}`, { t: 'worker', id: `w${n + 2}` }, { group: 'Workers', card: `w${n + 2}`, project: n % 2 ? 'p1' : 'p2' }))
  const commands = Array.from({ length: 7 }, (_, n) => entry(`command:${n}`, `Command ${n}`))
  const floors = [go('floor:p2', 'Two', { t: 'floor', project: 'p2' }, { group: 'Floors', project: 'p2' }), go('floor:p1', 'One', { t: 'floor', project: 'p1' }, { group: 'Floors', project: 'p1' })]
  const floorVerbs = ['p2', 'p1'].map((p) => entry(`floor/tidy@${p}`, 'Tidy', { group: p === 'p1' ? 'One' : 'Two', project: p, does: { t: 'action', subject: 'floor', verb: 'tidy', project: p } }))
  const shelf = go('shelf:p1/0', 'KB', { t: 'shelf', project: 'p1', n: 0 }, { group: 'Shelf', project: 'p1' })
  const draft = go('draft:p2/d', 'A draft', { t: 'draft', project: 'p2', id: 'd' }, { group: 'Drafts', project: 'p2' })
  const learn = entry('learn:shells', 'Shells keep running', { group: 'Learn', learn: true })
  const entries = [...own, learn, draft, shelf, ...floors, ...floorVerbs, ...workers, ...commands]
  const r: Ranking = { selected: 'w1', floor: 'p1', recent: ['card/0', learn.id, ...commands.map((e) => e.id)], waiting: workers.map((e) => e.card!) }
  const groups = rankPalette(entries, '', r)
  assert.deepEqual(groups.map((g) => g.group), ['ODIN-07', 'Waiting on you', 'Recent', 'Workers on One', 'Workers on other floors', 'Commands', 'One', 'Two', 'Floors', 'Shelf', 'Drafts', 'Learn'])
  assert.deepEqual(groups.slice(0, 3).map((g) => g.entries.length), [own.length, WEIGHTS.groupCap, WEIGHTS.groupCap])
  assert.deepEqual(groups[1].entries.map((e) => e.id), workers.slice(0, WEIGHTS.groupCap).map((e) => e.id))
  assert.ok(!groups[2].entries.some((e) => e.id === 'card/0' || e.learn), 'a recent pick already shown, or a Learn one, is not in Recent')
  assert.deepEqual(groups[3].entries.map((e) => e.id), ['worker:w7'], 'workers waiting on the viewer are not repeated below')
  assert.deepEqual(groups[5].entries.map((e) => e.id), ['command:5', 'command:6'])
  assert.deepEqual(groups[8].entries.map((e) => e.id), ['floor:p1', 'floor:p2'], 'the viewer’s floor first')
  assert.deepEqual(ids(groups).toSorted(), entries.map((e) => e.id).toSorted(), 'every entry once')
})

test('with nothing typed: the selected worker’s earlier conversations go to the catalog, among the floors’ verbs, its floor’s first', () => {
  const verb = entry('card/brief', 'Brief', { group: 'ODIN-07', card: 'w1', project: 'p1', does: { t: 'action', subject: 'card', verb: 'review', id: 'w1' } })
  const earlier = Array.from({ length: 12 }, (_, n) => entry(`conversation/resume@c${n}`, 'Resume: an earlier conversation', { group: 'ODIN-07', card: 'w1', project: 'p1', does: { t: 'action', subject: 'conversation', verb: 'resume', id: 'w1', conversation: `c${n}` } }))
  const tidy = entry('floor/tidy@p2', 'Tidy', { group: 'Two', project: 'p2', does: { t: 'action', subject: 'floor', verb: 'tidy', project: 'p2' } })
  const groups = rankPalette([tidy, ...earlier, verb, entry('command:help', 'Keys')], '', { ...nowhere, selected: 'w1', floor: 'p1' })
  assert.deepEqual(groups.map((g) => [g.group, g.entries.length]), [['ODIN-07', 1], ['Commands', 1], ['ODIN-07: earlier conversations and processes', 12], ['Two', 1]])
})

test('with nothing typed: a recent pick past Recent’s cap doesn’t lift another floor’s entry over the viewer’s', () => {
  const floors = ['p2', 'p1'].map((p) => go(`floor:${p}`, p, { t: 'floor', project: p }, { group: 'Floors', project: p }))
  const commands = Array.from({ length: WEIGHTS.groupCap }, (_, n) => entry(`command:${n}`, `Command ${n}`))
  const groups = rankPalette([...floors, ...commands], '', { ...nowhere, floor: 'p1', recent: [...commands.map((e) => e.id), 'floor:p2'] })
  assert.deepEqual(groups.find((g) => g.group === 'Floors')?.entries.map((e) => e.id), ['floor:p1', 'floor:p2'])
})

test('with nothing typed: a floor named like a section, or like another floor, keeps its verbs apart', () => {
  const tidy = (p: string, name: string) => entry(`floor/tidy@${p}`, 'Tidy', { group: name, project: p, does: { t: 'action', subject: 'floor', verb: 'tidy', project: p } })
  const groups = rankPalette([entry('command:help', 'Keys'), tidy('p1', 'Commands'), tidy('p2', 'Same'), tidy('p3', 'Same')], '', nowhere)
  assert.deepEqual(groups.map((g) => [g.group, g.entries.length]), [['Commands', 1], ['Commands', 1], ['Same', 1], ['Same', 1]])
})

test('a Learn entry shows on an empty query only at the bottom, and on a match at most two', () => {
  const learn = Array.from({ length: 4 }, (_, n) => entry(`learn:${n}`, `Shells keep running ${n}`, { group: 'Learn', learn: true }))
  assert.deepEqual(ids(rankPalette([...learn, entry('command:help', 'Keys')], '', nowhere)), ['command:help', ...learn.map((e) => e.id)])
  assert.equal(rankPalette(learn, 'shells', nowhere)[0].entries.length, WEIGHTS.learnCap)
})
