/**
 * A worker's brief as every renderer draws it: the conversations of each session it ran as, the session it was read
 * for in full and each earlier one folded, latest first, and the label a session goes by. Pure views from plain data
 * to html, with one stylesheet (`briefCss`). The tower serves it as `/brief.js`.
 * An earlier session's fold is a `<details data-brief-session="<id>">`, open when drawn only if its id is in `open`:
 * a renderer that redraws a brief reads the open ones first (`openFolds`).
 */
import type { CardShown, LineageSession } from '../bridge/board.ts'
import type { SessionRef } from '../bridge/chains.ts'
import type { Brief, BriefSession } from '../bridge/turns.ts'
import { esc, plural } from './cards.ts'

/** One session's part of a brief: its place in the worker's lineage (`n` of `of`, from 1) and its conversations, in order. */
export type BriefPart = { session: BriefSession; n: number; of: number; threads: Brief[] }

/** A brief by session, in the order it lists them: the session it was read for, then the earlier ones, latest first. */
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
 * A brief: `said` sets a prompt's or an answer's text as html (markdown in a frame where nothing runs, or escaped
 * text); `promptBy` names the hirer whose prompt opened a conversation of the session the brief was read for; `open`
 * holds the earlier sessions unfolded.
 */
export type BriefView = { briefs: Brief[]; said: (text: string) => string; promptBy: (conversation: string) => string | undefined; open: ReadonlySet<string> }

/** The earlier sessions unfolded in a drawn brief, by id. */
export const openFolds = (root: ParentNode | null | undefined): Set<string> =>
  new Set([...(root?.querySelectorAll<HTMLElement>('[data-brief-session][open]') ?? [])].map((el) => el.dataset.briefSession!))

const turnsHtml = (t: Brief, said: BriefView['said'], by: string | undefined) =>
  t.turns.length
    ? t.turns.toReversed().map((turn, i) => `<div class="who">${i === 0 && by ? `PROMPT · FROM ${esc(by)}, WHICH HIRED IT` : 'YOUR PROMPT'} · ${esc(sessionWhen(turn.startedAt))}</div>
      <div class="you">${said(turn.prompt)}</div><div class="who">CLAUDE'S ANSWER</div><div class="claude">${turn.answer === undefined ? '<p><i>working on it</i></p>' : said(turn.answer)}</div>`).join('')
    : '<p><i>nothing asked yet</i></p>'

/** A session a conversation resumes or is resumed by: by its number when the brief holds it, else by its worker. */
const refName = (ref: SessionRef, parts: BriefPart[]) => {
  const part = parts.find((p) => p.session.id === ref.id)
  return part ? `session ${part.n}` : ref.callsign
}

/** A session's conversations, latest first, each with its last turns, latest first. */
const conversationsHtml = (part: BriefPart, parts: BriefPart[], said: BriefView['said'], promptBy: (conversation: string) => string | undefined) =>
  part.threads.map((t, i) => `<section class="brief-conv">
    <h4>conversation ${i + 1} of ${part.threads.length} · ${esc(sessionWhen(part.session.startedAt + t.at * 1000))}${t.resumes ? ` · resumes ${esc(refName(t.resumes, parts))}` : ''}${t.resumedBy ? ` · resumed by ${esc(refName(t.resumedBy, parts))}` : ''}</h4>
    ${turnsHtml(t, said, promptBy(t.id))}</section>`).reverse().join('')

export function briefHtml({ briefs, said, promptBy, open }: BriefView) {
  const parts = briefParts(briefs)
  const [current, ...earlier] = parts
  if (!current) return '<div class="brief-view"><p><i>no conversation yet</i></p></div>'
  const label = (p: BriefPart) => esc(sessionLabel(p.n, p.of, p.session.startedAt))
  return `<div class="brief-view">${earlier.length ? `<h3 class="brief-session-head">${label(current)} · this session</h3>` : ''}
    ${conversationsHtml(current, parts, said, promptBy)}
    ${earlier.length ? `<h3 class="brief-earlier">earlier sessions</h3>` : ''}
    ${earlier.map((p) => `<details class="brief-session" data-brief-session="${esc(p.session.id)}"${open.has(p.session.id) ? ' open' : ''}>
      <summary>${label(p)} · ${plural(p.threads.length, 'conversation')}</summary>${conversationsHtml(p, parts, said, () => undefined)}</details>`).join('')}</div>`
}

/** Scoped under `.brief-view`; reads the design's tokens from `/design.css`. */
export const briefCss = `.brief-view h3 { margin: 0 0 .2em; font: 800 12px/1.4 var(--display); letter-spacing: .08em; color: var(--faint); text-transform: uppercase; }
.brief-view .brief-earlier { margin-top: 2em; padding-top: 1em; border-top: 1px solid var(--line); }
.brief-view h4 { margin: 1.2em 0 .4em; font: 800 13px/1.4 var(--display); letter-spacing: .06em; color: var(--muted); text-transform: uppercase; }
.brief-view .brief-conv + .brief-conv { margin-top: 1.6em; border-top: 1px solid var(--line); }
.brief-view .who { margin: 1em 0 .3em; font: 700 11px/1 var(--ui); letter-spacing: .08em; color: var(--faint); }
.brief-view .you, .brief-view .claude { padding-left: 14px; border-left: 3px solid var(--line); } .brief-view .you { border-color: var(--accent); } .brief-view .claude { border-color: var(--ink); }
.brief-view .you > :first-child, .brief-view .claude > :first-child { margin-top: 0; }
.brief-view .plain { white-space: pre-wrap; margin: 0; }
.brief-view .brief-session { margin: .5em 0; border: 1px solid var(--line); border-radius: var(--radius); padding: 0 12px; }
.brief-view .brief-session[open] { padding-bottom: 12px; }
.brief-view .brief-session > summary { cursor: pointer; padding: 8px 0; font: 800 12px/1.4 var(--display); letter-spacing: .08em; color: var(--muted); text-transform: uppercase; }`
