import { esc } from '../shared/cards.ts'
import { loop, timers } from '../shared/loop.ts'
import { linesPicked, SOURCE_MARK, sectionLabels, sectionsHtml, sectionsOf, type Section, type SourceLines } from '../shared/markdown.ts'
import { PICK_HANDLERS, PICK_START, type PickEffect, type PickEvent, type PickState } from '../shared/picks.ts'
import { passageSubject, sectionSubject, type Passage, type Subject } from '../shared/subjects.ts'
import type { Tower } from '../shared/shelf-page.ts'
import type { Kit, RegionHandle } from '../shared/views.ts'
import { contain, DOCUMENT_SANDBOX, writeLinks, type LinkTo } from './frame.ts'
import { frameDoc, type Drawn } from './item.ts'

/**
 * A markdown document drawn by sections (`sectionsOf`), as `tower/document` and `tower/shelf` draw one: in a frame
 * where nothing runs, raw HTML kept and images read beside it. Each section is a viewer subject on the page's bus, of
 * the subject whose document it is, and takes the commands offered on it in a gutter beside the frame
 * (`section.acts`), one row per section kept level with it; the gutter is hidden while no row holds any. A section
 * marked on the bus (`Bus.mark`) is drawn marked, its marks' labels on its row and its part of the frame lit. Text
 * picked in the frame is a `passage` subject of the document (`/picks.js` says when a selection is a pick), lit in
 * the frame by a highlight and not by an element, with what acts on it (`passage.acts`) in a box over the frame, under
 * the passage or over it where there is no room below: in the page's own document, never in the frame's.
 */

/** The look of a document drawn by sections, inside the view that draws it. */
export const SECTIONS_RULES = `& .doc-split { position: relative; flex: 1; min-width: 0; display: flex; }
  & .doc-passage { position: absolute; top: 0; left: 0; z-index: 2; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel);
    box-shadow: 0 8px 28px color-mix(in oklab, var(--ink) 18%, transparent); }
  & .doc-passage[hidden] { display: none; }
  & .doc-passage.moving { visibility: hidden; }
  & .doc-split > iframe { flex: 1; min-width: 0; border: 0; background: var(--panel); }
  & .doc-gutter { position: relative; flex: none; width: min(168px, 30%); overflow: hidden; border-left: 1px solid var(--line); background: var(--panel); }
  & .doc-row { position: absolute; top: 0; left: 0; right: 0; display: grid; gap: var(--sp-2xs); padding: var(--sp-xs) var(--sp-m); background: var(--panel); }
  & .doc-row > .doc-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-size: var(--fs-xs); }
  & .doc-row > .doc-acts { display: flex; flex-wrap: wrap; gap: var(--sp-2xs); }
  & .doc-row.marked { box-shadow: inset 3px 0 0 var(--ink); }
  & .doc-row.marked > .doc-label { color: var(--ink); font-weight: 700; }`

/** How a marked section reads in the frame, beside the document's own styles. */
const MARKED_CSS = `.tower-marked { box-shadow: -3px 0 0 var(--ink); background: color-mix(in oklab, var(--ink) 5%, transparent); }
::highlight(tower-passage) { background-color: color-mix(in oklab, var(--accent) 28%, transparent); }`

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
 * or the size of the frame's body changed, reads every anchor and row, then writes every row; then runs `each`, what
 * else reads the frame on every animation frame. `visible(false)` stops until `visible(true)`, which places the rows
 * again; `close` ends it.
 */
function followSections(frame: HTMLIFrameElement, anchors: HTMLElement[], rows: HTMLElement[], each: () => void) {
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
    each()
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

/** Where a passage's worker and file are: the subject of the document it is in, a showing or a file of a checkout. */
function passageFrom(of: Subject): Pick<Passage, 'of' | 'project' | 'card' | 'file'> {
  const v = of.value as { card?: string; kind?: string; target?: string; file?: string }
  const file = of.kind === 'shown' && v.kind === 'file' ? v.target : of.kind === 'file' ? v.file : undefined
  return { of: of.key, ...(of.project !== undefined && { project: of.project }), ...(v.card !== undefined && { card: v.card }), ...(file !== undefined && { file }) }
}

/** Each node a selection's ends are in, by a number of this page's: a signature is a string. */
const nodeIds = new WeakMap<Node, number>()
let lastNodeId = 0
const nodeId = (node: Node) => nodeIds.get(node) ?? (nodeIds.set(node, ++lastNodeId), lastNodeId)

/** A selection's signature, as `/picks.js` is told it: its ends; none while it is collapsed or outside the body. */
function selectionSig(doc: Document): string | undefined {
  const selection = doc.getSelection()
  if (!selection?.rangeCount || selection.isCollapsed || !doc.body.contains(selection.getRangeAt(0).commonAncestorContainer)) return undefined
  return `${nodeId(selection.anchorNode!)}:${selection.anchorOffset}:${nodeId(selection.focusNode!)}:${selection.focusOffset}`
}

/** The source lines `range` spans, read from the marks `sectionsHtml` wrote before each block (`linesPicked`). */
function rangeLines(doc: Document, range: Range): SourceLines | undefined {
  const before: SourceLines[] = []
  const within: SourceLines[] = []
  const marks = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT)
  for (let mark = marks.nextNode(); mark; mark = marks.nextNode()) {
    const found = SOURCE_MARK.exec(mark.nodeValue ?? '')
    if (!found) continue
    const at = range.comparePoint(mark, 0)
    if (at > 0) break
    ;(at < 0 ? before : within).push({ from: Number(found[1]), to: Number(found[2]) })
  }
  return linesPicked(before, within)
}

