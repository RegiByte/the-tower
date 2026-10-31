import { esc } from '../shared/cards.ts'
import { sectionLabels, sectionsHtml, sectionsOf } from '../shared/markdown.ts'
import { sectionSubject, type Subject } from '../shared/subjects.ts'
import type { Tower } from '../shared/shelf-page.ts'
import type { Kit, RegionHandle } from '../shared/views.ts'
import { contain, DOCUMENT_SANDBOX, writeLinks, type LinkTo } from './frame.ts'
import { frameDoc, type Drawn } from './item.ts'

/**
 * A markdown document drawn by sections (`sectionsOf`), as `tower/document` and `tower/shelf` draw one: in a frame
 * where nothing runs, raw HTML kept and images read beside it. Each section is a viewer subject on the page's bus, of
 * the subject whose document it is, and takes the commands offered on it in a gutter beside the frame
 * (`section.acts`), one row per section kept level with it; the gutter is hidden while no row holds any. A section
 * marked on the bus (`Bus.mark`) is drawn marked, its marks' labels on its row and its part of the frame lit.
 */

/** The look of a document drawn by sections, inside the view that draws it. */
export const SECTIONS_RULES = `& .doc-split { flex: 1; min-width: 0; display: flex; }
  & .doc-split > iframe { flex: 1; min-width: 0; border: 0; background: var(--panel); }
  & .doc-gutter { position: relative; flex: none; width: min(168px, 30%); overflow: hidden; border-left: 1px solid var(--line); background: var(--panel); }
  & .doc-row { position: absolute; top: 0; left: 0; right: 0; display: grid; gap: var(--sp-2xs); padding: var(--sp-xs) var(--sp-m); background: var(--panel); }
  & .doc-row > .doc-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-size: var(--fs-xs); }
  & .doc-row > .doc-acts { display: flex; flex-wrap: wrap; gap: var(--sp-2xs); }
  & .doc-row.marked { box-shadow: inset 3px 0 0 var(--ink); }
  & .doc-row.marked > .doc-label { color: var(--ink); font-weight: 700; }`

/** How a marked section reads in the frame, beside the document's own styles. */
const MARKED_CSS = `.tower-marked { box-shadow: -3px 0 0 var(--ink); background: color-mix(in oklab, var(--ink) 5%, transparent); }`

/** A section's row in the gutter: its label, and the element its region fills. */
type Row = { el: HTMLElement; label: HTMLElement; acts: HTMLElement }

/**
 * Where each row sits, from its section's anchor's top and the rows' heights, both as read in one frame: level with
 * its anchor, never over the row before it.
 */
const rowTops = (anchors: number[], heights: number[]) =>
  anchors.reduce<number[]>((tops, top, i) => [...tops, i ? Math.max(top, tops[i - 1] + heights[i - 1]) : top], [])

/**
 * Keeps the gutter's rows level with their sections' anchors in the frame (decision `markdown-safe`). Nothing is heard
 * inside a frame where nothing runs, so each animation frame while seen reads the frame's scroll position, and when it
 * or the size of the frame's body changed, reads every anchor and row, then writes every row. `visible(false)` stops
 * until `visible(true)`, which places the rows again; `close` ends it.
 */
function followSections(frame: HTMLIFrameElement, anchors: HTMLElement[], rows: HTMLElement[]) {
  const win = frame.contentWindow!
  const doc = frame.contentDocument!
  let tick = 0
  let seen = true
  let moved = true
  let scrolled = win.scrollY
  const place = () => {
    const tops = rowTops(anchors.map((a) => a.getBoundingClientRect().top), rows.map((r) => r.offsetHeight))
    rows.forEach((row, i) => void (row.style.transform = `translateY(${tops[i]}px)`))
  }
  const look = () => {
    tick = requestAnimationFrame(look)
    if (win.scrollY !== scrolled) (scrolled = win.scrollY), (moved = true)
    if (moved) (moved = false), place()
  }
  const resized = new ResizeObserver(() => void (moved = true))
  const start = () => {
    resized.observe(doc.body)
    moved = true
    tick = requestAnimationFrame(look)
  }
  const stop = () => {
    resized.disconnect()
    cancelAnimationFrame(tick)
  }
  start()
  return {
    visible(on: boolean) {
      if (on === seen) return
      seen = on
      if (on) start()
      else stop()
    },
    /** The rows' sizes changed: what they hold. */
    replace: () => void (moved = true),
    close: stop,
  }
}

