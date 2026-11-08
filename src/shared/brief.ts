/**
 * A worker's brief as every renderer draws it, a chat read top to bottom: each earlier session the worker ran as
 * folded, oldest first, then the session it was read for, each conversation's turns oldest first, the user's prompts
 * on one side and Claude's answers on the other, the latest at the bottom. Pure views from plain data to html, with one
 * stylesheet (`briefCss`, beside `markdownCss`). The tower serves it as `/brief.js`.
 *
 * A turn draws what Claude did between its prompt and its answer: its words between tool calls, each tool call folded
 * to one line, and the messages it sent other workers.
 *
 * What a viewer opens is read back from what was drawn, so a redraw keeps it: an earlier session's fold is a
 * `<details data-brief-session="<id>">` (`openFolds`), a long prompt or answer folded to its start has a
 * `<input type="checkbox" data-expand="<key>">` that shows it all (`expandedSaid`, pure CSS; the latest answer, never
 * folded, is drawn `data-said-whole="<key>"` and stays shown in full once a later turn comes), and a tool call or a run
 * of them is a `<details data-tool="<key>">` or `<details data-tool-run="<key>">` (`openTools`). A renderer wires:
 *
 *   data-copy-said="<key>"           copy that prompt's, answer's or step's text as written (`saidText`, `saidWhat`)
 *   data-brief-markdown="<choice>"   draw words rendered or raw (`BRIEF_MARKDOWNS`), the viewer's, kept under `BRIEF_MARKDOWN_KEY`
 *   data-tool="<session>:<call>" opened   read the call (`tower.toolCall`), draw it in its `[data-tool-body]`
 *                                         (`toolCallHtml`), and hand it to the next draw as `tools` once it ended
 *                                         (`toolCallSettled`): a call drawn open fires `toggle` again as it is drawn
 *   data-brief-earlier="<session>:<conversation>"   read the conversation whole (`tower.conversation`) and draw it in place
 *                                                   of its last turns (`withWhole`), joined to each later
 *                                                   read's last turns (`joinedWholes`)
 *
 * and each fence's `data-copy-code` of `/markdown.js`. A brief shown is read again as its card moves (`briefKey`), each
 * read with the conversations read whole joined to its last turns of them (`joinedWholes`).
 */
import type { Board, Card, CardShown, LineageSession } from '../bridge/board.ts'
import type { SessionRef } from '../bridge/chains.ts'
import type { Brief, BriefSession, Step, ToolCall, ToolOutcome, Turn } from '../bridge/turns.ts'
import { ago, clockAt, esc, plural } from './cards.ts'
import { VIEWER_KEYS, type BriefMarkdown } from './viewer.ts'

/** One session's part of a brief: its place in the worker's lineage (`n` of `of`, from 1) and its conversations, in order. */
export type BriefPart = { session: BriefSession; n: number; of: number; threads: Brief[] }

/** A brief by session, in the order the reply lists them: the session it was read for, then the earlier ones, latest first. */
export const briefParts = (briefs: Brief[]): BriefPart[] => {
  const ids = [...new Set(briefs.map((b) => b.session.id))]
  return ids.map((id, i) => {
    const threads = briefs.filter((b) => b.session.id === id)
    return { session: threads[0].session, n: ids.length - i, of: ids.length, threads }
  })
}

/** A session's start as "Oct 6, 21:40", in the viewer's time zone. */
export const sessionWhen = (ms: number) =>
  new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** "session 2 of 3 · Oct 6, 21:40" */
export const sessionLabel = (n: number, of: number, startedAt: number) => `session ${n} of ${of} · ${sessionWhen(startedAt)}`

/**
 * The session a showing came from while its worker has run as more than one: `mark` short ("s1"), `label` in full
 * ("session 1 of 2 · Oct 6, 21:40").
 */
export const shownFrom = (lineage: LineageSession[], s: Pick<CardShown, 'session'>): { mark: string; label: string } | undefined => {
  const i = lineage.findIndex((l) => l.id === s.session)
  return lineage.length > 1 && i >= 0 ? { mark: `s${i + 1}`, label: sessionLabel(i + 1, lineage.length, lineage[i].startedAt) } : undefined
}

