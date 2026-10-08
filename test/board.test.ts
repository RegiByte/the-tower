import assert from 'node:assert/strict'
import { test } from 'node:test'
import { factsOf } from '../src/bridge/facts.ts'
import { board, unresumableAt } from '../src/bridge/board.ts'
import { resumeName } from '../src/bridge/chains.ts'
import { CALLSIGNS, callsigns } from '../src/shared/callsign.ts'
import { gistLine, speechOf } from '../src/shared/cards.ts'
import type { Config, SessionLog } from '../src/shared/model.ts'
import type { RepoRead } from '../src/bridge/worktrees.ts'
import { HOST_PROTOCOL, type HostLive } from '../src/shared/protocol.ts'
import { tagOf } from '../src/shared/tags.ts'
import { fixture } from './replay.ts'

const callsign = callsigns(CALLSIGNS)

const PATHS = { config: '/config.json', collections: '/c' }
const CONFIG: Config = {
  argv: ['claude'],
  env: {},
  projects: { tower: { name: 'tower', hub: '/hub', repos: [] }, lab: { name: 'lab', hub: '/lab', repos: [] }, t: { name: 't', hub: '/tmp/mct2/hub', repos: [] }, trust: { name: 'trust', hub: '/tmp/mc-sailor98/trustme', repos: [] }, rec: { name: 'rec', hub: '/tmp/mc-prometheus-30/work', repos: [] } },
}

const hostWith = (...ids: string[]): HostLive => ({ ids: new Set(ids), protocol: HOST_PROTOCOL })

/** A recorded session moved to its project's hub in `CONFIG`, where it can be resumed. */
const homed = (log: SessionLog, cwd = CONFIG.projects[log.header.project].hub): SessionLog => ({ ...log, header: { ...log.header, cwd } })

const cardsOf = (logs: SessionLog[], host = hostWith()) =>
  board(CONFIG, logs.map((log) => ({ header: log.header, facts: factsOf(log) })), host, [], [], [], [], [], new Map(), new Map(), PATHS, 0).floors.flatMap((f) => f.cards)

test('a session card carries its prompt, context and cost', () => {
  const log = fixture('tool-turn')
  const [card] = board(CONFIG, [{ header: log.header, facts: factsOf(log) }], hostWith(), [], [], [], [], [], new Map(), new Map(), PATHS, 0).floors[0].cards
  assert.equal(card.status, 'exited')
  assert.equal(card.conversations.at(-1)!.prompt, 'List the files in src/bridge with ls, then tell me in one sentence what status.ts does.')
  assert.equal(card.context, 22)
  assert.ok(card.costUsd! > 0)
  assert.equal(card.tool, 'Bash ls -la /Users/developer/code/learning/managing-claudes/src/bridge')
})

/** The log up to second `t`, the session still running. */
const until = (log: SessionLog, t: number): SessionLog => ({ ...log, events: log.events.filter((e) => e[0] <= t) })

test('a working card says what Claude told the user between tool calls, until its turn ends', () => {
  const log = fixture('step-answers')
  const live = hostWith(log.header.id)
  const says = (t: number) => cardsOf([until(log, t)], live)[0]
  assert.deepEqual(says(3.3).says, [])
  assert.deepEqual(says(3.4).says, ["Reading the project's package.json to understand the TypeScript setup."])
  assert.deepEqual(says(6.86).says, [
    "Reading the project's package.json to understand the TypeScript setup.",
    "Reading the project's tsconfig.json to find the TypeScript target.",
    'The project uses TypeScript target `es2024`.',
  ])
  assert.deepEqual(speechOf(says(6.86)), [
    "Reading the project's package.json to understand the TypeScript setup.",
    "Reading the project's tsconfig.json to find the TypeScript target.",
    'The project uses TypeScript target es2024.',
  ])
  assert.equal(says(6.9).status, 'done')
  assert.deepEqual(says(6.9).says, [])
})

