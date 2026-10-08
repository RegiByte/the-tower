/**
 * A worker's brief as every renderer draws it, a chat read top to bottom: each earlier session the worker ran as
 * folded, oldest first, then the session it was read for, each conversation's turns oldest first, the user's prompts
 * on one side and Claude's answers on the other, the latest at the bottom. Pure views from plain data to html, with one
 * stylesheet (`briefCss`, beside `markdownCss`). The tower serves it as `/brief.js`.
 *
 * What a viewer opens is read back from what was drawn, so a redraw keeps it: an earlier session's fold is a
 * `<details data-brief-session="<id>">` (`openFolds`), a long prompt or answer folded to its start has a
 * `<input type="checkbox" data-expand="<key>">` that shows it all (`expandedSaid`, pure CSS). A renderer wires:
 *
 *   data-copy-said="<key>"           copy that prompt's or answer's text as written (`saidText`)
 *   data-brief-markdown="<choice>"   draw words rendered or raw (`BRIEF_MARKDOWNS`), the viewer's, kept under `BRIEF_MARKDOWN_KEY`
 *
 * and each fence's `data-copy-code` of `/markdown.js`.
 */
import type { CardShown, LineageSession } from '../bridge/board.ts'
import type { SessionRef } from '../bridge/chains.ts'
import type { Brief, BriefSession, Turn } from '../bridge/turns.ts'
import { ago, clockAt, esc, plural } from './cards.ts'

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

/** How a viewer reads prompts and answers: markdown rendered, or the text as written. */
export type BriefMarkdown = 'rendered' | 'raw'
export const BRIEF_MARKDOWNS: BriefMarkdown[] = ['rendered', 'raw']
/** Where a viewer's `BriefMarkdown` is kept in `tower.store`; rendered while unset. */
export const BRIEF_MARKDOWN_KEY = 'brief.markdown'
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
}

/** The earlier sessions unfolded in a drawn brief, by id. */
export const openFolds = (root: ParentNode | null | undefined): Set<string> =>
  new Set([...(root?.querySelectorAll<HTMLElement>('[data-brief-session][open]') ?? [])].map((el) => el.dataset.briefSession!))

/** The long prompts and answers a viewer showed in full in a drawn brief, by key. */
export const expandedSaid = (root: ParentNode | null | undefined): Set<string> =>
  new Set([...(root?.querySelectorAll<HTMLInputElement>('input[data-expand]:checked') ?? [])].map((el) => el.dataset.expand!))

type Side = 'prompt' | 'answer'
/** A prompt's or answer's key: a resumed conversation's turns are drawn again in the session that resumed it. */
const saidKey = (t: Brief, turn: Turn, side: Side) => `${t.session.id}:${t.id}:${turn.startedAt}:${side}`

/** The text of a prompt or answer of a brief by its key, as written. */
export const saidText = (briefs: Brief[], key: string): string | undefined => {
  for (const b of briefs) for (const turn of b.turns) for (const side of ['prompt', 'answer'] as const)
    if (saidKey(b, turn, side) === key) return turn[side]
}

/** `latest`: the brief's latest turn, whose answer never folds; `working` whether Claude works on it now. */
type Drawing = { said: BriefView['said']; expanded: ReadonlySet<string>; raw: boolean; latest?: Turn; working: boolean }

const bubbleHtml = (side: Side, key: string, text: string, who: string, d: Drawing, latest: boolean) => {
  const long = !(latest && side === 'answer') && isLong(text)
  const words = d.raw ? `<div class="raw">${esc(text)}</div>` : `<div class="md">${d.said(text)}</div>`
  return `<div class="bubble ${side === 'prompt' ? 'you' : 'claude'}${long ? ' long' : ''}"><header><span class="who">${who}</span><span class="acts"><button type="button" data-copy-said="${esc(key)}" aria-label="copy the ${side} as written">copy</button></span></header>${words}${
    long ? `<label class="more"><input type="checkbox" data-expand="${esc(key)}"${d.expanded.has(key) ? ' checked' : ''}><span class="show">show all</span><span class="hide">fold</span></label>` : ''}</div>`
}

