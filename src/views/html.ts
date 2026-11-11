import { esc } from '/lib/words.js'
import { type Body, type Drawn, typeView, versioned } from '../shared/view-item.ts'
import { PASSAGE_RULES, pickPassages, reportedSource } from '../shared/view-passages.ts'

/**
 * `tower/html`, the html view: the page framed where it runs at an origin of its own, with no API. A page a worker
 * showed, served by the tower with `/frame-picks.js` appended, reports what is picked in it, and the pick is a
 * `passage` of the showing (`reportedSource`), heard only from that page, by the token it alone is given: once it
 * navigates anywhere else, nothing it says is a pick. A kept item's page reports to no one.
 */

const RULES = `& .html-split { position: relative; flex: 1; min-width: 0; display: flex; }
  & .html-split > iframe { flex: 1; min-width: 0; }
  ${PASSAGE_RULES}`

const frameHtml = (at: Body) =>
  `<iframe class="page" title="${esc(at.title)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock" allow="clipboard-write" src="${versioned(at)}"></iframe>`

/** Whether `at` draws a file a worker showed: the one kind of html page whose picks are passages. */
const shownFile = (at: Body) => at.subject.kind === 'shown' && (at.subject.value as { kind: string }).kind === 'file'

function draw(el: HTMLElement, at: Body): Drawn | undefined {
  if (!shownFile(at)) return void (el.innerHTML = frameHtml(at))
  el.innerHTML = `<div class="html-split">${frameHtml(at)}</div>`
  const split = el.querySelector<HTMLElement>('.html-split')!
  const frame = split.querySelector('iframe')!
  const picks = pickPassages(frame, split, at.kit, at.subject, reportedSource(frame))
  return { update: () => picks.update(), visible: (on) => picks.visible(on), close: () => picks.close() }
}

export const mount = typeView({ id: 'tower/html', rules: RULES, draw, restyled: false })