/**
 * Whether a worker's session `n` (from 1) was a resume given no prompt of its own: its conversations hold only the turns
 * it resumed, and its last screen reprints them. A session's own turns are its latest, so a brief's last turns show them.
 */
export const resumedIdle = (briefs: Brief[], session: Pick<BriefSession, 'id' | 'startedAt'>, n: number) =>
  n > 1 && briefs.every((b) => b.session.id !== session.id || b.turns.every((t) => t.startedAt < session.startedAt))

/** What a viewer reads beside a `resumedIdle` session: `mark` short, `means` in full. */
export const RESUMED_IDLE = { mark: 'resumed, no new turns', means: 'resumed but never given a prompt: its conversation and last screen are those of the session it resumed' }

export const BRIEF_MARKDOWNS: BriefMarkdown[] = ['rendered', 'raw']
/** Where a viewer's `BriefMarkdown` is kept in `tower.store`; rendered while unset. */
export const BRIEF_MARKDOWN_KEY = VIEWER_KEYS.briefMarkdown
export const BRIEF_MARKDOWN_LABEL: Record<BriefMarkdown, string> = { rendered: 'Rendered', raw: 'Raw' }
export const BRIEF_MARKDOWN_MEANS: Record<BriefMarkdown, string> = {
  rendered: 'prompts and answers as formatted text: headings, lists, tables, highlighted code',
  raw: 'prompts and answers as written, marks and all',
}

/** A prompt or answer past either length is folded to its start until the viewer shows it all; never the brief's latest answer. */
const FOLD_CHARS = 1500
const FOLD_LINES = 30
const isLong = (text: string) => text.length > FOLD_CHARS || text.split('\n').length > FOLD_LINES

/**
 * A brief: `said` sets markdown as html, safe in any element (`markdownHtml`); `promptBy` names the hirer whose prompt
 * opened a conversation of the session the brief was read for; `open` holds the earlier sessions unfolded and
 * `expanded` the long words shown in full, by key; `markdown` the viewer's choice, rendered unless given; `working`
 * whether Claude works on the brief's latest prompt now (the worker's status), else an unanswered prompt has no answer.
 */
export type BriefView = {
  briefs: Brief[]
  said: (text: string) => string
  promptBy: (conversation: string) => string | undefined
  open: ReadonlySet<string>
  expanded?: ReadonlySet<string>
  markdown?: BriefMarkdown
  working?: boolean
  /** What a renderer draws on a conversation's heading, by the conversation's id: html, empty for none. */
  adds?: (conversation: string) => string
  /** What a renderer draws beside a prompt's or an answer's copy, by its key (`saidOf`): html, empty for none. @since 1.118 */
  acts?: (said: string) => string
  /** The tool calls and runs of them the viewer opened, by key (`openTools`). @since 1.133 */
  openTools?: ReadonlySet<string>
  /** A tool call read, by its key, as `toolCallHtml` draws it; `undefined` for one not read yet. @since 1.133 */
  tools?: (key: string) => string | undefined
}

/** The earlier sessions unfolded in a drawn brief, by id. */
export const openFolds = (root: ParentNode | null | undefined): Set<string> =>
  new Set([...(root?.querySelectorAll<HTMLElement>('[data-brief-session][open]') ?? [])].map((el) => el.dataset.briefSession!))

/**
 * The long prompts and answers shown in full in a drawn brief, by key: those the viewer showed all of, and the latest
 * answer, drawn whole (`data-said-whole`), so a turn arriving folds nothing being read. @since 1.163 the latest answer
 */
export const expandedSaid = (root: ParentNode | null | undefined): Set<string> =>
  new Set([...(root?.querySelectorAll<HTMLElement>('input[data-expand]:checked, [data-said-whole]') ?? [])].map((el) => el.dataset.expand ?? el.dataset.saidWhole!))

/** The tool calls and runs of them a viewer opened in a drawn brief, by key. @since 1.133 */
export const openTools = (root: ParentNode | null | undefined): Set<string> =>
  new Set([...(root?.querySelectorAll<HTMLElement>('details[data-tool][open], details[data-tool-run][open]') ?? [])].map((el) => el.dataset.tool ?? el.dataset.toolRun!))