test('Esc mid-answer ends the turn: what Claude said before it is cleared', () => {
  const log = fixture('interrupt-says')
  const says = (t: number) => cardsOf([until(log, t)], hostWith(log.header.id))[0]
  assert.deepEqual(says(6.19).says, ["I'll read facts.txt to see what inspiration awaits."])
  assert.equal(says(6.194).status, 'idle')
  assert.deepEqual(says(6.194).says, [])
})

test('steps logged without their text say nothing', () => {
  const log = fixture('tool-turn')
  assert.deepEqual(cardsOf([until(log, 18)], hostWith(log.header.id))[0].says, [])
})

test('the latest rate-limit reading of any session stands for the account', () => {
  const sessions = ['api-error', 'interrupts'].map(fixture).map((log) => ({ header: log.header, facts: factsOf(log) }))
  const latest = sessions.map((s) => s.facts.rateLimits!).sort((a, b) => b.at - a.at)[0]
  assert.deepEqual(board(CONFIG, sessions, hostWith(), [], [], [], [], [], new Map(), new Map(), PATHS, 0).rateLimits, latest.limits)
})

test('a session without a logged exit is lost once the host stops running it', () => {
  const log = fixture('interrupts')
  const running = { ...log, events: log.events.filter((e) => e[1] !== 'x') }
  const header = log.header
  assert.equal(board(CONFIG, [{ header, facts: factsOf(running) }], hostWith(header.id), [], [], [], [], [], new Map(), new Map(), PATHS, 0).floors[1].cards[0].status, 'done')
  assert.equal(board(CONFIG, [{ header, facts: factsOf(running) }], hostWith(), [], [], [], [], [], new Map(), new Map(), PATHS, 0).floors[1].cards[0].status, 'lost')
  assert.equal(board(CONFIG, [{ header, facts: factsOf(running) }], undefined, [], [], [], [], [], new Map(), new Map(), PATHS, 0).hostUp, false)
  assert.equal(board(CONFIG, [], { ids: new Set(), protocol: HOST_PROTOCOL - 1 }, [], [], [], [], [], new Map(), new Map(), PATHS, 0).hostOutdated, true)
})

test('a resumed session links to the session whose conversation it continues', () => {
  const [source, resumed] = [fixture('resume-source'), fixture('resumed')]
  const [sourceCard, resumedCard] = [source, resumed].map((log) => cardsOf([source, resumed]).find((c) => c.id === log.header.id)!)
  const [sourceConversation, resumedConversation] = [sourceCard.conversations, resumedCard.conversations].map((conversations) => {
    assert.equal(conversations.length, 1)
    return conversations[0]
  })
  assert.equal(sourceConversation.id, resumedConversation.id)
  assert.deepEqual(sourceConversation.resumedBy, { id: resumed.header.id, callsign: resumedCard.callsign })
  assert.equal(sourceConversation.resumes, undefined)
  assert.deepEqual(resumedConversation.resumes, { id: source.header.id, callsign: sourceCard.callsign })
  assert.equal(resumedConversation.resumedBy, undefined)
  assert.equal(resumedCard.model, 'claude-haiku-4-5-20251001')
  assert.equal(resumedCard.effort, undefined)
})

test('a done session waits on you until someone types to it; moving the mouse over it is not typing', () => {
  const log = fixture('resumed')
  const until = (t: number) => ({ ...log, events: log.events.filter((e) => e[0] <= t) })
  const waiting = (t: number) => cardsOf([until(t)], hostWith(log.header.id))[0].waiting
  assert.equal(waiting(1), false)
  assert.equal(waiting(16.51), true)
  assert.equal(waiting(87.5), true)
  assert.equal(waiting(88.7), false)
})