/** A turn's prompt and what came of it: Claude's answer, its work under way on the brief's latest prompt, or no answer. */
function turnHtml(t: Brief, turn: Turn, by: string | undefined, d: Drawing) {
  const since = t.session.startedAt + t.at * 1000
  const asked = `${by ? `FROM ${esc(by)}, WHICH HIRED IT` : 'YOU'} · ${esc(clockAt(turn.startedAt, since))}`
  const latest = turn === d.latest
  const prompt = bubbleHtml('prompt', saidKey(t, turn, 'prompt'), turn.prompt, asked, d, latest)
  const working = latest && d.working
  if (turn.answer === undefined)
    return `<div class="turn">${prompt}<div class="bubble claude ${working ? 'working' : 'none'}"><header><span class="who">CLAUDE${working ? ' · <span class="lamp"></span> working on it' : ' · no answer'}</span></header></div></div>`
  const answered = `CLAUDE · ${esc(clockAt(turn.answeredAt!, since))} · took ${esc(ago(turn.answeredAt! - turn.startedAt))}`
  return `<div class="turn">${prompt}${bubbleHtml('answer', saidKey(t, turn, 'answer'), turn.answer, answered, d, latest)}</div>`
}

/** A session a conversation resumes or is resumed by: by its number when the brief holds it, else by its worker. */
const refName = (ref: SessionRef, parts: BriefPart[]) => {
  const part = parts.find((p) => p.session.id === ref.id)
  return part ? `session ${part.n}` : ref.callsign
}

/** A session's conversations in order, each with its last turns, oldest first. */
const conversationsHtml = (part: BriefPart, parts: BriefPart[], promptBy: BriefView['promptBy'], d: Drawing) =>
  part.threads.map((t, i) => `<section class="brief-conv">
    <h4>conversation ${i + 1} of ${part.threads.length} · ${esc(sessionWhen(part.session.startedAt + t.at * 1000))}${t.resumes ? ` · resumes ${esc(refName(t.resumes, parts))}` : ''}${t.resumedBy ? ` · resumed by ${esc(refName(t.resumedBy, parts))}` : ''}</h4>
    ${t.turns.length ? t.turns.map((turn, j) => turnHtml(t, turn, j === t.turns.length - 1 ? promptBy(t.id) : undefined, d)).join('') : '<p class="none">nothing asked yet</p>'}</section>`).join('')

const markdownBar = (markdown: BriefMarkdown) =>
  `<div class="brief-bar"><div class="seg" role="group" aria-label="prompts and answers">${BRIEF_MARKDOWNS.map((m) =>
    `<button type="button" class="${m === markdown ? 'on' : ''}" data-brief-markdown="${m}" aria-pressed="${m === markdown}" data-tip="${esc(BRIEF_MARKDOWN_MEANS[m])}">${BRIEF_MARKDOWN_LABEL[m]}</button>`).join('')}</div></div>`

export function briefHtml({ briefs, said, promptBy, open, expanded = new Set(), markdown = 'rendered', working = false }: BriefView) {
  const parts = briefParts(briefs)
  const [current, ...earlier] = parts
  if (!current) return '<div class="brief-view"><p class="none">no conversation yet</p></div>'
  const d: Drawing = { said, expanded, raw: markdown === 'raw', latest: current.threads.at(-1)!.turns.at(-1), working }
  const label = (p: BriefPart) => esc(sessionLabel(p.n, p.of, p.session.startedAt))
  return `<div class="brief-view">${markdownBar(markdown)}
    ${earlier.length ? '<h3>earlier sessions</h3>' : ''}
    ${earlier.toReversed().map((p) => `<details class="brief-session" data-brief-session="${esc(p.session.id)}"${open.has(p.session.id) ? ' open' : ''}>
      <summary>${label(p)} · ${plural(p.threads.length, 'conversation')}</summary>${conversationsHtml(p, parts, () => undefined, d)}</details>`).join('')}
    ${earlier.length ? `<h3 class="brief-session-head">${label(current)} · this session</h3>` : ''}
    ${conversationsHtml(current, parts, promptBy, d)}</div>`
}