/** A prompt, an answer, or one of a turn's steps by its place among them (`step.<n>`). */
type Side = 'prompt' | 'answer' | `step.${number}`
/** A prompt's or answer's key: a resumed conversation's turns are drawn again in the session that resumed it. */
const saidKey = (t: Brief, turn: Turn, side: Side) => `${t.session.id}:${t.id}:${turn.startedAt}:${side}`

/** A turn's words in reading order: its prompt, Claude's words and messages on the way, its answer. */
const turnSaid = (turn: Turn): { side: Side; text: string; what: string }[] => [
  { side: 'prompt', text: turn.prompt, what: 'the prompt' },
  ...turn.steps.flatMap((s, n) => (s.t === 'tool' ? [] : [{ side: `step.${n}` as const, text: s.text, what: s.t === 'sent' ? 'the message' : "Claude's words" }])),
  ...(turn.answer === undefined ? [] : [{ side: 'answer' as const, text: turn.answer, what: 'the answer' }]),
]

/**
 * Every prompt, answer and step with words of a brief, by the key it is drawn under: the session it is drawn in, its
 * conversation, when its turn started, its side, its text as written, and what it is in words ("the prompt"). @since 1.118
 */
export const saidOf = (briefs: Brief[]): { key: string; session: string; conversation: string; startedAt: number; side: Side; text: string; what: string }[] =>
  briefs.flatMap((b) =>
    b.turns.flatMap((turn) => turnSaid(turn).map(({ side, text, what }) => ({ key: saidKey(b, turn, side), session: b.session.id, conversation: b.id, startedAt: turn.startedAt, side, text, what }))),
  )

/** The text of a prompt, answer or step of a brief by its key, as written. */
export const saidText = (briefs: Brief[], key: string): string | undefined => saidOf(briefs).find((s) => s.key === key)?.text

/** What a prompt, answer or step of a brief is, in words, by its key: "the prompt", "the message". @since 1.133 */
export const saidWhat = (briefs: Brief[], key: string): string | undefined => saidOf(briefs).find((s) => s.key === key)?.what

/** A tool call's key, `<session>:<call>`: the session whose log holds it and its id (`tower.toolCall`). @since 1.133 */
export const toolKey = (turn: Turn, call: Extract<Step, { t: 'tool' }>) => `${turn.session}:${call.id}`

/** A conversation's key in a drawn brief, `<session>:<conversation>`: the session it is drawn in, and its id (`tower.conversation`). */
const conversationKey = (b: Brief) => `${b.session.id}:${b.id}`

/** A brief with the conversation `whole` read whole in place of its last turns. @since 1.133 */
export const withWhole = (briefs: Brief[], whole: Brief): Brief[] => briefs.map((b) => (conversationKey(b) === conversationKey(whole) ? whole : b))

const turnMark = (turn: Turn | undefined) => turn && `${turn.startedAt} ${turn.answeredAt} ${turn.steps.length}`

/**
 * Whether a conversation read whole still holds what a later brief gives of it: its latest turn is the same, unmoved.
 * One that moved is read again, or let go. @since 1.133
 */
export const wholeHolds = (briefs: Brief[], whole: Brief): boolean => {
  const now = briefs.find((b) => conversationKey(b) === conversationKey(whole))
  return now !== undefined && turnMark(now.turns.at(-1)) === turnMark(whole.turns.at(-1))
}

/**
 * A brief as read again, with the conversations read whole before in place of their last turns, those that still hold
 * (`wholeHolds`): the brief to draw, and the wholes to keep for the next read. @since 1.161
 */
export const keptWholes = (read: Brief[], wholes: Brief[]): { briefs: Brief[]; wholes: Brief[] } => {
  const kept = wholes.filter((whole) => wholeHolds(read, whole))
  return { briefs: kept.reduce(withWhole, read), wholes: kept }
}

/**
 * A conversation read whole joined to a later read of its last turns: its turns before them, then them. A turn once
 * past never changes, so the join is the conversation whole as of the later read. `undefined` when the last turns
 * start past every turn the whole holds: turns came between that neither holds, and it is read whole again.
 */
