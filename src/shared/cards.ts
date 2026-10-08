import type { Attention, Board, Card, Floor, TidyPlan, Unresumable, Wait } from '../bridge/board.ts'
import type { BlockedKind } from '../bridge/blocked.ts'
import type { Status } from '../bridge/status.ts'
import type { FloorWorktree, WorktreeState } from '../bridge/worktrees.ts'
import type { Call, Replies, Verbs } from './api.ts'
import { CLAUDE_UNTESTED } from './claude.ts'
import { shelfItem, type Renderer, type ShelfEntry } from './model.ts'

/**
 * Cards in words: what every renderer says about a worker, so they all say the same. Each draws the words its own
 * way. The tower serves this module as `/cards.js`; nothing in the core imports it.
 */

/** The fact a status word states; its colour is the card's attention. */
export const STATUS_NAME: Record<Status, string> = {
  booting: 'booting', blocked: 'blocked', idle: 'idle', working: 'working', needs_input: 'needs you', watching: 'watching', done: 'done', failed: 'failed', exited: 'exited', lost: 'lost',
}

/** A worker's attention in a word, as a count of workers or a legend names it. */
export const ATTENTION_NAME: Record<Attention, string> = { needs: 'needs you', ready: 'ready', working: 'working', quiet: 'quiet', broken: 'broken' }

/** What puts a worker in each attention (`attentionOf`, src/bridge/board.ts), for a count's tooltip and a legend. */
export const ATTENTION_MEANS: Record<Attention, string> = {
  needs: "held by one of Claude's screens (workspace trust, sign-in) or asking permission for a tool: it goes on only once you answer",
  ready: 'its turn ended with an answer nobody has read: nothing it started can wake it, and nobody has typed to it since. Typing to it reads it. An answer for the worker that hired it reads ready too, and waits on that worker',
  working: 'booting, or in a turn: thinking, running tools or compacting',
  quiet: 'nothing for you: at its prompt, its answer read, watching (a background task or a /loop it started will wake it, and its lamp breathes), exited, or stopped with the host and resumable',
  broken: 'its last turn failed (an API error or a refusal), or it was lost: the host no longer runs it and it never logged an exit',
}

/** The count of waits on the board that are yours, by `heededWaits`. */
export const WAITING_NAME = 'waiting on you'
export const WAITING_MEANS = 'workers whose next step is yours: a screen or a question to answer, or an answer or a failure nobody has typed to since. An answer for the worker that hired it waits on that worker, and a wait you dismissed is out of the count. N goes to the next one'

/** Counts of workers by attention are over the workers on duty (`Card.onDuty`). */
export const ON_DUTY_MEANS = 'counted over the workers on duty: running, or stopped and resumable'

/** A legend of the counts by status, as two cells a row (a chip, then its meaning) for a grid of two columns. */
export const statusLegendHtml = () =>
  `<span class="chip">${WAITING_NAME}</span><span>${esc(WAITING_MEANS)}</span>` +
  (['needs', 'ready', 'working', 'quiet', 'broken'] as Attention[])
    .map((a) => `<span class="chip ${a}"><span class="lamp"></span>${ATTENTION_NAME[a]}</span><span>${esc(ATTENTION_MEANS[a])}</span>`).join('')

/**
 * The classes a worker's lamp, pill or row takes: its attention, and `watching` while something it started can wake it,
 * a quiet lamp that breathes.
 */
export const lampOf = (c: Card) => (c.status === 'watching' ? `${c.attention} watching` : c.attention)

/** What a stuck worker's status says on hover. */
export const STUCK_TITLE = 'working with no word from Claude for 20 minutes: a hung tool, or a long build'

/** Why a past worker can't be resumed, in a word or two: history, said quietly. */
export const UNRESUMABLE_NAME: Record<Unresumable, string> = { outside: 'outside the floor', gone: 'folder gone' }

/** The same, on hover. */
export const UNRESUMABLE_TITLE: Record<Unresumable, string> = {
  outside: "can't be resumed: its folder is no longer one of its floor's directories",
  gone: "can't be resumed: its worktree's folder is gone",
}

export const statusName = (c: Card) =>
  c.stranded ? (c.unresumable ? `stopped, ${UNRESUMABLE_NAME[c.unresumable]}` : 'stopped, resumable') : c.waitsOn ? `waiting on ${c.waitsOn.callsign}` : c.stuck ? 'stuck' : STATUS_NAME[c.status]

/** A status as one glyph over a worker: a question (a screen's, too), a failure, an outcome nobody has looked at, or a doze; none while at work or stranded. */
export const bubbleOf = (c: Card) => (c.stranded ? '' : c.status === 'needs_input' || c.status === 'blocked' ? '?' : c.waiting && c.status === 'failed' ? '×' : c.waiting ? '!' : c.status === 'idle' ? 'z' : '')

/** The conversation a resume continues: the latest one Claude saved. */
export const current = (c: Card) => c.conversations.at(-1)

/** Whether a card, conversation or floor offers a verb right now: the board decides, renderers only draw. */
export const can = <V extends string>(thing: { verbs: V[] }, verb: V) => thing.verbs.includes(verb)

export const cardsOf = (board: Board) => board.floors.flatMap((f) => f.cards)
export const findCard = (board: Board, id: string) => cardsOf(board).find((c) => c.id === id)
/** What a floor's workers left running, each process with its worker: the oldest worker first, then by pid. */
export const leftoversOf = (f: Floor) =>
  [...f.cards].sort((a, b) => a.startedAt - b.startedAt).flatMap((card) => [...card.resources].sort((a, b) => a.pid - b.pid).map((resource) => ({ card, resource })))

