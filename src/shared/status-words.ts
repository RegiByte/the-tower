import type { BlockedKind } from '../bridge/blocked.ts'
import type { Card, Unresumable } from '../bridge/board.ts'
import type { Attention } from '../bridge/life.ts'
import type { Status } from '../bridge/status.ts'
import { esc, plain } from './format.ts'

/** A worker's status in words: its attention, status, lamp and glyph, and the gist of what it is up to. */

/**
 * The status vocabulary every renderer draws a worker's state from: the word (`statusName`, `statusWord` short), and
 * the colour, its attention's palette token (`palettes[scheme][attention]`, the attention's class in design.ts). Red,
 * `needs`, is only a worker that needs you: a screen, a question or a permission. An unread answer is `ready`, a wait
 * drawn calm: loud only in the count of waits and the keys that walk them.
 */
export const STATUS_NAME: Record<Status, string> = {
  booting: 'booting', blocked: 'blocked', idle: 'idle', working: 'working', needs_input: 'needs you', watching: 'watching', done: 'done', failed: 'failed', exited: 'exited', lost: 'lost',
}

/** A worker's attention in a word, as a count of workers or a legend names it. */
export const ATTENTION_NAME: Record<Attention, string> = { needs: 'needs you', ready: 'done', working: 'working', quiet: 'quiet', broken: 'failed' }

/** What puts a worker in each attention (`attentionOf`, src/bridge/life.ts), for a count's tooltip and a legend. */
export const ATTENTION_MEANS: Record<Attention, string> = {
  needs: "held by one of Claude's screens (workspace trust, sign-in) or asking permission for a tool: it goes on only once you answer",
  ready: 'its turn ended with an answer nobody has read: nothing it started can wake it, and nobody has typed to it since. Typing to it reads it. An answer for the worker that hired it reads done too, and waits on that worker',
  working: 'booting, or in a turn: thinking, running tools or compacting',
  quiet: 'nothing for you: at its prompt, its answer read, watching (a background task or a /loop it started will wake it, and its lamp breathes), exited, or stopped with the host and resumable',
  broken: "its last turn failed (an API error or a refusal), it was lost: the host no longer runs it and it never logged an exit, or its log holds an event the tower can't read, and its facts stop there",
}

/** The count of waits on the board that are yours, by `heededWaits`. */
export const WAITING_NAME = 'waiting on you'
export const WAITING_MEANS = 'workers whose next step is yours: a screen or a question to answer, or an answer or a failure nobody has typed to since. An answer for the worker that hired it waits on that worker, and a wait you dismissed is out of the count. N goes to the next one. Its lamp takes the colour of the loudest wait'

/** Counts of workers by attention are over the workers on duty (`Card.onDuty`). */
export const ON_DUTY_MEANS = 'counted over the workers on duty: running, or stopped and resumable'

/** A legend of the counts by status, as two cells a row (a chip, then its meaning) for a grid of two columns. */
export const statusLegendHtml = () =>
  `<span class="chip quiet"><span class="lamp"></span>${WAITING_NAME}</span><span>${esc(WAITING_MEANS)}</span>` +
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

/**
 * A stranded worker is `lost` (broken: it never logged an exit) or `stopped` (quiet: with the host, or killed from
 * outside the tower), as its colour says, until the user lets it go, `mid-turn` when it was cut off (`cutOff`). A leaving worker is `going home` too.
 */
export const statusName = (c: Card) =>
  c.broken ? 'broken' : c.stranded ? `${c.letGoAt !== undefined ? 'let go' : c.status === 'lost' ? 'lost' : 'stopped'}${c.cutOff ? ' mid-turn' : ''}, ${c.unresumable ? UNRESUMABLE_NAME[c.unresumable] : 'resumable'}` : c.waitsOn ? `waiting on ${c.waitsOn.callsign}` : `${c.stuck ? 'stuck' : STATUS_NAME[c.status]}${c.leaving ? ', going home' : ''}`

