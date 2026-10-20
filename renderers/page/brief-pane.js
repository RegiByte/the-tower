import { drawPanel } from '/panels.js'
import { $, copyText } from './kit.js'
import { briefHtml, expandedSaid, openFolds, saidText } from '/brief.js'
import { markdownHtml } from '/markdown.js'

/**
 * @import { Card } from '../../src/bridge/board.ts'
 * @import { Brief } from '../../src/bridge/turns.ts'
 * @import { BriefMarkdown } from '../../src/shared/brief.ts'
 * @import { Viewer } from '../../src/shared/viewer.ts'
 */

/**
 * @typedef {{
 *   findCard: (id: string | undefined) => Card | undefined,
 *   viewer: () => Viewer,
 *   keepViewer: <K extends keyof Viewer>(field: K, value: Viewer[K]) => void,
 *   drawSettings: () => false | void,
 * }} BriefPaneDeps
 */

/**
 * The selected worker's brief (`/brief.js`): its conversations' last turns, drawn in the viewer's markdown, kept at
 * the end while the viewer reads there, and a prompt or answer copied.
 * @param {BriefPaneDeps} deps
 */
export function briefPane(deps) {
  const { findCard, viewer, keepViewer, drawSettings } = deps
  /** The brief drawn last, the worker's and its conversations as read: what a copy reads its text from. @type {{ id: string, threads: Brief[] } | undefined} */
  let briefShown

  /**
   * The worker's earlier sessions folded, then its session's conversations, each turn's prompt and answer, the latest at
   * the bottom. Opening a worker's brief scrolls to its end, and a redraw stays at the end when the viewer was there.
   * @param {Card} c
   * @param {Brief[]} threads
   */
  function showBrief(c, threads) {
    const el = $('brief')
    const same = briefShown?.id === c.id
    const atEnd = !same || el.scrollHeight - el.scrollTop - el.clientHeight < 48
    briefShown = { id: c.id, threads }
    drawBrief(same)
    if (atEnd) el.scrollTop = el.scrollHeight
  }

  /** Draws the brief shown. */
  function drawBrief(same = true) {
    const el = $('brief')
    const shown = /** @type {NonNullable<typeof briefShown>} */ (briefShown)
    const c = findCard(shown.id)
    /** @param {string} id */
    const promptBy = (id) => c?.conversations.find((conv) => conv.id === id)?.promptBy
    const open = same ? openFolds(el) : new Set()
    const expanded = same ? expandedSaid(el) : new Set()
    drawPanel(el, briefHtml({ briefs: shown.threads, said: markdownHtml, promptBy, open, expanded, markdown: viewer().briefMarkdown, working: c?.status === 'working' }), {})
  }

  /** Draws the brief again, while one is shown. */
  const redrawBrief = () => briefShown && drawBrief()

  /** The prompt or the answer `said` names in the brief shown, copied. @param {string} said */
  const copySaid = (said) => copyText(/** @type {string} */ (saidText(/** @type {NonNullable<typeof briefShown>} */ (briefShown).threads, said)), said.endsWith(':prompt') ? 'the prompt' : 'the answer')

  /** @param {BriefMarkdown} markdown */
  function chooseBriefMarkdown(markdown) {
    keepViewer('briefMarkdown', markdown)
    if (briefShown) drawBrief()
    drawSettings()
  }

  return { showBrief, redrawBrief, copySaid, chooseBriefMarkdown }
}