/** Scoped under `.brief-view`; reads the design's tokens from `/design.css`, and `markdownCss` sets the words. */
export const briefCss = `.brief-view { display: flex; flex-direction: column; gap: 4px; font: 14px/1.55 var(--ui); color: var(--ink); }
.brief-view .brief-bar { position: sticky; top: 0; z-index: 1; display: flex; justify-content: flex-end; padding: 6px 0; background: var(--panel); }
.brief-view .seg { display: flex; gap: 2px; padding: 2px; border-radius: var(--radius); background: var(--sunk); }
.brief-view .seg button { padding: 2px 10px; border: 0; border-radius: 4px; background: none; color: var(--muted); font: 700 12px/1.4 var(--ui); cursor: pointer; }
.brief-view .seg button:hover { color: var(--ink); } .brief-view .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 2px #0003; }
.brief-view h3 { margin: .6em 0 .2em; font: 800 12px/1.4 var(--display); letter-spacing: .08em; color: var(--faint); text-transform: uppercase; }
.brief-view .brief-session-head { margin-top: 1.4em; padding-top: 1em; border-top: 1px solid var(--line); }
.brief-view h4 { margin: 1.2em 0 .5em; font: 800 12px/1.4 var(--display); letter-spacing: .06em; color: var(--muted); text-transform: uppercase; }
.brief-view .brief-conv + .brief-conv { margin-top: 1em; border-top: 1px solid var(--line); }
.brief-view .none { margin: .4em 0; color: var(--faint); font-style: italic; }
.brief-view .turn { display: grid; gap: 8px; margin-bottom: 14px; }
.brief-view .bubble { min-width: 0; padding: 8px 14px 10px; border-radius: 12px; border: 1px solid var(--line); }
.brief-view .bubble.you { justify-self: end; max-width: min(82%, 760px); background: color-mix(in oklab, var(--accent) 12%, var(--panel)); border-color: color-mix(in oklab, var(--accent) 40%, var(--panel)); border-bottom-right-radius: 3px; }
.brief-view .bubble.claude { justify-self: stretch; background: var(--panel-2); border-bottom-left-radius: 3px; }
.brief-view .bubble.working, .brief-view .bubble.none { justify-self: start; }
.brief-view .bubble > header { display: flex; align-items: center; gap: 8px; min-height: 20px; margin-bottom: 4px; font: 700 11px/1.3 var(--ui); letter-spacing: .06em; color: var(--muted); }
.brief-view .bubble.working > header, .brief-view .bubble.none > header { margin: 0; }
.brief-view .bubble.working .lamp { margin: 0 2px 0 4px; vertical-align: -1px; }
.brief-view .bubble > header .acts { margin-left: auto; display: flex; gap: 4px; opacity: .55; }
.brief-view .bubble:hover > header .acts, .brief-view .bubble > header .acts:focus-within { opacity: 1; }
.brief-view .bubble > header button { padding: 0 7px; font: 600 11px/1.6 var(--ui); letter-spacing: 0; color: var(--muted); background: none; border: 1px solid var(--line); border-radius: 4px; cursor: pointer; }
.brief-view .bubble > header button:hover { color: var(--ink); }
.brief-view .raw { white-space: pre-wrap; overflow-wrap: anywhere; font: 12.5px/1.55 var(--mono); font-variant-ligatures: none; }
.brief-view .long > :is(.md, .raw) { max-height: 18em; overflow: hidden; mask-image: linear-gradient(#000 65%, transparent); }
.brief-view .long:has(.more input:checked) > :is(.md, .raw) { max-height: none; mask-image: none; }
.brief-view .more { display: inline-block; margin-top: 4px; font: 700 12px/1.4 var(--ui); color: var(--accent); cursor: pointer; }
.brief-view .bubble.you :is(.md a, .more) { color: var(--ink); text-decoration: underline; }
.brief-view .more input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.brief-view .more:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
.brief-view .more .hide, .brief-view .more:has(input:checked) .show { display: none; } .brief-view .more:has(input:checked) .hide { display: inline; }
.brief-view .brief-session { margin: .3em 0; border: 1px solid var(--line); border-radius: var(--radius); padding: 0 12px; }
.brief-view .brief-session[open] { padding-bottom: 6px; }
.brief-view .brief-session > summary { cursor: pointer; padding: 8px 0; font: 800 12px/1.4 var(--display); letter-spacing: .08em; color: var(--muted); text-transform: uppercase; }`
