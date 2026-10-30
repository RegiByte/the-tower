import { esc } from '../shared/cards.ts'
import { sectionLabels, sectionsHtml, sectionsOf } from '../shared/markdown.ts'
import { sectionSubject, type Subject } from '../shared/subjects.ts'
import type { RegionHandle } from '../shared/views.ts'
import { followLink } from './frame.ts'
import { bodyText, frameDoc, typeView, type Body, type Drawn } from './item.ts'

/**
 * `tower/document`, the markdown view, of a kept item or a showing: the document drawn in a frame where nothing runs,
 * raw HTML kept and images read beside it, split into its sections (`sectionsOf`). Each section is a viewer subject
 * on the page's bus, and takes the commands offered on it in a gutter beside the frame (`section.acts`), one row per
 * section kept level with it; the gutter is hidden while no row holds any.
 */

const RULES = `& .doc-split { flex: 1; min-width: 0; display: flex; }
  & .doc-split > iframe { flex: 1; min-width: 0; border: 0; background: var(--panel); }
  & .doc-gutter { position: relative; flex: none; width: 168px; overflow: hidden; border-left: 1px solid var(--line); background: var(--panel); }
  & .doc-row { position: absolute; top: 0; left: 0; right: 0; display: grid; gap: var(--sp-2xs); padding: var(--sp-xs) var(--sp-m); background: var(--panel); }
  & .doc-row > .doc-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-size: var(--fs-xs); }`

/** A section's row in the gutter: its label, and the element its region fills. */
type Row = { el: HTMLElement; acts: HTMLElement }

/**
 * Where each row sits, from its section's anchor's top and the rows' heights, both as read in one frame: level with
 * its anchor, never over the row before it.
 */
const rowTops = (anchors: number[], heights: number[]) =>
  anchors.reduce<number[]>((tops, top, i) => [...tops, i ? Math.max(top, tops[i - 1] + heights[i - 1]) : top], [])

/**
 * Keeps the gutter's rows level with their sections' anchors in the frame (decision `markdown-safe`): on the frame's
 * load, a resize of its body, and a scroll anywhere in its document (heard in the capture phase, so a scrolling body
 * or inner scroller is heard too), at most one animation frame, which reads every anchor and row, then writes every
 * row. `visible(false)` stops hearing until `visible(true)`, which reads once; `close` ends it.
 */
function followSections(frame: HTMLIFrameElement, anchors: HTMLElement[], rows: HTMLElement[]) {
  const doc = frame.contentDocument!
  let pending = 0
  let seen = true
  const place = () => {
    pending = 0
    const tops = rowTops(anchors.map((a) => a.getBoundingClientRect().top), rows.map((r) => r.offsetHeight))
    rows.forEach((row, i) => void (row.style.transform = `translateY(${tops[i]}px)`))
  }
  const schedule = () => {
    if (seen && !pending) pending = requestAnimationFrame(place)
  }
  const resized = new ResizeObserver(schedule)
  const hear = () => resized.observe(doc.body)
  const stop = () => {
    resized.disconnect()
    cancelAnimationFrame(pending)
    pending = 0
  }
  doc.addEventListener('scroll', schedule, { capture: true, passive: true })
  hear()
  schedule()
  return {
    visible(on: boolean) {
      if (on === seen) return
      seen = on
      if (!on) return stop()
      hear()
      schedule()
    },
    /** The rows' sizes changed: what they hold. */
    replace: schedule,
    close() {
      stop()
      doc.removeEventListener('scroll', schedule, { capture: true })
    },
  }
}

/**
 * The document drawn by sections. Once the frame has loaded the shell it wrote, each section's element is made with
 * the frame's document, filled there and held by reference as its anchor: never looked up, never filled on a node of
 * the page's own document, where an `onerror` in raw HTML would run as the tower. A frame that navigated away holds a
 * document this didn't write, and nothing is bound there.
 */
async function draw(el: HTMLElement, at: Body): Promise<Drawn | undefined> {
  const text = await bodyText(el, at)
  if (text === undefined || at.stale()) return
  const { tower, kit, subject, title, url, docCss } = at
  const sections = sectionsOf(text)
  const subjects = sections.map((s) => sectionSubject(subject, s))
  const labels = sectionLabels(sections)
  el.innerHTML = `<div class="doc-split"><iframe title="${esc(title)}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe><div class="doc-gutter" role="group" aria-label="on each section" hidden></div></div>`
  const frame = el.querySelector('iframe')!
  const gutter = el.querySelector<HTMLElement>('.doc-gutter')!

  const rows: Row[] = labels.map((label) => {
    const row = document.createElement('div')
    row.className = 'doc-row'
    row.innerHTML = `<span class="doc-label" data-tip="${esc(label)}">${esc(label)}</span><span class="doc-acts"></span>`
    gutter.append(row)
    return { el: row, acts: row.querySelector<HTMLElement>('.doc-acts')! }
  })
  const regions: RegionHandle[] = rows.map((row, i) => kit.region(row.acts, 'section.acts', subjects[i]))
  for (const s of subjects) kit.bus.publish(s, subject.key)
  const fit = () => void (gutter.hidden = !rows.some((r) => r.acts.childElementCount))
  fit()

  let anchors: HTMLElement[] = []
  let follow: ReturnType<typeof followSections> | undefined
  let wanted: Subject | undefined
  let unlisten = () => {}
  let closed = false
  let seen = true

  const scrollTo = (s: Subject) => {
    const i = subjects.findIndex((t) => t.key === s.key)
    if (i < 0) return false
    if (!anchors.length) return ((wanted = s), true)
    anchors[i].scrollIntoView({ block: 'start' })
    return true
  }

  frame.addEventListener('load', function bind() {
    frame.removeEventListener('load', bind)
    const doc = frame.contentDocument
    if (closed || !doc) return
    const article = doc.createElement('article')
    anchors = sectionsHtml(text, url).map((html) => {
      const section = doc.createElement('div')
      section.innerHTML = html
      article.append(section)
      return section
    })
    doc.body.append(article)
    const onLink = followLink(doc, { here: () => false, toast: kit.toast })
    doc.addEventListener('click', onLink)
    unlisten = () => doc.removeEventListener('click', onLink)
    follow = followSections(frame, anchors, rows.map((r) => r.el))
    if (!seen) follow.visible(false)
    if (wanted) scrollTo(wanted)
  })
  frame.srcdoc = frameDoc(tower, docCss, '')

  return {
    update() {
      regions.forEach((r, i) => r.update(subjects[i]))
      fit()
      follow?.replace()
    },
    show: (s) => s.kind === 'section' && scrollTo(s),
    visible(on) {
      seen = on
      follow?.visible(on)
    },
    close() {
      closed = true
      follow?.close()
      unlisten()
      regions.forEach((r) => r.close())
      for (const s of subjects) kit.bus.clear(s.key)
    },
  }
}

export const mount = typeView({ id: 'tower/document', rules: RULES, draw, restyled: true })
