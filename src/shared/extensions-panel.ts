/**
 * The Extensions panel: every extension the tower found, as `board.extensions` holds it, those that should run and
 * don't first. The full panel says each one's state, version, where it is off, what it tells workers, what it declares
 * and every problem with its fix; the list says each in a line with its problems under it, for a popover. Gathered by
 * `panels.ts`.
 *
 * The protocol a renderer wires, by the attribute on the element clicked (`closest`):
 *
 *   data-extension="<id>"   an extension's entry: the list's row opens it in the full panel, where `extensionAnchor`
 *                           names its element
 */
import type { Attention } from '../bridge/life.ts'
import type { ExtensionProblem, ExtensionView } from './extensions.ts'
import { EXTENSION_ATTENTION, EXTENSION_STATE_NAME, PROBLEM_FIX, problemLine } from './extension-words.ts'
import { domId } from './dom-id.ts'
import { esc, plural } from './format.ts'

const ATTENTION_RANK: Record<Attention, number> = { broken: 0, needs: 1, working: 2, ready: 3, quiet: 4 }

/** The extensions in the order the panel lists them: broken first, then restarting or not started, the rest as the board has them. */
export const extensionsInOrder = (extensions: readonly ExtensionView[]): ExtensionView[] =>
  extensions.map((e, i) => ({ e, i })).sort((a, b) => ATTENTION_RANK[EXTENSION_ATTENTION[a.e.state]] - ATTENTION_RANK[EXTENSION_ATTENTION[b.e.state]] || a.i - b.i).map(({ e }) => e)

/** The extensions that should run and don't: refused or failed. */
export const brokenExtensions = (extensions: readonly ExtensionView[]): ExtensionView[] => extensions.filter((e) => EXTENSION_ATTENTION[e.state] === 'broken')

/** The loudest attention of the extensions, for a lamp that stands for all of them. */
export const extensionsAttention = (extensions: readonly ExtensionView[]): Attention =>
  extensions.map((e) => EXTENSION_ATTENTION[e.state]).reduce<Attention>((a, b) => (ATTENTION_RANK[b] < ATTENTION_RANK[a] ? b : a), 'quiet')

/** The extensions in a few words: `7 extensions`, or how many of them are broken. */
export const extensionsSummary = (extensions: readonly ExtensionView[]): string => {
  const broken = brokenExtensions(extensions).length
  return broken ? `${plural(broken, 'extension')} not running, of ${extensions.length}` : plural(extensions.length, 'extension')
}

/** The id of an extension's entry in the full panel. */
export const extensionAnchor = (id: string) => `extension-${id}`

/** Its problems worth showing: errors and warnings. */
const shownProblems = (e: ExtensionView): ExtensionProblem[] => e.problems.filter((p) => p.level !== 'info')

const problemTone = (p: ExtensionProblem) => (p.level === 'error' ? 'broken' : 'working')
const timesHtml = (p: ExtensionProblem) => (p.count > 1 ? ` <span class="times">×${p.count}</span>` : '')

/** A problem in full, with what fixes it. */
const problemHtml = (p: ExtensionProblem) =>
  `<li class="problem ${problemTone(p)}">${esc(problemLine(p))}${timesHtml(p)}<small class="fix">${esc(PROBLEM_FIX[p.code])}</small></li>`

/** A problem in a line, inside a button: phrasing content only. */
const problemLineHtml = (p: ExtensionProblem) => `<span class="problem ${problemTone(p)}">${esc(problemLine(p))}${timesHtml(p)}</span>`

/** The kinds of things it declares, counted: `2 verbs · 3 reads · 1 view`. */
const declaredLine = (e: ExtensionView) =>
  (
    [
      [e.verbs.length, 'verb'],
      [e.reads.length, 'read'],
      [e.facts.length, 'fact'],
      [e.commands.length, 'command'],
      [e.views.length, 'view'],
      [e.slots.length, 'slot'],
      [e.subjects.length, 'subject kind'],
    ] as const
  )
    .filter(([n]) => n)
    .map(([n, noun]) => plural(n, noun))
    .join(' · ')

const stateHtml = (e: ExtensionView) => `<span class="state">${esc(EXTENSION_STATE_NAME[e.state])}</span>`

/** One extension in full: its head, where it is off, what it tells workers, what it declares, and every problem with its fix. */
const entryHtml = (e: ExtensionView) => {
  const declared = declaredLine(e)
  const problems = shownProblems(e)
  return `<section class="extension-entry ${EXTENSION_ATTENTION[e.state]}" id="${esc(extensionAnchor(e.id))}" data-extension="${esc(e.id)}">
  <div class="head"><span class="lamp"></span><b class="title">${esc(e.title)}</b>${e.version ? `<span class="version">${esc(e.version)}</span>` : ''}${stateHtml(e)}
    <span class="whose" data-tip="${esc(e.bundled ? 'ships with the tower' : "the user's own, from the config's extensions")}">${e.bundled ? 'bundled' : 'your own'}</span></div>
  <div class="ids"><code>${esc(e.id)}</code>${e.provides === e.id ? '' : ` provides <code>${esc(e.provides)}</code>`}${e.off?.length ? ` · off on ${esc(e.off.join(', '))}` : ''}</div>
  ${e.guidance ? `<p class="brief">${esc(e.guidance.brief)}</p>` : ''}
  ${declared ? `<div class="declared">${esc(declared)}</div>` : ''}
  ${problems.length ? `<ul class="problems">${problems.map(problemHtml).join('')}</ul>` : ''}
</section>`
}

/** The full panel: every extension, broken first. */
export const extensionsPanelHtml = (extensions: readonly ExtensionView[]): string =>
  `<div class="extensions-panel">${extensions.length ? extensionsInOrder(extensions).map(entryHtml).join('') : '<p class="none">The tower runs no extension.</p>'}</div>`

/** The short list: each extension in a line, its problems under it without their fixes, each row a button to its entry, its id `domId('ext', id)`. */
export const extensionsListHtml = (extensions: readonly ExtensionView[]): string =>
  `<div class="extensions-list">${extensionsInOrder(extensions)
    .map((e) => {
      const problems = shownProblems(e)
      return `<button class="extension-row ${EXTENSION_ATTENTION[e.state]}" id="${esc(domId('ext', e.id))}" data-extension="${esc(e.id)}"><span class="line"><span class="lamp"></span><b>${esc(e.title)}</b>${stateHtml(e)}</span>${
        problems.length ? `<span class="problems">${problems.map(problemLineHtml).join('')}</span>` : ''
      }</button>`
    })
    .join('') || '<p class="none">The tower runs no extension.</p>'}</div>`