test('waits: a screen that blocks first, then a question, then an answer, each keyed by its worker and when it began', () => {
  const logs = [until(fixture('resumed'), 20), until(fixture('interrupts'), 140), until(fixture('trust-dialog'), 10)]
  const { waiting } = board(CONFIG, logs.map((log) => ({ header: log.header, facts: factsOf(log) })), hostWith(...logs.map((l) => l.header.id)), [], [], [], [], [], new Map(), new Map(), PATHS, 0)
  assert.deepEqual(waiting, [
    { id: '20261006-215201-f54e', key: '20261006-215201-f54e@1791323522082', reason: 'blocked', since: 1791323522082, detail: 'trust' },
    { id: '20261002-024020-385b', key: '20261002-024020-385b@1790908953237', reason: 'asks', since: 1790908953237, detail: 'Write /Users/developer/mc-deny-probe.txt' },
    { id: '20261003-115149-aee9', key: '20261003-115149-aee9@1791028325519', reason: 'done', since: 1791028325519 },
  ])
  const blocked = cardsOf([logs[2]], hostWith(logs[2].header.id))[0]
  assert.deepEqual([blocked.status, blocked.blocked, blocked.attention, blocked.verbs], ['blocked', 'trust', 'needs', ['drive', 'kill']])
})

test('attention: working at a turn, needs you on a question, ready on an answer, quiet when idle, broken once lost or failed', () => {
  const log = fixture('interrupts')
  const attention = (t: number, live: string[]) =>
    cardsOf([{ ...log, events: log.events.filter((e) => e[0] <= t && e[1] !== 'x') }], hostWith(...live))[0].attention
  const id = [log.header.id]
  assert.equal(attention(110, id), 'quiet')
  assert.equal(attention(131, id), 'working')
  assert.equal(attention(140, id), 'needs')
  assert.equal(attention(140, []), 'broken')
  assert.equal(cardsOf([log])[0].attention, 'quiet')
  const failed = until(fixture('api-error'), 20)
  assert.deepEqual(cardsOf([failed], hostWith(failed.header.id)).map((c) => [c.waiting, c.attention]), [[true, 'broken']])
  const answered = until(fixture('resumed'), 20)
  assert.deepEqual(cardsOf([answered], hostWith(answered.header.id)).map((c) => [c.waiting, c.attention]), [[true, 'ready']])
})

test('a resumed session shows its conversation’s last prompt and answer until it has its own', () => {
  const [source, resumed] = [fixture('resume-source'), fixture('resumed')]
  const until = (t: number) => cardsOf([source, { ...resumed, events: resumed.events.filter((e) => e[0] < t) }]).find((c) => c.id === resumed.header.id)!
  const latest = (t: number) => {
    const { prompt, answer } = until(t).conversations[0]
    return { prompt, answer }
  }
  assert.deepEqual(latest(14), { prompt: '-reply with exactly the word PONG and nothing else', answer: 'PONG' })
  assert.deepEqual(latest(15), { prompt: 'what single word did you answer before? reply with it lowercase', answer: 'PONG' })
  assert.deepEqual(latest(17), { prompt: 'what single word did you answer before? reply with it lowercase', answer: 'pong' })
})

test('a worker reused with /clear holds both conversations, each resumable on its own', () => {
  const [card] = cardsOf([fixture('clear')])
  assert.deepEqual(
    card.conversations.map(({ id, prompt, answer }) => [id, prompt, answer]),
    [
      ['526186c3-7066-4691-9d1c-065cdc2d62a8', 'reply with exactly the word PONG and nothing else', 'PONG'],
      ['8c9fb546-abf3-4905-9965-c35b35401235', 'reply with exactly the word PING and nothing else', 'PING'],
    ],
  )
})

test('sessions that never held a conversation resume nothing', () => {
  const fresh = fixture('api-error')
  const unprompted = (id: string, startedAt: number) => ({ header: { ...fresh.header, id, startedAt }, events: fresh.events.filter((e) => e[0] < 14) })
  const cards = cardsOf([unprompted('first', 1000), unprompted('second', 2000)])
  assert.deepEqual(cards.map((c) => c.conversations), [[], []])
})