const joined = (last: Brief, whole: Brief): Brief | undefined => {
  if (!last.earlier) return last
  const at = whole.turns.findIndex((t) => t.startedAt === last.turns[0]?.startedAt)
  return at < 0 ? undefined : { ...last, earlier: false, turns: [...whole.turns.slice(0, at), ...last.turns] }
}

/**
 * A brief as read again, with the conversations read whole before joined to their last turns in it: the brief to draw,
 * the wholes to keep for the next read, and those `behind`, which the read's turns no longer meet, to read whole again
 * and draw in place (`withWhole`). A conversation the read no longer holds is let go. A worker at work so keeps a
 * conversation read whole as it calls tools and messages arrive, with no read of its own. @since 1.163
 */
export const joinedWholes = (read: Brief[], wholes: Brief[]): { briefs: Brief[]; wholes: Brief[]; behind: Brief[] } =>
  wholes.reduce<{ briefs: Brief[]; wholes: Brief[]; behind: Brief[] }>((acc, whole) => {
    const last = acc.briefs.find((b) => conversationKey(b) === conversationKey(whole))
    if (!last) return acc
    const now = joined(last, whole)
    return now ? { ...acc, briefs: withWhole(acc.briefs, now), wholes: [...acc.wholes, now] } : { ...acc, behind: [...acc.behind, whole] }
  }, { briefs: read, wholes: [], behind: [] })

/**
 * What a worker's brief is read at: its status, its tool, its conversations and what extensions add to them. A brief
 * shown is read again when this moves. @since 1.161
 */
export const briefKey = (board: Pick<Board, 'adds'>, c: Card) =>
  `${c.status} ${c.tool} ${JSON.stringify(c.conversations)} ${JSON.stringify(c.conversations.map((v) => board.adds[`conversation:${v.id}`]))}`

/** Whether a tool call read is how it ended, to keep for every draw after: one still running is read again when opened. @since 1.133 */
export const toolCallSettled = (call: ToolCall) => call.outcome !== 'running'

const OUTCOME_WORDS: Record<ToolOutcome, string> = { running: 'running', ok: '', error: 'failed', denied: 'denied', abandoned: 'stopped' }

const duration = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

const fieldHtml = (name: string, value: unknown) =>
  `<dt>${esc(name)}</dt><dd><pre>${esc(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre></dd>`

/** A tool call read (`tool/<id>/<call>`): each field of its input as given, the check it met, and how it ended. @since 1.133 */
export const toolCallHtml = (call: ToolCall) => {
  const check = call.check && [call.check.decision, call.check.rule && `rule ${call.check.rule}`, call.check.reason].filter(Boolean).join(' · ')
  const ended = [OUTCOME_WORDS[call.outcome] || 'done', call.ms !== undefined && duration(call.ms)].filter(Boolean).join(' · ')
  return `<dl class="tool-input">${Object.entries(call.input).map(([k, v]) => fieldHtml(k, v)).join('')}</dl>
    <p class="tool-ended">${check ? `permission: ${esc(String(check))} · ` : ''}${esc(ended)}</p>${call.error ? `<pre class="tool-error">${esc(call.error)}</pre>` : ''}`
}

/** `latest`: the brief's latest turn, whose answer never folds; `working` whether Claude works on it now. */
type Drawing = {
  said: BriefView['said']
  expanded: ReadonlySet<string>
  raw: boolean
  latest?: Turn
  working: boolean
  adds?: BriefView['adds']
  acts?: BriefView['acts']
  openTools: ReadonlySet<string>
  tools?: BriefView['tools']
}

/** Who a bubble is: the user's prompt, another worker's message, Claude's answer, its words on the way, or a message it sent. */
type Speaker = 'you' | 'peer' | 'claude' | 'step' | 'sent'