/** A command line with its program by name alone: `/opt/x/bin/node server.js` → `node server.js`. */
export const commandName = (command: string) => command.replace(/^\S*\//, '')

const counted = (n: number, one: string, many: string) => (n ? [`${n} ${n === 1 ? one : many}`] : [])

/** A floor's Tidy in a line, before the press: `Tidy: 4 leftovers, 2 finished hires`. */
export const tidyLine = ({ worktrees, branches, threads, prune, logs }: TidyPlan) => {
  const parts = [
    ...counted(prune.filter((p) => p.t === 'reap').length, 'leftover', 'leftovers'),
    ...counted(prune.filter((p) => p.t === 'kill').length, 'finished hire', 'finished hires'),
    ...counted(worktrees.length, 'worktree', 'worktrees'),
    ...counted(branches.length, 'merged branch', 'merged branches'),
    ...counted(threads.length, 'landed thread', 'landed threads'),
    ...counted(logs.length, 'old log', 'old logs'),
  ]
  return parts.length ? `Tidy: ${parts.join(', ')}` : 'nothing to tidy'
}

export const KILL_COST = 'resumable, but its next turn reads the whole conversation again, uncached'

/**
 * Each thing a floor's Tidy would do, as a row: what it is, what happens to it, and the call that does only that, the
 * floor's plan cut down to this row (`POST /tidy` applies any part of the plan as listed).
 */
export type TidyRow = { what: string; does: string; title: string; call: Call<'tidy'> }

const NOTHING: TidyPlan = { worktrees: [], branches: [], threads: [], prune: [], logs: [] }

export const tidyRows = (f: Floor, now: number): TidyRow[] => {
  const card = (id: string) => f.cards.find((c) => c.id === id)!
  const only = (part: Partial<TidyPlan>): Call<'tidy'> => ['tidy', { project: f.id, plan: { ...NOTHING, ...part } }]
  return [
    ...f.tidy.prune.map((p): TidyRow => {
      const c = card(p.id)
      const call = only({ prune: [p] })
      if (p.t === 'kill')
        return { what: c.callsign, does: `kill · landed, ${c.waiting || c.waitsOn ? 'answer unread, ' : ''}${STATUS_NAME[c.status]} ${span(now - p.since)}`, title: `${c.callsign}, hired by ${c.hiredBy!.callsign}: its work has landed and it has sat ${STATUS_NAME[c.status]} for ${span(now - p.since)}. Killed, ${KILL_COST}`, call }
      const r = c.resources.find((r) => r.pid === p.pid)!
      return { what: `${p.pid} ${commandName(r.command)}`, does: `reap · ${c.callsign}`, title: `${r.command}\nleft running by ${c.callsign}, ${STATUS_NAME[c.status]}${r.orphan ? '; orphaned' : ''}`, call }
    }),
    ...f.tidy.worktrees.map((name) => ({ what: `⎇ ${name}`, does: 'remove worktree', title: 'nothing would be lost: clean, and its branch is pushed or absorbed', call: only({ worktrees: [name] }) })),
    ...f.tidy.branches.map((name) => ({ what: `⎇ ${name}`, does: 'delete merged branch', title: 'absorbed into its base', call: only({ branches: [name] }) })),
    ...f.tidy.threads.map((checkout) => ({ what: `◇ ${checkout}`, does: 'file landed thread', title: `its work has landed: filed as ${checkout}@<time>.md`, call: only({ threads: [checkout] }) })),
    ...(f.tidy.logs.length ? [{ ...oldLogsRow(f.tidy.logs), call: only({ logs: f.tidy.logs }) }] : []),
  ]
}

/** The logs Tidy would archive, in one row: a floor can hold hundreds. */
const oldLogsRow = (logs: TidyPlan['logs']): Omit<TidyRow, 'call'> => {
  const n = `${logs.length} old ${logs.length === 1 ? 'log' : 'logs'}`
  return {
    what: `▤ ${n}`,
    does: `archive · ${sizeOf(logs.reduce((sum, l) => sum + l.bytes, 0))}`,
    title: `${n} of workers that ended more than retention.days ago, gzipped in place: cards, briefs, screens and stats read the same`,
  }
}

/** A size in bytes as `340 MB`, a tenth under ten, kilobytes under one. */
export const sizeOf = (bytes: number) => {
  if (bytes < 1_000_000) return `${Math.ceil(bytes / 1000)} kB`
  const mb = bytes / 1_000_000
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/** What Tidy did, in a line. */
export const tidiedLine = (r: Replies['tidy']) => {
  const done = [
    ...counted(r.reaped.length, 'process reaped', 'processes reaped'),
    ...counted(r.killed.length, 'hire killed', 'hires killed'),
    ...r.removed,
    ...r.deleted,
    ...r.threads.map((t) => `thread ${t}`),
    ...counted(r.archived.length, 'log archived', 'logs archived'),
  ]
  const line = done.length ? `tidied: ${done.join(', ')}` : 'nothing to tidy'
  return r.skipped.length ? `${line}; skipped ${r.skipped.join('; ')}` : line
}

/** A floor's past workers, the newest first: those the board carries, and its archive as read (`tower.archive`). */
export const pastOf = (f: Floor, archive: Card[]) => [...f.cards.filter((c) => !c.onDuty), ...archive].sort((a, b) => b.startedAt - a.startedAt)

/** How many past workers a floor has, its archive's among them, before the archive is read. */
export const pastCount = (f: Floor) => f.cards.filter((c) => !c.onDuty).length + f.archived

/** What a renderer holding a floor's archive watches: the archive moved when this did. */
export const archiveKey = (board: Board, f: Floor) => `${board.archiveAt}/${f.archived}`

/** A filter's words, lower-cased. */
export const wordsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean)

/** Whether every word is in a worker's callsign or in one of its conversations' prompt and answer. */
export const matchesWords = (c: Card, words: string[]) => {
  const text = [c.callsign, ...c.conversations.flatMap((conv) => [conv.prompt, conv.answer])].filter(Boolean).join('\n').toLowerCase()
  return words.every((w) => text.includes(w))
}

/** How many worktrees a floor holds that would lose work if removed, or whose folder is gone. */
export const risky = (f: Floor) => f.worktrees.filter((w) => w.state === 'at-risk' || w.state === 'lost').length

/** Who waits on you, in the order to go to them. */
export const waitingCards = (board: Board) => board.waiting.map((w) => findCard(board, w.id)!)

const LOUDNESS: Attention[] = ['needs', 'broken', 'ready', 'working', 'quiet']

/** What a count of workers is coloured by: the loudest of their attentions, in the order waits are gone to; none of none. */
export const loudest = (cards: Card[]) => LOUDNESS.find((a) => cards.some((c) => c.attention === a))

/** The workers that report to a worker: its hires and its reviewers, by start. */
export const hiresOf = (cards: Card[], c: Card) => cards.filter((h) => h.reportsTo === c.id).sort((a, b) => a.startedAt - b.startedAt)

/** Everyone under a worker, each before those under it. */
export const crewOf = (cards: Card[], c: Card): Card[] => hiresOf(cards, c).flatMap((h) => [h, ...crewOf(cards, h)])

/** A worker gone home from a crew: off duty, and nobody under it on duty, so drawing it holds no one up. */
export const goneHome = (cards: Card[], c: Card) => !c.onDuty && !crewOf(cards, c).some((h) => h.onDuty)

/**
 * A worker's hires as a crew draws them: `drawn`, the ones not gone home, each with its own crew under it; `home`, the
 * ones gone home, folded to one line; and `folded`, everyone that line holds, those under them included.
 */
export const crewFold = (cards: Card[], c: Card) => {
  const hires = hiresOf(cards, c)
  const home = hires.filter((h) => goneHome(cards, h))
  return { drawn: hires.filter((h) => !goneHome(cards, h)), home, folded: home.length + home.flatMap((h) => crewOf(cards, h)).length }
}

export const goneHomeLine = (folded: number) => `${folded} gone home`

/** The hirers whose gone-home crew a viewer unfolded, by card id, kept in `tower.store` for every renderer of theirs. */
export const CREWS_UNFOLDED_KEY = 'crews.unfolded'

const reportsUpToDuty = (cards: Card[], c: Card): boolean => {
  const up = c.reportsTo === undefined ? undefined : cards.find((h) => h.id === c.reportsTo)
  return up !== undefined && (up.onDuty || reportsUpToDuty(cards, up))
}

/**
 * A floor's crews as a renderer lists them, by start: each worker on duty that reports to nobody on duty, however high,
 * heads one, and everyone under it follows at its depth, on duty or not.
 */
export const crewTree = (cards: Card[]): { card: Card; depth: number }[] => {
  const under = (c: Card, depth: number): { card: Card; depth: number }[] => [{ card: c, depth }, ...hiresOf(cards, c).flatMap((h) => under(h, depth + 1))]
  return cards
    .filter((c) => c.onDuty && !reportsUpToDuty(cards, c))
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap((c) => under(c, 0))
}

/** A worker's current card by callsign: one on duty wins over past ones, and past ones by the latest start. */
export const workerNamed = (cards: Card[], name: string): Card | undefined => {
  const named = cards.filter((c) => c.callsign === name.toUpperCase())
  return named.find((c) => c.onDuty) ?? named.sort((a, b) => b.id.localeCompare(a.id))[0]
}

/** Workers on duty in the order every renderer steps through them: the top floor first, each floor's crews in order (`crewTree`). */
export const dutyOrder = (board: Board) =>
  [...board.floors].reverse().flatMap((f) => crewTree(f.cards).map(({ card }) => card).filter((c) => c.onDuty))

/** The card `by` steps away from `id` in `order`, wrapping round; from outside the order, the first forward and the last back. */
export const stepFrom = (order: Card[], id: string | undefined, by: 1 | -1): Card | undefined => {
  const at = order.findIndex((c) => c.id === id)
  if (at === -1) return by > 0 ? order[0] : order.at(-1)
  return order[(at + by + order.length) % order.length]
}

/**
 * Where each way of moving between workers goes from `id`; `waiting` (`nextWait` over the waits `heed` leaves) is unset
 * when nobody else waits.
 */
export const neighbours = (board: Board, id: string | undefined, heed: Heed) => {
  const to = nextWait(heededWaits(board, heed), heed.visited, id).to
  return { prev: stepFrom(dutyOrder(board), id, -1), next: stepFrom(dutyOrder(board), id, 1), waiting: to && findCard(board, to.id) }
}
export type Move = keyof ReturnType<typeof neighbours>

/**
 * The keys that move between workers, the same in every renderer and inside a terminal, by `KeyboardEvent.code`:
 * Option with ↑ ↓ along the duty order, with J to the next one waiting. Command chords belong to the browser.
 */
export const MOVE_KEYS: Record<Move, { code: string; label: string }> = {
  prev: { code: 'ArrowUp', label: '⌥↑' }, next: { code: 'ArrowDown', label: '⌥↓' }, waiting: { code: 'KeyJ', label: '⌥J' },
}
export const moveOfKey = (e: { code: string; altKey: boolean; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): Move | undefined =>
  e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey ? (Object.keys(MOVE_KEYS) as Move[]).find((m) => MOVE_KEYS[m].code === e.code) : undefined

/**
 * What one viewer did about the waits on the board, keyed by `Wait.key`: `dismissed`, out of their way until the
 * worker's next wait (kept in `tower.store` under `DISMISSED_KEY`, so every renderer of theirs agrees), and `visited`,
 * gone to in this round of `nextWait` (kept by each renderer).
 */
export type Heed = { dismissed: ReadonlySet<string>; visited: ReadonlySet<string> }

export const DISMISSED_KEY = 'waits.dismissed'

/** The waits a viewer hasn't dismissed, in the board's order. */
export const heededWaits = (board: Board, heed: Pick<Heed, 'dismissed'>) => board.waiting.filter((w) => !heed.dismissed.has(w.key))

/** The dismissed keys to store once `key` is dismissed too: those of waits that are over drop out. */
export const dismissing = (board: Board, dismissed: ReadonlySet<string>, key: string) =>
  board.waiting.map((w) => w.key).filter((k) => k === key || dismissed.has(k))

/**
 * The waits that began and the waits that ended between two boards. On the first board a renderer sees nothing begins
 * or ends: what already waited when it opened is not news.
 */
export const transitions = (prev: Board | undefined, next: Board): { began: Wait[]; ended: Wait[] } => {
  if (!prev) return { began: [], ended: [] }
  const before = new Set(prev.waiting.map((w) => w.key))
  const after = new Set(next.waiting.map((w) => w.key))
  return { began: next.waiting.filter((w) => !before.has(w.key)), ended: prev.waiting.filter((w) => !after.has(w.key)) }
}

/**
 * The next wait to go to from the worker `here`, round-robin: the first in `waits` that isn't `here`'s and wasn't
 * visited this round, and the visited keys to keep once there. `here`'s own wait counts as visited. When every other
 * wait was visited, a new round starts at the first.
 */
export const nextWait = (waits: Wait[], visited: ReadonlySet<string>, here: string | undefined): { to?: Wait; visited: Set<string> } => {
  const at = waits.filter((w) => w.id === here).map((w) => w.key)
  const seen = new Set([...at, ...waits.map((w) => w.key).filter((k) => visited.has(k))])
  const others = waits.filter((w) => w.id !== here)
  const fresh = others.find((w) => !seen.has(w.key))
  const to = fresh ?? others[0]
  if (!to) return { visited: seen }
  return { to, visited: new Set([...(fresh ? seen : []), to.key]) }
}

/** How often a viewer wants a wait rung: once as it begins, again every `REMIND_MS` while it waits unwatched, or never. */
export type Ring = 'once' | 'remind' | 'off'
export const RINGS: Ring[] = ['once', 'remind', 'off']
export const RING_KEY = 'waits.ring'
export const REMIND_MS = 30_000
/** @deprecated The settings popover names each ring: `RING_LABEL` and `RING_MEANS` of /settings.js. */
export const RING_NAME: Record<Ring, string> = { once: 'ring once', remind: 'remind every 30s', off: 'silent' }
/** @deprecated Rings are set in the settings popover, behind the shared `ICON.settings`: `soundSection` of /settings.js. */
export const RING_MARK: Record<Ring, string> = { once: '🔔', remind: '🔔↻', off: '🔕' }

export const DISMISS_TITLE = 'dismiss this wait: out of your way until the worker waits again'

/** A question to answer (a screen, a tool, a failure to look at) rings apart from an answer to read. */
export type Sound = 'question' | 'done'
export const soundOf = (w: Wait): Sound => (w.reason === 'done' ? 'done' : 'question')

/** Each sound as a score every renderer plays its own way: notes in Hz, one after another `step` seconds apart. */
export const SOUNDS: Record<Sound, { notes: number[]; wave: 'sine' | 'triangle'; step: number }> = {
  question: { notes: [880, 1174.66, 880, 1174.66], wave: 'triangle', step: 0.11 },
  done: { notes: [659.25, 987.77], wave: 'sine', step: 0.14 },
}

/** The wait to ring for among `waits`: the first one not of the worker being watched. */
export const ringing = (waits: Wait[], watched: string | undefined) => waits.find((w) => w.id !== watched)

/**
 * One line of what a worker is up to: the tool it asks for, its compaction, the tool it runs, the prompt it works on,
 * else Claude's latest answer, else the prompt it was given.
 */
export type Gist = { kind: 'blocked' | 'asks' | 'compacts' | 'runs' | 'answer' | 'prompt'; text: string }

/** What a screen that blocks a worker asks of you. */
export const BLOCKED_TEXT: Record<BlockedKind, string> = {
  trust: 'Claude asks whether to trust this folder: answer on its screen',
  login: 'Claude needs signing in on this machine: answer on its screen',
}

export function gistOf(c: Card): Gist | undefined {
  const conv = current(c)
  if (c.blocked) return { kind: 'blocked', text: BLOCKED_TEXT[c.blocked] }
  if (c.status === 'needs_input' && c.tool) return { kind: 'asks', text: c.tool }
  if (c.compacting) return { kind: 'compacts', text: 'compacting the conversation' }
  if (c.status === 'working' && c.tool) return { kind: 'runs', text: c.tool }
  if (c.status !== 'working' && conv?.answer) return { kind: 'answer', text: plain(conv.answer) }
  return conv?.prompt ? { kind: 'prompt', text: conv.prompt } : undefined
}

/** What a worker says over its head while it works: once the turn ends, its gist speaks. */
export const speechOf = (c: Card): string[] => (c.status === 'working' ? c.says.map(plain) : [])

export const GIST_MARK: Record<Gist['kind'], string> = { blocked: '⚠', asks: '⚠', compacts: '≡', runs: '⚙', answer: '↳', prompt: '❯' }

/** The gist as plain text, its mark first; `''` for a worker with nothing to say yet. */
export const gistLine = (c: Card) => {
  const gist = gistOf(c)
  return gist ? `${GIST_MARK[gist.kind]} ${gist.text}` : ''
}

/** Markdown on one line: emphasis and code marks only get in the way. */
export const plain = (text: string) => text.replace(/\*\*|`/g, '')
/** `claude-haiku-4-5-20251001` → `haiku 4.5` */
export const modelName = (m?: string) => m?.replace(/^claude-([a-z]+)-(\d+)-(\d+).*$/, '$1 $2.$3') ?? ''
export const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export const ago = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d`
}

type RateLimit = Board['rateLimits'][number]

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const WEEK = 7 * DAY

/** A rate-limit reading refreshes only while some session runs a turn: past this age it may have moved. */
/** Why the board says `hostOutdated`, and what ends it. */
export const HOST_OUTDATED = 'the running host is older than the tower: it updates when restarted (tower down, then tower up), which ends every session and shell'

/** The host as the board reads it: answering, answering with older code than the tower's, or not answering. */
export type HostState = 'up' | 'outdated' | 'down'
export const hostState = (b: Pick<Board, 'hostUp' | 'hostOutdated'>): HostState => (!b.hostUp ? 'down' : b.hostOutdated ? 'outdated' : 'up')
/** How loudly the host's state asks for you, in the attention colours: an outdated host wants a restart some time, a host down now. */
export const HOST_ATTENTION: Record<HostState, Attention> = { up: 'quiet', outdated: 'working', down: 'broken' }
export const HOST_NAME: Record<HostState, string> = { up: 'host up', outdated: 'host outdated', down: 'host down' }
export const HOST_MEANS: Record<HostState, string> = {
  up: "host up: the process that holds every session's terminal answers",
  outdated: `host outdated: ${HOST_OUTDATED}`,
  down: "host down: nothing holds the sessions' terminals. Running sessions read lost (each stays resumable), and nothing can start, resume or take keys until it runs again: tower up",
}

export { CLAUDE_UNTESTED }

/** What the board's `claudeUntested` says once for every worker: `undefined` while every live worker runs a tested Claude. */
export const claudeUntestedLine = (board: Pick<Board, 'claudeUntested'>) =>
  board.claudeUntested.length ? `claude ${board.claudeUntested.join(', ')} untested` : undefined

/** That line with its reason on hover. It can run long (several releases, a build suffix): it takes a line of its own. */
export const claudeUntestedHtml = (board: Pick<Board, 'claudeUntested'>) => {
  const line = claudeUntestedLine(board)
  return line && `<span class="untested" title="${CLAUDE_UNTESTED}">${esc(line)}</span>`
}

/** Where a declared renderer is served. */
export const rendererUrl = (name: string) => `/r/${encodeURIComponent(name)}/`

/** How a shelf entry is drawn and opened: an `item` entry is read as markdown when it is one, framed as a page otherwise. */
export const shelfKind = (entry: ShelfEntry): 'html' | 'md' | 'url' | 'link' | 'renderer' => {
  if ('item' in entry) return entry.item.endsWith('.md') ? 'md' : 'html'
  if ('html' in entry) return 'html'
  if ('md' in entry) return 'md'
  if ('url' in entry) return 'url'
  if ('link' in entry) return 'link'
  return 'renderer'
}

/** The page an `html` or `item` entry frames, as its `/shelf/<project>/<n>/<file>` names it. */
export const shelfPage = (entry: ShelfEntry): string => ('item' in entry ? shelfItem(entry).id : 'html' in entry ? entry.html : '')

/** Where an entry's content comes from, as the config names it: a path, a glob, a URL, a renderer's or an item's. */
export const shelfSource = (entry: ShelfEntry): string =>
  'html' in entry ? entry.html
  : 'md' in entry ? entry.md
  : 'url' in entry ? entry.url
  : 'link' in entry ? entry.link
  : 'item' in entry ? entry.item
  : rendererUrl(entry.renderer)

/**
 * The way to the declared renderers: this one named, a built one a link, one not built named with why. Framed on a
 * shelf, the frame can't navigate the tower page, so a link opens a tab of its own.
 */
export const renderersHtml = (renderers: Renderer[], here: string | undefined, framed: boolean) => {
  const target = framed ? ' target="_blank" rel="noopener"' : ''
  return `<span>renderers</span>${renderers.map((r) =>
    r.name === here ? `<b>${esc(r.name)}</b>`
    : r.available ? `<a href="${esc(rendererUrl(r.name))}"${target} title="open ${esc(r.name)}">${esc(r.name)}</a>`
    : `<span title="not built: ${esc(r.root)}/${esc(r.entry)} doesn't exist">${esc(r.name)}</span>`).join('')}`
}

/** A worker's own flag beside its stats: `undefined` while its Claude is tested or unknown. */
export const claudeFlagHtml = (c: Pick<Card, 'claude' | 'claudeUntested'>) =>
  c.claudeUntested ? `<span class="untested" title="${CLAUDE_UNTESTED}">claude ${esc(c.claude!)} untested</span>` : undefined

export const LIMITS_STALE_MS = 15 * MINUTE

/** A span to the minute: `<1m`, `40m`, `1h 12m`, `3d`. */
export const span = (ms: number) => {
  const m = Math.floor(Math.max(0, ms) / MINUTE)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  if (m < 24 * 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.floor(m / (24 * 60))}d`
}

/** A moment on the wall clock: `22:00` today, `Sun 22:00` another day. */
export const clockAt = (at: number, now: number) => {
  const time = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return new Date(at).toDateString() === new Date(now).toDateString() ? time : `${new Date(at).toLocaleDateString([], { weekday: 'short' })} ${time}`
}

/** When a limit resets: `in 1h 12m` within a day, `Sun 22:00` further off; undefined once it has passed. */
export const resetWhen = (resetsAt: string, now: number) => {
  const left = Date.parse(resetsAt) - now
  return left <= 0 ? undefined : left < DAY ? `in ${span(left)}` : clockAt(Date.parse(resetsAt), now)
}

/** `resets in 1h 12m`, `resets Sun 22:00`, or `reset since` the reading. */
export const resetLine = (resetsAt: string, now: number) => {
  const when = resetWhen(resetsAt, now)
  return when ? `resets ${when}` : 'reset since'
}

/**
 * How much of a weekly limit's window has passed, in percent: spending at an even pace, `percentUsed` would sit
 * here. Undefined for the other windows and for a limit with no known reset.
 */
export const weekElapsed = (r: RateLimit, now: number) =>
  r.kind.startsWith('seven_day') && r.resetsAt ? Math.min(100, Math.max(0, 100 - ((Date.parse(r.resetsAt) - now) / WEEK) * 100)) : undefined

/** A limit's pace in words: `61% of the week gone, 34 points under pace`. */
export const paceLine = (percentUsed: number, elapsed: number) => {
  const gap = Math.round(elapsed - percentUsed)
  return `${Math.round(elapsed)}% of the week gone, ${gap >= 0 ? `${gap} points under pace` : `${-gap} points over pace`}`
}

/** What a worker showed, named: its own title, else the file's name or the page's host. */
export const shownTitle = (s: Card['shown'][number]) => s.title ?? (s.kind === 'file' ? base(s.target) : new URL(s.target).host)

/** The branch a worker works on, `⎇ tower/hugin-02`; `''` in a main checkout. */
export const branchLine = (c: Card) => (c.worktree ? `⎇ ${c.worktree.branch ?? `${c.worktree.name}, detached`}` : '')

/** How a worker's work stands to others': whose it reviews, else the checkout its worktree was forked from; and who hired it, when that isn't whose work it reviews. */
export const pairLine = (c: Card) =>
  [c.reviews ? `reviews ${c.reviews}` : c.worktree?.from ? `fork of ${c.worktree.from}` : '', c.hiredBy && c.hiredBy.callsign !== c.reviews ? `hired by ${c.hiredBy.callsign}` : '']
    .filter(Boolean)
    .join(' · ')

/** The checkout whose review thread is about a worker's work: a reviewer writes on its author's, any other worker on its own. */
export const threadCheckoutOf = (c: Pick<Card, 'reviews' | 'worktree' | 'checkout'>) => (c.reviews && c.worktree?.from) || c.checkout

/** The worker a checkout's thread opens on: the one on duty there, else the latest to have worked there. */
export const workerIn = (f: Floor, checkout: string) => {
  const here = f.cards.filter((c) => c.checkout === checkout)
  return here.find((c) => c.onDuty) ?? here.toSorted((a, b) => b.startedAt - a.startedAt)[0]
}

/**
 * Who a checkout's review notes can be sent to: the workers at their composer in that checkout, the most recently
 * active first, then the floor's other workers by start. Send reaches the first one in the checkout unless the viewer
 * picks another.
 */
export const sendTargets = (f: Floor, checkout: string) => {
  const ready = f.cards.filter((c) => can(c, 'submit'))
  return [
    ...ready.filter((c) => c.checkout === checkout).sort((a, b) => b.enteredAt - a.enteredAt),
    ...ready.filter((c) => c.checkout !== checkout).sort((a, b) => a.startedAt - b.startedAt),
  ]
}

/** How many hires deep a worker stands: its hirer's depth and one; a worker nobody hired stands at 0. */
export const hireDepth = (cards: Card[], c: Card): number => {
  const hirer = c.hiredBy && cards.find((h) => h.id === c.hiredBy!.session)
  return hirer ? hireDepth(cards, hirer) + 1 : 0
}

/** A worker's hires that run now, reviewers aside, across the sessions it ran as. */
export const liveHires = (cards: Card[], c: Card) => cards.filter((h) => h.live && !h.reviews && h.hiredBy?.callsign === c.callsign)

/** Why a worker may not hire now under its floor's `hiring`, as a sentence; `undefined` when it may. A review is never refused. */
export const hireRefusal = (cards: Card[], f: Floor, c: Card): string | undefined => {
  const depth = hireDepth(cards, c)
  if (depth + 1 > f.hiring.depth) return `${c.callsign} stands ${depth} hire${depth === 1 ? '' : 's'} deep, and ${f.name} lets hires stand at most ${f.hiring.depth} deep`
  const live = liveHires(cards, c)
  if (live.length >= f.hiring.live) return `${c.callsign}'s hires ${live.map((h) => h.callsign).join(', ')} still run, and ${f.name} lets a worker run ${f.hiring.live} at once`
  return undefined
}

/** Where a worker works, short: its floor, then its branch in a worktree or its folder off the hub, and whose work it reviews. */
export const whereLine = (c: Card, f: Floor | undefined) =>
  [f?.name ?? c.project, c.worktree ? branchLine(c) : c.cwd === f?.hub ? '' : base(c.cwd), pairLine(c)].filter(Boolean).join(' · ')

/** What a worker's header keeps out of sight until asked, as label and value: only what is known. */
export const detailsOf = (c: Card): [string, string][] =>
  ([
    ['model', [modelName(c.model), c.effort].filter(Boolean).join(' · ')],
    ['claude', c.claude ? `${c.claude}${c.claudeUntested ? ' · untested' : ''}` : ''],
    ['context', c.context !== undefined ? `${c.context}% of the window` : ''],
    ['cost', c.costUsd != null ? `$${c.costUsd.toFixed(2)}` : ''],
    ['subagents', c.subagents ? String(c.subagents) : ''],
    ['folder', c.cwd],
    ['resume', c.unresumable ? UNRESUMABLE_TITLE[c.unresumable] : ''],
    ['worktree', c.worktree ? `${c.worktree.name} ${branchLine(c)}` : ''],
    ['conversations', c.conversations.length > 1 ? String(c.conversations.length) : ''],
    ['left running', c.resources.map((r) => `${r.pid}${r.ports.map((p) => ` :${p}`).join('')}${r.orphan ? ' orphan' : ''} · ${commandName(r.command)}`).join('\n')],
  ] as [string, string][]).filter(([, value]) => value)

export const WORKTREE_STATE_NAME: Record<WorktreeState, string> = { live: 'in use', lost: 'folder gone', 'at-risk': 'unsaved work', removable: 'removable' }

/** The verbs on worktrees and kept branches, as buttons say them. */
export const WORKTREE_VERB_NAME = { recut: 'recut', prune: 'forget', remove: 'remove', delete: 'delete' } as const

/** The branch of a worktree, as its hub repo (or its first) has it checked out. */
export const worktreeBranch = (w: FloorWorktree) => w.repos[0].branch ?? 'detached'

/** What only a worktree holds, per repo at risk: its uncommitted files and unpushed commits, a few of each named. */
export const worktreeRisk = (w: FloorWorktree): string[] =>
  w.repos.filter((r) => r.atRisk).map((r) => `${base(r.dir)}: ${r.dirty} uncommitted, ${r.unpushed} unpushed${r.risk.length ? ` (${r.risk.join('; ')})` : ''}`)

/** Per repo whose recorded base is gone on origin: what its absorbed check ran against instead. */
export const goneBases = (repos: { dir: string; base?: string; against?: string }[]): string[] =>
  repos.filter((r) => r.base && r.against !== r.base).map((r) => `${base(r.dir)}: ${r.base} is gone on origin, checked against ${r.against ?? 'nothing: origin has no default'}`)

/** A kept branch's repos, one line each: its base, what only it holds, and whether its work is in. */
export const keptBranchLines = (b: Floor['branches'][number]): string[] => [
  ...b.repos.map((r) => `${base(r.dir)}: from ${r.base}, ${r.unpushed} unpushed${r.absorbed ? ', absorbed' : ''}`),
  ...goneBases(b.repos),
]

/**
 * Where a new worker starts: a new worktree of its own in every repo, a worktree the floor already has, or a main
 * checkout, shared with the user and every worker there.
 */
export type Where = 'new' | 'worktree' | 'main'

/**
 * The new-worker form's values, named as its fields are. `worktree`: an existing worktree's first folder; `checkout`:
 * a main checkout. An empty `name`, `branch` or `base` is left to the tower (the callsign, the prefix, origin's
 * default), an empty `model` or `effort` to Claude.
 */
export type SpawnForm = { where: Where; worktree: string; checkout: string; name: string; branch: string; base: string; model: string; effort: string; prompt: string }

export const MODELS = ['fable', 'opus', 'sonnet', 'haiku']
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

/** Where a worker starts unless told: its own worktree when the floor cuts by default and can cut now, else the hub. */
export const defaultWhere = (f: Floor): Where => (f.cutByDefault && can(f, 'cut') ? 'new' : 'main')

/** The worktrees a worker can join: every one whose folders are still there. */
const joinable = (f: Floor) => f.worktrees.filter((w) => w.state !== 'lost')

/** The form as it opens, and as a quick hire sends it: everything left to its default. */
export const spawnDefaults = (f: Floor, prompt = ''): SpawnForm => ({
  where: defaultWhere(f), worktree: joinable(f)[0]?.repos[0].path ?? '', checkout: f.hub, name: '', branch: '', base: '', model: '', effort: '', prompt,
})

/** The form's values from its fields' entries (`new FormData(form)`), the defaults under them. */
export const spawnForm = (f: Floor, entries: Iterable<[string, FormDataEntryValue]>): SpawnForm => ({ ...spawnDefaults(f), ...Object.fromEntries(entries) })

/** The request a form sends: a cut, or a start in the directory picked. */
export const spawnCall = (f: Floor, v: SpawnForm): [Call<'spawn'>, Partial<Verbs['spawn']>] => {
  const given = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x.trim()).map(([k, x]) => [k, x.trim()]))
  const launch = given({ model: v.model, effort: v.effort, prompt: v.prompt })
  if (v.where === 'new') return [f.calls.cut!, { ...launch, cut: given({ name: v.name, branch: v.branch, base: v.base }) }]
  return [f.calls.spawn!, { ...launch, cwd: v.where === 'worktree' ? v.worktree : v.checkout }]
}