test('verbs: a live session is driven and killed, takes a prompt at its composer, and is briefed once Claude saved its conversation', () => {
  const log = homed(fixture('interrupts'))
  const at = (t: number, live: string[]) => cardsOf([{ ...log, events: log.events.filter((e) => e[0] <= t && e[1] !== 'x') }], hostWith(...live))[0]
  const id = [log.header.id]
  assert.deepEqual(at(5, id).verbs, ['drive', 'kill'])
  assert.deepEqual(at(110, id).verbs, ['drive', 'submit', 'kill'])
  assert.deepEqual(at(140, id).verbs, ['drive', 'brief', 'kill'])
  assert.deepEqual(at(140, id).conversations.map((c) => c.verbs), [[]])
  assert.deepEqual(at(140, []).verbs, ['resume', 'brief'])
})

test('verbs: a stopped session resumes its conversation; once resumed, it leads to whoever resumed it', () => {
  const [source, resumed] = [fixture('resume-source'), fixture('resumed')]
  const [sourceCard, resumedCard] = [source, resumed].map((log) => cardsOf([source, resumed]).find((c) => c.id === log.header.id)!)
  assert.deepEqual(sourceCard.verbs, ['goto', 'brief'])
  assert.deepEqual(sourceCard.conversations.map((c) => c.verbs), [['goto']])
  assert.deepEqual(resumedCard.verbs, ['resume', 'brief'])
  assert.deepEqual(cardsOf([homed(fixture('clear'))])[0].conversations.map((c) => c.verbs), [['resume'], ['resume']])
})

test('verbs: what a session left running makes it reapable', () => {
  const log = homed(fixture('tool-turn'))
  const leftover = { pid: 4242, session: log.header.id, command: 'npm run dev', ports: [3000], orphan: true }
  const [card] = board(CONFIG, [{ header: log.header, facts: factsOf(log) }], hostWith(), [leftover], [], [], [], [], new Map(), new Map(), PATHS, 0).floors[0].cards
  assert.deepEqual(card.verbs, ['resume', 'brief', 'reap'])
})

test('a past worker can be resumed only where its floor still has its folder: else it says why, offers no resume and is off duty; a review forks its checkout only while it is there', () => {
  const log = homed(fixture('tool-turn'))
  const tree = { name: 'odin-42', path: '/hub/.worktrees/odin-42', branch: 'tower/odin-42', dirty: 0, unpushed: 0, absorbed: true, risk: [] }
  const reads = (trees: (typeof tree & { present: boolean })[]) => new Map<string, RepoRead>([['/hub', { dir: '/hub', git: true, bases: [], main: { dirty: 0, ahead: 0 }, trees, kept: [] }]])
  const cardAt = (session: SessionLog, repos: Map<string, RepoRead>) =>
    board(CONFIG, [{ header: session.header, facts: factsOf(session) }], hostWith(), [], [], [], [], [], repos, new Map(), PATHS, 0).floors[0].cards[0]
  const inTree = homed(log, tree.path)
  const said = (c: { unresumable?: string; verbs: string[]; conversations: { verbs: string[] }[] }) => [c.unresumable, c.verbs.includes('resume'), c.conversations.map((conv) => conv.verbs)]
  assert.deepEqual(said(cardAt(log, new Map())), [undefined, true, [['resume']]])
  assert.deepEqual(said(cardAt(homed(log, '/moved/hub'), new Map())), ['outside', false, [[]]])
  assert.deepEqual(said(cardAt(inTree, new Map())), [undefined, true, [['resume']]])
  assert.deepEqual(said(cardAt(inTree, reads([{ ...tree, present: true }]))), [undefined, true, [['resume']]])
  assert.deepEqual(said(cardAt(inTree, reads([{ ...tree, present: false }]))), ['gone', false, [[]]])
  assert.deepEqual(said(cardAt(inTree, reads([]))), ['gone', false, [[]]])
  const reviewable = (session: SessionLog, repos: Map<string, RepoRead>) => cardAt(session, repos).verbs.includes('review')
  assert.deepEqual([reviewable(log, reads([])), reviewable(inTree, reads([{ ...tree, present: true }])), reviewable(inTree, reads([{ ...tree, present: false }])), reviewable(inTree, reads([]))], [true, true, false, false])
  const stranded = (cwd: string) => cardsOf([homed({ ...log, events: log.events.filter((e) => e[1] !== 'x') }, cwd)])[0]
  assert.deepEqual([stranded('/hub').onDuty, stranded('/moved/hub').onDuty], [true, false])
  const spanning = { name: 'tower', hub: '/hub', repos: ['/lib'] }
  const both = (libPresent: boolean) =>
    new Map<string, RepoRead>([
      ['/hub', { dir: '/hub', git: true, bases: [], main: { dirty: 0, ahead: 0 }, trees: [{ ...tree, present: true }], kept: [] }],
      ['/lib', { dir: '/lib', git: true, bases: [], main: { dirty: 0, ahead: 0 }, trees: [{ ...tree, path: '/lib/.worktrees/odin-42', present: libPresent }], kept: [] }],
    ])
  const readsOf = (repos: Map<string, RepoRead>) => [...repos.values()]
  assert.deepEqual([unresumableAt(spanning, tree.path, readsOf(both(true))), unresumableAt(spanning, tree.path, readsOf(both(false)))], [undefined, 'gone'])
  const [source, resumed] = [fixture('resume-source'), fixture('resumed')].map((l) => homed(l, '/moved/hub'))
  const moved = cardsOf([source, resumed])
  assert.deepEqual([source, resumed].map((l) => moved.find((c) => c.id === l.header.id)!.unresumable), [undefined, 'outside'])
})