/** `what` names it for its copy button; `folds`, whether a long one folds to its start. */
const bubbleHtml = (what: string, speaker: Speaker, key: string, text: string, who: string, d: Drawing, folds: boolean) => {
  const long = folds && isLong(text)
  const whole = !folds && isLong(text) ? ` data-said-whole="${esc(key)}"` : ''
  const words = d.raw ? `<div class="raw">${esc(text)}</div>` : `<div class="md">${d.said(text)}</div>`
  return `<div class="bubble ${speaker}${long ? ' long' : ''}"${whole}><header><span class="who">${who}</span><span class="acts">${d.acts?.(key) ?? ''}<button type="button" data-copy-said="${esc(key)}" aria-label="copy ${esc(what)} as written">copy</button></span></header>${words}${
    long ? `<label class="more"><input type="checkbox" data-expand="${esc(key)}"${d.expanded.has(key) ? ' checked' : ''}><span class="show">show all</span><span class="hide">fold</span></label>` : ''}</div>`
}

/** A run of at least this many tool calls in a row folds to one line saying how many. */
const TOOL_RUN = 5

type ToolStep = Extract<Step, { t: 'tool' }>

/** A tool call in one line, opened to what it was given and how it ended once read. */
const toolHtml = (turn: Turn, call: ToolStep, d: Drawing) => {
  const key = toolKey(turn, call)
  const ended = [OUTCOME_WORDS[call.outcome], call.ms !== undefined && duration(call.ms), call.agentSteps !== undefined && plural(call.agentSteps, 'subagent step')].filter(Boolean).join(' · ')
  return `<details class="tool ${call.outcome}" data-tool="${esc(key)}"${d.openTools.has(key) ? ' open' : ''}><summary><span class="name">${esc(call.tool)}</span><span class="line">${esc(call.line)}</span><span class="ended">${esc(ended)}</span></summary><div class="tool-body" data-tool-body>${d.tools?.(key) ?? '<p class="none">reading the call…</p>'}</div></details>`
}

/** A turn's steps in reading order; a run of tool calls folded to its count, under the key of its first. */
const stepsHtml = (t: Brief, turn: Turn, since: number, d: Drawing) => {
  const runs = turn.steps.reduce<{ n: number; steps: Step[] }[]>((runs, step, n) => {
    const last = runs.at(-1)
    return step.t === 'tool' && last?.steps[0].t === 'tool' ? [...runs.slice(0, -1), { ...last, steps: [...last.steps, step] }] : [...runs, { n, steps: [step] }]
  }, [])
  const html = runs.map(({ n, steps: [first, ...rest] }) => {
    if (first.t === 'text') return bubbleHtml("Claude's words", 'step', saidKey(t, turn, `step.${n}`), first.text, '', d, true)
    if (first.t === 'sent') return bubbleHtml('the message', 'sent', saidKey(t, turn, `step.${n}`), first.text, `TO ${esc(first.to.callsign)} · ${esc(clockAt(first.at, since))}`, d, true)
    const calls = [first, ...rest] as ToolStep[]
    const lines = calls.map((c) => toolHtml(turn, c, d)).join('')
    if (calls.length < TOOL_RUN) return lines
    const key = `${toolKey(turn, first)}:run`
    const amiss = (['error', 'denied', 'abandoned'] as const).flatMap((o) => {
      const n = calls.filter((c) => c.outcome === o).length
      return n ? [`${n} ${OUTCOME_WORDS[o]}`] : []
    })
    return `<details class="tool-run" data-tool-run="${esc(key)}"${d.openTools.has(key) ? ' open' : ''}><summary>${[plural(calls.length, 'tool call'), ...amiss].join(' · ')}</summary>${lines}</details>`
  }).join('')
  return html && `<div class="steps">${html}</div>`
}

/** Who gave a turn's prompt: the worker that sent it, the hirer `by` whose launch prompt it is, or the user. */
const askedBy = (turn: Turn, by: string | undefined) => (turn.from ? esc(turn.from.callsign) : by ? `FROM ${esc(by)}, WHICH HIRED IT` : 'YOU')