/** The branch a cut gets when its field is left empty. */
export const branchPlaceholder = (f: Floor, name: string) => `${f.branchPrefix}${name.trim() || '<callsign>'}`

/** What starting the form as it stands does, as a line of facts. */
export function spawnSummaryHtml(f: Floor, v: SpawnForm): string {
  const repos = [f.hub, ...f.repos].map(base).join(' + ')
  const joined = joinable(f).find((w) => w.repos[0].path === v.worktree)
  const others = joined?.sessions.length ?? 0
  const place =
    v.where === 'new'
      ? [v.name.trim() ? `new worktree <b>${esc(v.name.trim())}</b>` : 'new worktree named for its callsign', `⎇ ${esc(v.branch.trim() || branchPlaceholder(f, v.name))}`, `from ${esc(v.base || f.bases[0])}`, `in ${esc(repos)}`]
      : v.where === 'worktree' && joined
        ? [`joins <b>${esc(joined.name)}</b>`, `⎇ ${esc(worktreeBranch(joined))}`, others ? `beside ${others} at work in it` : 'nobody else in it']
        : [`main checkout of <b>${esc(base(v.checkout))}</b>`, 'shared with you and every worker there']
  const claude = [v.model || "Claude's model", v.effort ? `${v.effort} effort` : "Claude's effort", v.prompt.trim() ? 'starts on the prompt' : 'starts idle']
  return [...place, ...claude.map(esc)].map((fact) => `<span>${fact}</span>`).join('')
}