test('calls: each verb that is a request comes ready, a resume naming the conversation it continues', () => {
  const log = homed(fixture('clear'))
  const card = cardsOf([log])[0]
  const [first, latest] = card.conversations.map((c) => c.id)
  assert.deepEqual(card.calls, { resume: ['resume', { id: log.header.id, conversation: latest }] })
  assert.deepEqual(card.conversations.map((c) => c.calls), [
    { resume: ['resume', { id: log.header.id, conversation: first }] },
    { resume: ['resume', { id: log.header.id, conversation: latest }] },
  ])
  const live = cardsOf([{ ...log, events: log.events.filter((e) => e[1] !== 'x') }], hostWith(log.header.id))[0]
  assert.deepEqual(live.calls, { submit: ['submit', { id: log.header.id }], kill: ['kill', { id: log.header.id }] })
  assert.deepEqual(board(CONFIG, [], hostWith(), [], [], [], [], [], new Map(), new Map(), PATHS, 0).floors[0].calls, {
    spawn: ['spawn', { project: 'tower' }],
    shell: ['shell/spawn', { project: 'tower' }],
    editor: ['open', {}],
  })
})

test('verbs: a floor spawns while the host is up and opens shells while the terms daemon is', () => {
  const floorVerbs = (live: HostLive | undefined, shells: [] | undefined) => board(CONFIG, [], live, [], [], shells, [], [], new Map(), new Map(), PATHS, 0).floors[0].verbs
  assert.deepEqual(floorVerbs(hostWith(), []), ['spawn', 'shell', 'editor'])
  assert.deepEqual(floorVerbs(undefined, []), ['shell', 'editor'])
  assert.deepEqual(floorVerbs(hostWith(), undefined), ['spawn', 'editor'])
})

test('collections: a floor holds every project’s collections, then its own, each with only its own items', () => {
  const config: Config = { ...CONFIG, collections: { drafts: { label: 'Drafts' } } }
  config.projects = { ...CONFIG.projects, lab: { ...CONFIG.projects.lab, collections: { notes: { label: 'Notes' } } } }
  const item = (project: string, collection: string, id: string) => ({ project, collection, id, size: 3, modifiedAt: 1000 })
  const items = [item('tower', 'drafts', 'a.md'), item('lab', 'drafts', 'b.md'), item('lab', 'notes', 'c.edn'), item('lab', 'stray', 'd.md')]
  const floors = board(config, [], hostWith(), [], [], [], items, [], new Map(), new Map(), PATHS, 0).floors
  const shape = (id: string) => floors.find((f) => f.id === id)!.collections.map((c) => [c.id, c.label, c.items.map((i) => i.id)])
  assert.deepEqual(shape('tower'), [['drafts', 'Drafts', ['a.md']]])
  assert.deepEqual(shape('lab'), [['drafts', 'Drafts', ['b.md']], ['notes', 'Notes', ['c.edn']]])
  const [notes] = floors.find((f) => f.id === 'lab')!.collections.slice(1)
  assert.deepEqual([notes.dir, notes.items[0].tag], ['/c/lab/notes', tagOf('c.edn')])
})