/** A turn's prompt and what came of it: Claude's steps, then its answer, its work under way on the brief's latest prompt, or no answer. */
function turnHtml(t: Brief, turn: Turn, by: string | undefined, d: Drawing) {
  const since = t.session.startedAt + t.at * 1000
  const asked = `${askedBy(turn, by)} · ${esc(clockAt(turn.startedAt, since))}`
  const latest = turn === d.latest
  const prompt = bubbleHtml('the prompt', turn.from ? 'peer' : 'you', saidKey(t, turn, 'prompt'), turn.prompt, asked, d, true)
  const steps = stepsHtml(t, turn, since, d)
  const working = latest && d.working
  if (turn.answer === undefined)
    return `<div class="turn">${prompt}${steps}<div class="bubble claude ${working ? 'working' : 'none'}"><header><span class="who">CLAUDE${working ? ' · <span class="lamp"></span> working on it' : ' · no answer'}</span></header></div></div>`
  const answered = `CLAUDE · ${esc(clockAt(turn.answeredAt!, since))} · took ${esc(ago(turn.answeredAt! - turn.startedAt))}`
  return `<div class="turn">${prompt}${steps}${bubbleHtml('the answer', 'claude', saidKey(t, turn, 'answer'), turn.answer, answered, d, !latest)}</div>`
}

/** A session a conversation resumes or is resumed by: by its number when the brief holds it, else by its worker. */
const refName = (ref: SessionRef, parts: BriefPart[]) => {
  const part = parts.find((p) => p.session.id === ref.id)
  return part ? `session ${part.n}` : ref.callsign
}

/** What a renderer drew for a conversation, on its heading. */
const addsHtml = (conversation: string, d: Drawing) => {
  const adds = d.adds?.(conversation)
  return adds ? ` <span class="brief-adds">${adds}</span>` : ''
}

/** A session's conversations in order, each with its last turns, oldest first; `promptBy` names the latest prompt the user's side gave. */
const conversationsHtml = (part: BriefPart, parts: BriefPart[], promptBy: BriefView['promptBy'], d: Drawing) =>
  part.threads.map((t, i) => `<section class="brief-conv">
    <h4 class="eyebrow">conversation ${i + 1} of ${part.threads.length} · ${esc(sessionWhen(part.session.startedAt + t.at * 1000))}${t.resumes ? ` · resumes ${esc(refName(t.resumes, parts))}` : ''}${t.resumedBy ? ` · resumed by ${esc(refName(t.resumedBy, parts))}` : ''}${addsHtml(t.id, d)}</h4>
    ${t.earlier ? `<button type="button" class="earlier" data-brief-earlier="${esc(conversationKey(t))}">earlier turns</button>` : ''}
    ${t.turns.length ? t.turns.map((turn, j) => turnHtml(t, turn, j === t.turns.findLastIndex((u) => !u.from) ? promptBy(t.id) : undefined, d)).join('') : '<p class="none">nothing asked yet</p>'}</section>`).join('')

const markdownBar = (markdown: BriefMarkdown) =>
  `<div class="brief-bar"><div class="seg" role="group" aria-label="prompts and answers">${BRIEF_MARKDOWNS.map((m) =>
    `<button type="button" class="${m === markdown ? 'on' : ''}" data-brief-markdown="${m}" aria-pressed="${m === markdown}" data-tip="${esc(BRIEF_MARKDOWN_MEANS[m])}">${BRIEF_MARKDOWN_LABEL[m]}</button>`).join('')}</div></div>`

export function briefHtml({ briefs, said, promptBy, open, expanded = new Set(), markdown = 'rendered', working = false, adds, acts, openTools = new Set(), tools }: BriefView) {
  const parts = briefParts(briefs)
  const [current, ...earlier] = parts
  if (!current) return '<div class="brief-view"><p class="none">no conversation yet</p></div>'
  const d: Drawing = { said, expanded, raw: markdown === 'raw', latest: current.threads.at(-1)!.turns.at(-1), working, adds, acts, openTools, tools }
  const label = (p: BriefPart) => esc(sessionLabel(p.n, p.of, p.session.startedAt))
  const idle = (p: BriefPart) => resumedIdle(briefs, p.session, p.n) ? ` · <span class="idle" data-tip="${esc(RESUMED_IDLE.means)}">${RESUMED_IDLE.mark}</span>` : ''
  return `<div class="brief-view">${markdownBar(markdown)}
    ${earlier.length ? '<h3 class="eyebrow">earlier sessions</h3>' : ''}
    ${earlier.toReversed().map((p) => `<details class="brief-session" data-brief-session="${esc(p.session.id)}"${open.has(p.session.id) ? ' open' : ''}>
      <summary class="eyebrow">${label(p)} · ${plural(p.threads.length, 'conversation')}${idle(p)}</summary>${conversationsHtml(p, parts, () => undefined, d)}</details>`).join('')}
    ${earlier.length ? `<h3 class="brief-session-head">${label(current)} · this session${idle(current)}</h3>` : ''}
    ${conversationsHtml(current, parts, promptBy, d)}</div>`
}