/** A choice of where, with what picking it means; `aside`: a hint at its right, as "default". */
const choiceHtml = (where: Where, title: string, what: string, { checked = false, disabled = false, aside = '' } = {}) =>
  `<label class="choice"><input type="radio" name="where" value="${where}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
    <b>${title}</b>${aside && `<span class="aside">${aside}</span>`}<small>${what}</small></label>`

/** A field's label: its name, and when the tower or Claude fills it in if left empty, says so. */
const labelHtml = (name: string, optional = false) => `<span class="lbl">${name}${optional ? '<i>optional</i>' : ''}</span>`

const optionsHtml = (values: string[], none: string) => [`<option value="">${esc(none)}</option>`, ...values.map((v) => `<option>${esc(v)}</option>`)].join('')

/**
 * The new-worker form both renderers put in their dialog: the first prompt beside where and how the worker starts,
 * and a line saying what Start will do. `sign`: the floor's sign as the renderer draws it; `draft`: the draft it was
 * opened on. Its buttons carry `data-close` (`cancel`, `start`) and submit nothing; `[data-summary]` is the line to
 * redraw from `spawnSummaryHtml` as the fields change, `[name=branch]`'s placeholder from `branchPlaceholder`.
 */
export function spawnFormHtml(f: Floor, { sign, draft }: { sign: string; draft?: string }): string {
  const v = spawnDefaults(f)
  const worktrees = joinable(f)
  const repos = [f.hub, ...f.repos]
  const isDefault = (w: Where) => (w === v.where ? 'default' : '')
  const cutWhy = f.bases.length ? 'the host is down' : 'the hub is not a git repo with an origin'
  return `<form class="spawn-form"${f.color ? ` style="--p:${esc(f.color)}"` : ''}>
  <header>${sign}<h2>New worker</h2>${draft ? `<span class="draft">on the draft <b>${esc(draft)}</b>, deleted once it starts</span>` : ''}</header>
  <div class="cols">
    <label class="task">${labelHtml('First prompt', true)}
      <textarea name="prompt" spellcheck="false" placeholder="What should it work on? Left empty, Claude boots to an idle prompt.">${esc(v.prompt)}</textarea></label>
    <div class="setup">
      <fieldset class="where"><legend>${labelHtml('Where')}</legend>
        ${choiceHtml('new', 'New worktree', `its own branch, in ${esc(repos.map(base).join(' + '))}`, { checked: v.where === 'new', disabled: !can(f, 'cut'), aside: can(f, 'cut') ? isDefault('new') : esc(cutWhy) })}
        ${choiceHtml('worktree', 'Existing worktree', worktrees.length ? `join one of ${worktrees.length} on this floor` : 'none on this floor', { disabled: !worktrees.length })}
        ${choiceHtml('main', 'Main checkout', 'shared with you and every worker there', { checked: v.where === 'main', aside: isDefault('main') })}
      </fieldset>
      <div class="if-new fields">
        <label>${labelHtml('Name', true)}<input name="name" autocomplete="off" spellcheck="false" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]*" placeholder="the worker's callsign"></label>
        <label>${labelHtml('Branch', true)}<input name="branch" autocomplete="off" spellcheck="false" placeholder="${esc(branchPlaceholder(f, ''))}"></label>
        <label class="wide">${labelHtml('From')}<select name="base">${f.bases.map((b, i) => `<option value="${i ? esc(b) : ''}">${esc(b)}${i ? '' : " · origin's default"}</option>`).join('')}</select></label>
      </div>
      <fieldset class="if-worktree picks">${worktrees.map((w, i) => `<label class="pick"><input type="radio" name="worktree" value="${esc(w.repos[0].path)}"${i ? '' : ' checked'}>
        <b>${esc(w.name)}</b><span>⎇ ${esc(worktreeBranch(w))}</span><span class="st ${w.state}">${w.sessions.length ? `${w.sessions.length} at work` : WORKTREE_STATE_NAME[w.state]}</span></label>`).join('')}</fieldset>
      <fieldset class="if-main picks">${repos.map((dir, i) => `<label class="pick"><input type="radio" name="checkout" value="${esc(dir)}"${i ? '' : ' checked'}>
        <b>${esc(base(dir))}</b><span>${i ? "its own CLAUDE.md, not the hub's" : 'the hub: its CLAUDE.md and skills'}</span></label>`).join('')}</fieldset>
      <div class="fields">
        <label>${labelHtml('Model', true)}<select name="model">${optionsHtml(MODELS, "Claude's default")}</select></label>
        <label>${labelHtml('Effort', true)}<select name="effort">${optionsHtml(EFFORTS, "Claude's default")}</select></label>
      </div>
    </div>
  </div>
  <footer><p class="summary" data-summary>${spawnSummaryHtml(f, v)}</p>
    <button type="button" data-close="cancel">Cancel</button><button type="button" class="primary" data-close="start">Start <kbd>⌘⏎</kbd></button></footer>
</form>`
}