test('collections: one declared for every project and again for one of them is a config error', () => {
  const config: Config = { ...CONFIG, collections: { drafts: { label: 'Drafts' } } }
  config.projects = { ...CONFIG.projects, lab: { ...CONFIG.projects.lab, collections: { drafts: { label: 'Mine' } } } }
  assert.throws(() => board(config, [], hostWith(), [], [], [], [], [], new Map(), new Map(), PATHS, 0), /projects.lab.collections.drafts in the config: "drafts" is declared under collections for every project already/)
})

test('a card carries what its worker showed, oldest first, a target shown again moved last', () => {
  const log = fixture('shown')
  const shown = (t: number) => cardsOf([until(log, t)])[0].shown.map(({ kind, target, title }) => ({ kind, target, title }))
  const lab = '/private/tmp/mc-sandbox/lab'
  assert.deepEqual(shown(9), [{ kind: 'file', target: `${lab}/report/index.html`, title: 'Bench report' }])
  assert.deepEqual(shown(10), [
    { kind: 'file', target: `${lab}/report/index.html`, title: 'Bench report' },
    { kind: 'url', target: 'https://example.com', title: undefined },
    { kind: 'link', target: 'https://claude.ai/code/artifact/abc', title: 'The artifact' },
    { kind: 'file', target: `${lab}/plan.md`, title: 'Plan, again' },
  ])
  assert.equal(shown(200).at(-1)!.target, `${lab}/findings.md`)
  assert.equal(cardsOf([log])[0].shown[0].at, log.header.startedAt + 8771)
})

test('a resume of the latest conversation continues the worker: its callsign, and what it showed', () => {
  const logs = ['lineage-root', 'lineage-heir', 'lineage-fork'].map(fixture)
  const [root, heir] = logs.map((log) => cardsOf(logs).find((c) => c.id === log.header.id)!)
  const report = { kind: 'file', target: '/tmp/mc-sandbox/lab/reports/lineage.html', title: 'Lineage report', session: root.id }
  assert.equal(heir.callsign, root.callsign)
  assert.deepEqual(root.continuedBy, { id: heir.id, callsign: root.callsign })
  assert.deepEqual(heir.shown.map(({ kind, target, title, session }) => ({ kind, target, title, session })), [report])
  assert.equal(heir.shown[0].at, root.shown[0].at)
  assert.deepEqual(heir.lineage, [{ id: root.id, startedAt: 1791198499292 }, { id: heir.id, startedAt: 1791198520998 }])
  assert.deepEqual(root.lineage, [{ id: root.id, startedAt: 1791198499292 }])
})

test('a resume of an earlier conversation forks a new worker, with nothing shown yet', () => {
  const logs = ['lineage-root', 'lineage-heir', 'lineage-fork'].map(fixture)
  const [root, , fork] = logs.map((log) => cardsOf(logs).find((c) => c.id === log.header.id)!)
  assert.notEqual(fork.callsign, root.callsign)
  assert.deepEqual(fork.shown, [])
  assert.equal(fork.continuedBy, undefined)
})

test('a real Claude resume of its latest conversation keeps the callsign', () => {
  const logs = [fixture('resume-source'), fixture('resumed')]
  const [source, resumed] = logs.map((log) => cardsOf(logs).find((c) => c.id === log.header.id)!)
  assert.equal(resumed.callsign, source.callsign)
  assert.deepEqual(source.continuedBy, { id: resumed.id, callsign: source.callsign })
})

test('a card counts the turns that ran to their Stop: an interrupt or a failure ends none', () => {
  assert.deepEqual(['tool-turn', 'interrupts', 'api-error', 'clear'].map((name) => cardsOf([fixture(name)])[0].turns), [2, 1, 0, 2])
})