/** Scoped under `.brief-view`; reads the design's tokens from `/design.css`, and `markdownCss` sets the words. */
export const briefCss = `.brief-view { display: flex; flex-direction: column; gap: var(--sp-xs); font: var(--fs-l)/1.55 var(--ui); color: var(--ink); }
.brief-view .brief-bar { position: sticky; top: 0; z-index: 1; display: flex; justify-content: flex-end; padding: var(--sp-s) 0; background: var(--panel); }
.brief-view .seg { display: flex; gap: var(--sp-2xs); padding: var(--sp-2xs); border-radius: var(--radius); background: var(--sunk); }
.brief-view .seg button { padding: var(--sp-2xs) var(--sp-l); border: 0; border-radius: var(--radius); background: none; color: var(--muted); font: 700 var(--fs-s)/1.4 var(--ui); cursor: pointer; }
.brief-view .seg button:hover { color: var(--ink); } .brief-view .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 2px #0003; }
.brief-view h3 { margin: .6em 0 .2em; line-height: 1.4; }
.brief-view .brief-session-head { margin-top: 1.4em; padding-top: 1em; border-top: 1px solid var(--line); }
.brief-view h4 { margin: 1.2em 0 .5em; line-height: 1.4; }
.brief-view .brief-conv + .brief-conv { margin-top: 1em; border-top: 1px solid var(--line); }
.brief-view .brief-adds { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2xs); margin-left: var(--sp-m); letter-spacing: 0; text-transform: none; vertical-align: middle; }
.brief-view .none { margin: .4em 0; color: var(--faint); font-style: italic; }
.brief-view .turn { display: grid; gap: var(--sp-m); margin-bottom: var(--sp-xl); }
.brief-view .bubble { min-width: 0; padding: var(--sp-m) var(--sp-xl) var(--sp-l); border-radius: 12px; border: 1px solid var(--line); }
.brief-view .bubble.you { justify-self: end; max-width: min(82%, 760px); background: color-mix(in oklab, var(--accent) 12%, var(--panel)); border-color: color-mix(in oklab, var(--accent) 40%, var(--panel)); border-bottom-right-radius: 3px; }
.brief-view .bubble.peer { justify-self: end; max-width: min(82%, 760px); background: color-mix(in oklab, var(--ink) 6%, var(--panel)); border-style: dashed; border-color: var(--muted); border-bottom-right-radius: 3px; }
.brief-view .bubble.claude { justify-self: stretch; background: var(--panel-2); border-bottom-left-radius: 3px; }
.brief-view .bubble.working, .brief-view .bubble.none { justify-self: start; }
.brief-view .bubble > header { display: flex; align-items: center; gap: var(--sp-m); min-height: 20px; margin-bottom: var(--sp-xs); font: 700 var(--fs-xs)/1.3 var(--ui); letter-spacing: .06em; color: var(--muted); }
.brief-view .bubble.working > header, .brief-view .bubble.none > header { margin: 0; }
.brief-view .bubble.working .lamp { margin: 0 var(--sp-2xs) 0 var(--sp-xs); vertical-align: -1px; }
.brief-view .bubble > header .acts { margin-left: auto; display: flex; gap: var(--sp-xs); opacity: .55; }
.brief-view .bubble:hover > header .acts, .brief-view .bubble > header .acts:focus-within { opacity: 1; }
.brief-view .bubble > header button { padding: 0 var(--sp-m); font: 700 var(--fs-xs)/1.6 var(--ui); letter-spacing: 0; color: var(--muted); background: none; border: 1px solid var(--line); border-radius: var(--radius); cursor: pointer; }
.brief-view .bubble > header button:hover { color: var(--ink); }
.brief-view .raw { white-space: pre-wrap; overflow-wrap: anywhere; font: var(--fs-m)/1.55 var(--mono); font-variant-ligatures: none; }
.brief-view .long > :is(.md, .raw) { max-height: 18em; overflow: hidden; mask-image: linear-gradient(#000 65%, transparent); }
.brief-view .long:has(.more input:checked) > :is(.md, .raw) { max-height: none; mask-image: none; }
.brief-view .more { display: inline-block; margin-top: var(--sp-xs); font: 700 var(--fs-s)/1.4 var(--ui); color: var(--accent); cursor: pointer; }
.brief-view .bubble:is(.you, .peer) :is(.md a, .more) { color: var(--ink); text-decoration: underline; }
.brief-view .more input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.brief-view .more:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-s); }
.brief-view .more .hide, .brief-view .more:has(input:checked) .show { display: none; } .brief-view .more:has(input:checked) .hide { display: inline; }
.brief-view .brief-session { margin: .3em 0; border: 1px solid var(--line); border-radius: var(--radius); padding: 0 var(--sp-l); }
.brief-view .brief-session[open] { padding-bottom: var(--sp-s); }
.brief-view .brief-session > summary { cursor: pointer; padding: var(--sp-m) 0; line-height: 1.4; }
.brief-view .idle { color: var(--faint); font-style: italic; }
.brief-view .earlier { justify-self: start; margin: 0 0 var(--sp-l); padding: var(--sp-2xs) var(--sp-l); border: 1px solid var(--line); border-radius: var(--radius); background: none; color: var(--muted); font: 700 var(--fs-s)/1.4 var(--ui); cursor: pointer; }
.brief-view .earlier:hover { color: var(--ink); }
.brief-view .steps { display: grid; gap: var(--sp-xs); min-width: 0; margin-left: var(--sp-m); padding-left: var(--sp-l); border-left: 2px solid var(--line); }
.brief-view .bubble.step { padding: var(--sp-2xs) 0; border: 0; background: none; }
.brief-view .bubble.step > header { float: right; min-height: 0; margin: 0 0 0 var(--sp-m); }
.brief-view .bubble.step > :is(.md, .raw) { color: var(--muted); }
.brief-view .bubble.sent { justify-self: start; max-width: min(82%, 760px); border-style: dashed; background: color-mix(in oklab, var(--ink) 4%, var(--panel)); }
.brief-view details.tool > summary, .brief-view details.tool-run > summary { display: flex; align-items: baseline; gap: var(--sp-m); min-width: 0; padding: var(--sp-2xs) 0; color: var(--muted); font: var(--fs-s)/1.5 var(--mono); cursor: pointer; }
.brief-view details.tool-run > summary { font-family: var(--ui); font-weight: 700; }
.brief-view :is(details.tool, details.tool-run) > summary::before { content: '▸'; flex: none; width: 1em; color: var(--faint); }
.brief-view :is(details.tool, details.tool-run)[open] > summary::before { content: '▾'; }
.brief-view details.tool-run > details.tool { margin-left: var(--sp-l); }
.brief-view details.tool .name { flex: none; color: var(--ink); font-weight: 700; }
.brief-view details.tool .line { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.brief-view details.tool .ended { flex: none; color: var(--faint); }
.brief-view details.tool:is(.error, .denied) .ended { color: var(--broken-text); }
.brief-view details.tool.running .ended { color: var(--working-text); }
.brief-view .tool-body { margin: var(--sp-2xs) 0 var(--sp-m); padding: var(--sp-m) var(--sp-l); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); font-size: var(--fs-s); }
.brief-view .tool-input { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--sp-2xs) var(--sp-l); margin: 0; }
.brief-view .tool-input dt { color: var(--muted); font: 700 var(--fs-xs)/1.8 var(--ui); }
.brief-view .tool-input dd { margin: 0; min-width: 0; }
.brief-view .tool-body pre { margin: 0; max-height: 24em; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: var(--fs-s)/1.5 var(--mono); }
.brief-view .tool-ended { margin: var(--sp-s) 0 0; color: var(--muted); }
.brief-view .tool-body pre.tool-error { margin-top: var(--sp-xs); color: var(--broken-text); }`