/**
 * What a document drawn by sections is drawn from: `of`, the subject whose document it is (its sections' parent);
 * `text`, its markdown; `url`, where it is served, which its images and links are read against; `title`, the
 * frame's; `docCss`, the frame's styles beside the design's; `links`, where each link in the frame goes; `opened`,
 * told the frame's document once it is drawn, unless a section was asked for first.
 */
export type Sectioned = {
  tower: Tower
  kit: Kit
  of: Subject
  text: string
  url: string
  title: string
  docCss: string
  links: (doc: Document) => (href: string) => LinkTo | undefined
  opened?: (doc: Document) => void
}

/**
 * `at`'s document drawn by sections into `el`. Once the frame has loaded the shell it wrote, each section's element is
 * made with the frame's document, filled there and held by reference as its anchor: never looked up, never filled on
 * a node of the page's own document, where an `onerror` in raw HTML would run as the tower. A frame that navigated
 * away holds a document this didn't write, and nothing is bound there.
 */
export function drawSections(el: HTMLElement, at: Sectioned): Drawn {
  const { kit, of, text, url, title } = at
  const sections = sectionsOf(text)
  const subjects = sections.map((s) => sectionSubject(of, s))
  const labels = sectionLabels(sections)
  el.innerHTML = `<div class="doc-split"><iframe title="${esc(title)}" sandbox="${DOCUMENT_SANDBOX}"></iframe><div class="doc-gutter" role="group" aria-label="on each section" hidden></div></div>`
  const frame = el.querySelector('iframe')!
  const gutter = el.querySelector<HTMLElement>('.doc-gutter')!

  const rows: Row[] = labels.map((label) => {
    const row = document.createElement('div')
    row.className = 'doc-row'
    row.innerHTML = `<span class="doc-label" data-tip="${esc(label)}">${esc(label)}</span><span class="doc-acts"></span>`
    gutter.append(row)
    return { el: row, label: row.querySelector<HTMLElement>('.doc-label')!, acts: row.querySelector<HTMLElement>('.doc-acts')! }
  })
  const regions: RegionHandle[] = rows.map((row, i) => kit.region(row.acts, 'section.acts', subjects[i]))
  for (const s of subjects) kit.bus.publish(s, of.key)
  const fit = () => void (gutter.hidden = !rows.some((r) => r.acts.childElementCount))
  fit()

  let anchors: HTMLElement[] = []
  let follow: ReturnType<typeof followSections> | undefined
  let wanted: Subject | undefined
  let closed = false
  let seen = true

  const drawMarks = () =>
    subjects.forEach((s, i) => {
      const marks = kit.bus.marks(s.key)
      const label = marks.length ? `${marks.map((m) => m.label).join(' · ')} · ${labels[i]}` : labels[i]
      rows[i].el.classList.toggle('marked', marks.length > 0)
      rows[i].label.textContent = label
      rows[i].label.dataset.tip = label
      anchors[i]?.classList.toggle('tower-marked', marks.length > 0)
    })
  const unheard = kit.bus.on('section', drawMarks)
  drawMarks()

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
      contain(section)
      article.append(section)
      return section
    })
    doc.body.append(article)
    doc.head.append(Object.assign(doc.createElement('style'), { textContent: MARKED_CSS }))
    drawMarks()
    writeLinks(doc, at.links(doc))
    follow = followSections(frame, anchors, rows.map((r) => r.el))
    if (!seen) follow.visible(false)
    if (wanted) scrollTo(wanted)
    else at.opened?.(doc)
  })
  frame.srcdoc = frameDoc(at.tower, at.docCss, '')

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
      unheard()
      follow?.close()
      regions.forEach((r) => r.close())
      for (const s of subjects) kit.bus.clear(s.key)
    },
  }
}