test('a worker counts its turns across the sessions it ran as', () => {
  const logs = [fixture('resume-source'), fixture('resumed')]
  const [source, resumed] = logs.map((log) => cardsOf(logs).find((c) => c.id === log.header.id)!)
  assert.equal(source.turns, 1)
  assert.equal(resumed.turns, 2)
})

test('a resume runs under its worker’s callsign when it carries the worker on, under its own on a fork', () => {
  const logs = ['lineage-root', 'lineage-heir'].map(fixture)
  const sessions = logs.map((log) => ({ header: log.header, facts: factsOf(log) }))
  const [root, heir] = sessions
  const [first, latest] = root.facts.conversations.map((c) => c.id)
  const rootName = cardsOf(logs).find((c) => c.id === root.header.id)!.callsign
  assert.equal(resumeName(heir, latest, '20261005-120000-0000', sessions, callsign), rootName)
  assert.equal(resumeName(root, first, '20261005-120000-0000', sessions, callsign), callsign('20261005-120000-0000'))
  assert.notEqual(callsign('20261005-120000-0000'), rootName)
})

test('the config’s callsigns name every worker; a list that can’t name them is a config error', () => {
  const log = fixture('tool-turn')
  const named = (callsigns?: unknown) =>
    board({ ...CONFIG, callsigns } as Config, [{ header: log.header, facts: factsOf(log) }], hostWith(), [], [], [], [], [], new Map(), new Map(), PATHS, 0).floors.flatMap((f) => f.cards)[0].callsign
  assert.equal(callsigns(['ALPHA', 'BRAVO'])('20261005-120000-0000'), 'ALPHA-51')
  assert.equal(callsigns(['ALPHA', 'BRAVO'])('20261008-141236-9772'), 'BRAVO-85')
  assert.equal(named(['ALPHA', 'BRAVO']), callsigns(['ALPHA', 'BRAVO'])(log.header.id))
  assert.equal(named(undefined), callsign(log.header.id))
  assert.throws(() => named([]), /at least one name/)
  assert.throws(() => named(['ALPHA', 'bravo']), /can't call a worker "bravo"/)
  assert.throws(() => named(['ALPHA', 'ALPHA']), /names ALPHA twice/)
})

test('a card says it compacts while Claude compacts, by /compact or inside a turn', () => {
  const at = (name: string, t: number) => {
    const log = fixture(name)
    return cardsOf([until(log, t)], hostWith(log.header.id))[0]
  }
  assert.equal(at('compact-auto', 6.45).compacting, false)
  assert.equal(at('compact-auto', 20).compacting, true)
  assert.equal(gistLine(at('compact-auto', 20)), '≡ compacting the conversation')
  assert.equal(at('compact-auto', 32).compacting, false)
  assert.equal(at('compact-auto', 32).status, 'working')
  assert.equal(at('compact-manual', 10).compacting, true)
  assert.equal(at('compact-manual', 22).compacting, false)
  assert.equal(at('compact-manual', 22).status, 'idle')
})

test('review threads: each checkout’s on its floor, what each worker hasn’t seen, and whether its work has landed', () => {
  const config: Config = { ...CONFIG, collections: { reviews: { label: 'Reviews' } } }
  const log = fixture('tool-turn')
  const me = callsign(log.header.id)
  const message = (author: string, n: number) => ({ author, at: '2026-10-06 15:00', n, anchors: [], body: 'x' })
  const threads = [
    { project: 'tower', id: 'main.md', thread: { checkout: 'main', messages: [message('user', 1), message(me, 2), message('user', 3), message('user', 4)] } },
    { project: 'lab', id: 'odin-42.md', thread: { checkout: 'odin-42', messages: [message('user', 1)] } },
  ]
  const tree = (absorbed: boolean) => ({ name: 'odin-42', path: '/lab/.worktrees/odin-42', branch: 'tower/odin-42', present: true, dirty: 0, unpushed: 1, absorbed, risk: [] })
  const repos = (dirty: number, absorbed: boolean) =>
    new Map<string, RepoRead>([
      ['/hub', { dir: '/hub', git: true, bases: [], main: { dirty, ahead: 0 }, trees: [], kept: [] }],
      ['/lab', { dir: '/lab', git: true, bases: [], main: { dirty: 0, ahead: 0 }, trees: [tree(absorbed)], kept: [] }],
    ])
  const floors = (dirty: number, absorbed: boolean) => board(config, [{ header: log.header, facts: factsOf(log) }], hostWith(), [], [], [], [], threads, repos(dirty, absorbed), new Map(), PATHS, 0).floors
  const [tower, lab] = floors(0, true)
  assert.deepEqual([tower.cards[0].checkout, tower.cards[0].unseen], ['main', 2])
  assert.deepEqual(tower.threads, [{ checkout: 'main', id: 'main.md', tag: tagOf('main.md'), messages: 4, last: { author: 'user', at: '2026-10-06 15:00', n: 4 }, landed: true }])
  assert.deepEqual(lab.threads.map((t) => [t.checkout, t.landed]), [['odin-42', true]])
  assert.ok(lab.verbs.includes('tidy'))
  const [dirtyTower, unmergedLab] = floors(1, false)
  assert.deepEqual([dirtyTower.threads[0].landed, unmergedLab.threads[0].landed], [false, false])
  assert.deepEqual(board(CONFIG, [], hostWith(), [], [], [], [], threads, new Map(), new Map(), PATHS, 0).floors[0].threads, [])
})

test('a watching worker is quiet and waits on nobody; the turn that ends done waits on you', () => {
  const log = fixture('background-shell')
  const at = (t: number) => {
    const running = until(log, t)
    return board(CONFIG, [{ header: log.header, facts: factsOf(running) }], hostWith(log.header.id), [], [], [], [], [], new Map(), new Map(), PATHS, 0)
  }
  const watching = cardsOf([until(log, 40)], hostWith(log.header.id))[0]
  assert.deepEqual([watching.status, watching.waiting, watching.attention, watching.verbs.includes('submit')], ['watching', false, 'quiet', true])
  assert.deepEqual(at(40).waiting, [])
  assert.deepEqual(at(50).waiting.map((w) => w.reason), ['done'])
})

test('a hire’s answer to its hirer’s prompt waits on the hirer while it runs; else, and for a prompt of the user’s, on you', () => {
  const answered = until(fixture('resumed'), 20)
  const prompt = factsOf(answered).conversations.at(-1)!.prompt!
  const hire = { ...answered, header: { ...answered.header, argv: [...answered.header.argv, '--', prompt] } }
  const idle = until(fixture('interrupts'), 110)
  const hirer = { ...idle, events: [...idle.events, [110, 'h', { hook_event_name: 'tower.hire', id: hire.header.id }]] } as SessionLog
  const at = (logs: SessionLog[], live: string[]) => {
    const b = board(CONFIG, logs.map((log) => ({ header: log.header, facts: factsOf(log) })), hostWith(...live), [], [], [], [], [], new Map(), new Map(), PATHS, 0)
    const card = b.floors.flatMap((f) => f.cards).find((c) => c.id === hire.header.id)!
    return { card, waits: b.waiting.map((w) => w.id) }
  }
  const both = [hire.header.id, hirer.header.id]
  const onHirer = at([hire, hirer], both)
  assert.deepEqual([onHirer.card.waiting, onHirer.card.waitsOn, onHirer.card.attention, onHirer.waits], [false, { id: hirer.header.id, callsign: callsign(hirer.header.id) }, 'ready', []])
  const hirerGone = at([hire, hirer], [hire.header.id])
  assert.deepEqual([hirerGone.card.waiting, hirerGone.card.waitsOn, hirerGone.waits], [true, undefined, [hire.header.id]])
  const usersPrompt = at([answered, { ...hirer, events: [...idle.events, [110, 'h', { hook_event_name: 'tower.hire', id: answered.header.id }]] } as SessionLog], both)
  assert.deepEqual([usersPrompt.card.waiting, usersPrompt.card.attention, usersPrompt.waits], [true, 'ready', [hire.header.id]])
})
