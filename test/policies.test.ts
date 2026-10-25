import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NO_POLICY_FACTS, offersOf, policyFacts, policyViews, slotName, type PolicyFile, type PolicyView } from '../extensions/policies/policies.ts'
import { hashOf, parsePolicy } from '../extensions/policies/policy-file.ts'
import { decide, nextSlot, ruleWords, slotsBetween, slotWords, standing } from '../extensions/policies/client/policies.ts'
import type { When } from '../src/shared/slots.ts'

const MIN = 60_000
const policyText = (header: string, prose = 'Do the work.') => `# Bug hunt\n\n\`\`\`json\n${header}\n\`\`\`\n\n${prose}\n`

test('a policy is a title, a json header and prose; anything else says why at its path', () => {
  const parsed = parsePolicy(policyText('{ "when": { "cron": ["30 9 * * 1-5"] }, "start": "auto" }'))
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.header, { when: { cron: ['30 9 * * 1-5'] }, start: 'auto', live: 1, hire: {} })
  assert.equal(parsed.prompt, 'Do the work.')
  const bad = parsePolicy(policyText('{ "when": { "cron": ["0 9 1 * 1"] }, "guards": {}, "hire": { "prompt": "x" } }', ''))
  assert.ok(!bad.ok)
  assert.deepEqual(bad.problems.map((p) => p.path), ['when.cron[0]', 'hire.prompt', 'guards', 'prose'])
  assert.match(bad.problems[0].message, /sets both day of month and day of week/)
  assert.match(bad.problems[2].message, /update the tower, or put a runner's own data under x/)
  assert.deepEqual(parsePolicy('no title').ok, false)
  assert.deepEqual(parsePolicy('# T\n```json\n{ nope\n```\nx').ok, false)
  assert.notEqual(hashOf('a'), hashOf('a\n'))
})

test('every cron of the subset is said in words, crons on the same days together', () => {
  const words = (cron: string[], tz?: string) => ruleWords({ cron, tz })
  assert.equal(words(['30 9 * * 1-5', '0 15 * * 1-5'], 'America/New_York'), 'weekdays at 09:30 and 15:00 (New York)')
  assert.equal(words(['0 8-19 * * 1-5']), 'hourly on the hour from 08:00 to 19:00 on weekdays')
  assert.equal(words(['0 16 * * 5']), 'Fridays at 16:00')
  assert.equal(words(['*/2 * * * *']), 'every 2 minutes')
  assert.equal(words(['0 2 1,15 * *']), 'on the 1st and 15th of the month at 02:00')
  assert.equal(words(['30 9 * * *', '0 10 * * 6']), 'daily at 09:30; Saturdays at 10:00')
})

test('slots follow the zone: a spring-forward time is skipped, a repeated one runs once', () => {
  const at = (iso: string) => Date.parse(iso)
  const spring: When = { cron: ['30 2 * * *'], tz: 'America/New_York' }
  assert.deepEqual(slotsBetween(spring, at('2026-03-07T00:00:00Z'), at('2026-03-10T00:00:00Z')).map(slotName), ['2026-03-07T07:30:00Z', '2026-03-09T06:30:00Z'])
  const fall: When = { cron: ['0 * * * *'], tz: 'America/New_York' }
  assert.deepEqual(slotsBetween(fall, at('2026-11-01T04:30:00Z'), at('2026-11-01T07:30:00Z')).map(slotName), ['2026-11-01T05:00:00Z', '2026-11-01T07:00:00Z'])
  const twice: When = { cron: ['30 9 * * 1-5', '0 15 * * 1-5'], tz: 'America/New_York' }
  const now = at('2026-10-14T14:00:00Z')
  assert.equal(slotName(nextSlot(twice, now)!), '2026-10-14T19:00:00Z')
  assert.equal(slotWords(nextSlot(twice, now)!, 'America/New_York', now).replace(/ New York$/, ''), 'today 15:00')
})

const NOW = Date.parse('2026-10-14T13:31:00Z')
const SLOT = Date.parse('2026-10-14T13:30:00Z')
const header = (rest: string) => policyText(`{ "when": { "cron": ["30 13 * * *"], "tz": "UTC" }${rest} }`)
const file = (id: string, text: string): PolicyFile => ({ id, hash: hashOf(text), parsed: parsePolicy(text) })
const viewsOf = (files: PolicyFile[], facts = NO_POLICY_FACTS): PolicyView[] => policyViews('lab', files, facts, [], true, NOW)

test('the runner decides each due slot from the board alone: held, checked, run, offered', () => {
  const auto = file('auto.md', header(', "start": "auto"'))
  const ask = file('ask.md', header(''))
  const checked = file('checked.md', header(', "start": "auto", "check": "true"'))
  const approvals = [auto, checked].map((f): [number, string, unknown] => [0, 'a', { policy: f.id, hash: f.hash }])
  const facts = policyFacts([], approvals)
  const views = viewsOf([auto, ask, checked], facts)
  assert.deepEqual(decide({ policies: views }, new Map(), NOW), [
    { t: 'run', policy: 'auto.md', slot: SLOT },
    { t: 'pass', policy: 'ask.md', slot: SLOT, outcome: 'offered' },
    { t: 'check', policy: 'checked.md', slot: SLOT, line: 'true' },
  ])
  const found = new Map([[`checked.md@${SLOT}`, { exit: 0, ms: 5, out: '12, 15' }]])
  assert.deepEqual(decide({ policies: views.slice(2) }, found, NOW), [{ t: 'run', policy: 'checked.md', slot: SLOT, check: { exit: 0, ms: 5, out: '12, 15' } }])
  const none = new Map([[`checked.md@${SLOT}`, { exit: 1, ms: 5 }]])
  assert.deepEqual(decide({ policies: views.slice(2) }, none, NOW), [{ t: 'pass', policy: 'checked.md', slot: SLOT, outcome: 'no-work', check: { exit: 1, ms: 5 } }])
  assert.deepEqual(decide({ policies: views }, new Map(), NOW + 6 * MIN), [], 'a slot more than 5 minutes late is missed')
})

test('an edit drops an auto policy to offers and says it needs you; an offer stays open until the next slot', () => {
  const before = header(', "start": "auto"')
  const edited = file('auto.md', `${before}Never repost a bug.\n`)
  const facts = policyFacts([[NOW, 's', { policy: 'auto.md', hash: edited.hash, slot: slotName(SLOT), outcome: 'offered', check: { exit: 0, ms: 5, out: '12' } }]], [[0, 'a', { policy: 'auto.md', hash: hashOf(before) }]])
  const [view] = viewsOf([edited], facts)
  assert.deepEqual(view.needs, { kind: 'reapprove', approved: hashOf(before) })
  assert.equal(view.approved, undefined)
  assert.deepEqual(standing(view, NOW), { t: 'offered', slot: SLOT, until: SLOT + 24 * 60 * MIN })
  assert.deepEqual(view.offer?.check, { exit: 0, ms: 5, out: '12' }, 'an accepted offer records what its check found')
  assert.deepEqual(offersOf('lab', [view]).map((o) => [o.key, o.calls.accept]), [[`auto.md@${SLOT}`, ['policies/run', { project: 'lab', policy: 'auto.md', slot: SLOT, start: 'offer', check: { exit: 0, ms: 5, out: '12' } }]]])
  assert.deepEqual(decide({ policies: [view] }, new Map(), NOW), [], 'a slot with a fact is not decided again')
})