/** A worker's status in a word or two, for a row that has no room for more: a stranded worker is `stranded`, its `statusName` on hover. */
export const statusWord = (c: Card) => (c.stranded && !c.broken ? (c.letGoAt !== undefined ? 'let go' : 'stranded') : statusName(c))

/** A status as one glyph over a worker: a question (a screen's, too), a failure, an outcome nobody has looked at, or a doze; none while at work or stranded. */
export const bubbleOf = (c: Card) => (c.broken ? '×' : c.stranded ? '' : c.status === 'needs_input' || c.status === 'blocked' ? '?' : c.waiting && c.status === 'failed' ? '×' : c.waiting ? '!' : c.status === 'idle' ? 'z' : '')

/** The conversation a resume continues: the latest one Claude saved. */
export const current = (c: Card) => c.conversations.at(-1)

const LOUDNESS: Attention[] = ['needs', 'broken', 'ready', 'working', 'quiet']

/** What a count of workers is coloured by: the loudest of their attentions, in the order waits are gone to; none of none. */
export const loudest = (cards: Card[]) => LOUDNESS.find((a) => cards.some((c) => c.attention === a))

/**
 * One line of what a worker is up to: the tool it asks for, its compaction, the tool it runs, the prompt it works on,
 * else Claude's latest answer, else the prompt it was given.
 */
export type Gist = { kind: 'broken' | 'blocked' | 'asks' | 'compacts' | 'runs' | 'answer' | 'prompt'; text: string }

/** Why a broken worker's facts stopped: the event its log can't be read past, and the error it raised. */
export const brokenText = (c: Card) => `log unreadable past a${c.broken!.code === 'h' ? ' hook' : 'n event'} (${new Date(c.broken!.at).toLocaleTimeString()}): ${c.broken!.message}`

/** What the user does about a broken worker. */
export const BROKEN_DOES =
  "Nothing after that event is read, so its status, cost and answers stand as they were. It still runs if the host runs it: drive it, or kill it and resume its conversation, which starts a new log."

/** What a worker's status says on hover. */
export const statusTitle = (c: Card) => (c.broken ? `${brokenText(c)}. ${BROKEN_DOES}` : c.stuck ? STUCK_TITLE : statusName(c))

/** What a screen that blocks a worker asks of you. */
export const BLOCKED_TEXT: Record<BlockedKind, string> = {
  trust: 'Claude asks whether to trust this folder: answer on its screen',
  login: 'Claude needs signing in on this machine: answer on its screen',
}

export function gistOf(c: Card): Gist | undefined {
  const conv = current(c)
  if (c.broken) return { kind: 'broken', text: brokenText(c) }
  if (c.blocked) return { kind: 'blocked', text: BLOCKED_TEXT[c.blocked] }
  if (c.status === 'needs_input' && c.tool) return { kind: 'asks', text: c.tool }
  if (c.compacting) return { kind: 'compacts', text: 'compacting the conversation' }
  if (c.status === 'working' && c.tool) return { kind: 'runs', text: c.tool }
  if (c.status !== 'working' && conv?.answer) return { kind: 'answer', text: plain(conv.answer) }
  return conv?.prompt ? { kind: 'prompt', text: plain(conv.prompt) } : undefined
}

/** What a worker says over its head while it works: once the turn ends, its gist speaks. */
export const speechOf = (c: Card): string[] => (c.status === 'working' && !c.broken ? c.says.map(plain) : [])

export const GIST_MARK: Record<Gist['kind'], string> = { broken: '×', blocked: '⚠', asks: '⚠', compacts: '≡', runs: '⚙', answer: '↳', prompt: '❯' }

/** The gist as plain text, its mark first; `''` for a worker with nothing to say yet. */
export const gistLine = (c: Card) => {
  const gist = gistOf(c)
  return gist ? `${GIST_MARK[gist.kind]} ${gist.text}` : ''
}