/** What `range` picks, its words and where they are: the sections it touches by their anchors, and its source lines. */
function pickedIn(doc: Document, range: Range, anchors: HTMLElement[], sections: Section[]): Omit<Passage, 'of' | 'project' | 'card' | 'file'> {
  const touched = sections.filter((_, i) => range.intersectsNode(anchors[i]))
  const heading = touched[0]?.heading
  return { quote: range.toString().trim(), sections: touched.map((s) => s.n), ...(heading !== undefined && { heading }), ...rangeLines(doc, range) }
}

/** The name the frame's highlight registry keeps the held passage under, `::highlight(tower-passage)` its look. */
const HIGHLIGHT = 'tower-passage'

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
  el.innerHTML = `<div class="doc-split"><iframe title="${esc(title)}" sandbox="${DOCUMENT_SANDBOX}"></iframe><div class="doc-gutter" role="group" aria-label="on each section" hidden></div><div class="doc-passage" role="group" aria-label="on the passage picked" hidden><div></div></div></div>`
  const frame = el.querySelector('iframe')!
  const gutter = el.querySelector<HTMLElement>('.doc-gutter')!
  const box = el.querySelector<HTMLElement>('.doc-passage')!
  const acts = box.firstElementChild as HTMLElement

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
  const unheard = kit.bus.onMark('section', drawMarks)
  drawMarks()

  /** The passage held, its range in the frame and its subject, and the region on it: none while nothing is picked. */
  let held: { range: Range; subject: Subject; region: RegionHandle } | undefined

  /** The box over the frame, under the passage held or over it where there is no room below, within the frame. */
  const placeBox = () => {
    const r = held!.range.getBoundingClientRect()
    const [width, height] = [frame.clientWidth, frame.clientHeight]
    const w = Math.min(520, width - 24)
    box.style.width = `${w}px`
    const h = box.offsetHeight
    const left = Math.max(12, Math.min(r.left, width - w - 12))
    const top = r.bottom + 8 + h <= height ? r.bottom + 8 : r.top - h - 8 >= 0 ? r.top - h - 8 : Math.max(0, height - h)
    box.style.transform = `translate(${left}px, ${top}px)`
  }

  /** The box is drawn while the region holds something to draw, placed every animation frame: the passage moves as the frame scrolls. */
  const followPick = () => {
    if (!held) return
    box.hidden = acts.hidden || !acts.childElementCount
    if (!box.hidden) placeBox()
  }

  const picks = loop<PickState, PickEvent, PickEffect>({
    state: PICK_START,
    handlers: PICK_HANDLERS,
    execute: {
      ...timers<PickEvent>(),
      pick() {
        const doc = frame.contentDocument!
        const selection = doc.getSelection()!
        if (!selection.rangeCount || selection.isCollapsed) return picks.dispatch({ type: 'drop' })
        const range = selection.getRangeAt(0).cloneRange()
        const subject = passageSubject({ ...passageFrom(of), ...pickedIn(doc, range, anchors, sections) })
        if (held) held.region.update(subject)
        held = { range, subject, region: held?.region ?? kit.region(acts, 'passage.acts', subject) }
        const win = frame.contentWindow as Window & typeof globalThis
        win.CSS.highlights.set(HIGHLIGHT, new win.Highlight(range))
        box.classList.remove('moving')
        followPick()
      },
      moving: () => void box.classList.add('moving'),
      drop() {
        held?.region.close()
        held = undefined
        box.hidden = true
        box.classList.remove('moving')
        ;(frame.contentWindow as (Window & typeof globalThis) | null)?.CSS.highlights.delete(HIGHLIGHT)
        const selection = frame.contentDocument?.getSelection()
        if (selection && !selection.isCollapsed) selection.removeAllRanges()
      },
    },
  })
  box.addEventListener('done', (e) => (e.stopPropagation(), picks.dispatch({ type: 'drop' })))
  /** A press anywhere on the page but the box lets the pick go; one in the frame does, by collapsing the selection. */
  const pressedOutside = (e: PointerEvent) => void (held && !box.contains(e.target as Node) && picks.dispatch({ type: 'drop' }))
  document.addEventListener('pointerdown', pressedOutside, true)

  /** The last selection read and whether it holds words, read once for each selection: a long one is long to read. */
  let read: { sig: string; words: boolean } | undefined

  /** Each animation frame while the document is seen: the selection as it is now, if it holds words, and the box where its passage is. */
  const lookAtPicks = () => {
    const doc = frame.contentDocument!
    const sig = selectionSig(doc)
    if (sig !== undefined && sig !== read?.sig) read = { sig, words: doc.getSelection()!.toString().trim() !== '' }
    picks.dispatch({ type: 'seen', sig: sig !== undefined && read!.words ? sig : undefined })
    followPick()
  }

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
    follow = followSections(frame, anchors, rows.map((r) => r.el), lookAtPicks)
    if (!seen) follow.visible(false)
    if (wanted) scrollTo(wanted)
    else at.opened?.(doc)
  })
  frame.srcdoc = frameDoc(at.tower, at.docCss, '')

  return {
    update() {
      regions.forEach((r, i) => r.update(subjects[i]))
      held?.region.update(held.subject)
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
      picks.dispatch({ type: 'drop' })
      document.removeEventListener('pointerdown', pressedOutside, true)
      regions.forEach((r) => r.close())
      for (const s of subjects) kit.bus.clear(s.key)
    },
  }
}
