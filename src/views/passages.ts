import { loop, timers } from '../shared/loop.ts'
import { PICK_HANDLERS, PICK_START, type PickEffect, type PickEvent, type PickState } from '../shared/picks.ts'
import { passageSubject, type Passage, type Subject } from '../shared/subjects.ts'
import type { Kit, RegionHandle } from '../shared/views.ts'

/**
 * Text picked in a document frame where nothing runs, as a `passage` of the subject the frame draws (decision
 * `passage-picks`), for any view that draws one: `tower/document`'s sections and `tower/text`'s file. Nothing in such a
 * frame is heard (WebKit calls no listener there), so each animation frame while the view is seen this reads the
 * frame's selection from the page and tells `/picks.js` what it read. A pick is lit by a highlight, not by an element
 * written into the document, and what acts on it (`passage.acts`) is drawn in a box over the frame, in the page's own
 * document: under the passage, or over it where there is no room below. The view says where a range is in its own
 * terms (`Where`): its words, and the sections and source lines it spans.
 */

/** Where a range is in what a view draws: its words, the sections it touches and their first heading, its source lines. */
export type Where = (doc: Document, range: Range) => Omit<Passage, 'of' | 'project' | 'card' | 'file'>

/** The look of the box, inside the view: its host is the frame's positioned parent, the frame at its top left. */
export const PASSAGE_RULES = `& .passage-box { position: absolute; top: 0; left: 0; z-index: 2; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel);
    box-shadow: 0 8px 28px color-mix(in oklab, var(--ink) 18%, transparent); }
  & .passage-box[hidden] { display: none; }
  & .passage-box.moving { visibility: hidden; }`

/**
 * The name the frame's highlight registry keeps the held passage under, and its look in the frame: the selection's
 * too, so a pick reads the same while it is being made and once held, with the focus in the box. Chrome paints a
 * selection whose frame lost the focus over the highlight, in its own dark grey, unless the page styles it.
 */
const HIGHLIGHT = 'tower-passage'
const HIGHLIGHT_CSS = `::highlight(${HIGHLIGHT}), ::selection { background-color: color-mix(in oklab, var(--accent) 40%, transparent); }`

type FrameWindow = Window & typeof globalThis

/** Where a passage's worker and file are: the subject the frame draws, a showing or a file of a checkout. */
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

/** The characters of `within`'s text before a point in it: where a range's end falls in the text a frame draws. */
export function offsetIn(within: Node, node: Node, offset: number): number {
  const before = within.ownerDocument!.createRange()
  before.setStart(within, 0)
  before.setEnd(node, offset)
  return before.toString().length
}

/** Picks in `frame`, once its document is drawn, with the box in `host`, its positioned parent. */
export type Picks = { visible(on: boolean): void; update(): void; close(): void }

/**
 * Follows what is picked in `frame`'s document, drawn, as passages of `of`, with what acts on the one held in a box
 * appended to `host`. `visible(false)` stops reading until `visible(true)`; `update` hands the region the board as it
 * stands; `close` lets the pick go and ends it.
 */
export function pickPassages(frame: HTMLIFrameElement, host: HTMLElement, kit: Kit, of: Subject, where: Where): Picks {
  const doc = frame.contentDocument!
  const win = frame.contentWindow as FrameWindow
  doc.head.append(Object.assign(doc.createElement('style'), { textContent: HIGHLIGHT_CSS }))
  const box = document.createElement('div')
  box.className = 'passage-box'
  box.setAttribute('role', 'group')
  box.setAttribute('aria-label', 'on the passage picked')
  box.hidden = true
  const acts = document.createElement('div')
  box.append(acts)
  host.append(box)

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
        const selection = doc.getSelection()!
        if (!selection.rangeCount || selection.isCollapsed) return picks.dispatch({ type: 'drop' })
        const range = selection.getRangeAt(0).cloneRange()
        const subject = passageSubject({ ...passageFrom(of), ...where(doc, range) })
        if (held) held.region.update(subject)
        held = { range, subject, region: held?.region ?? kit.region(acts, 'passage.acts', subject) }
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
        win.CSS.highlights.delete(HIGHLIGHT)
        const selection = doc.getSelection()
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

  /** Each animation frame while seen: the selection as it is now, if it holds words, and the box where its passage is. */
  let tick = 0
  const look = () => {
    tick = requestAnimationFrame(look)
    const sig = selectionSig(doc)
    if (sig !== undefined && sig !== read?.sig) read = { sig, words: doc.getSelection()!.toString().trim() !== '' }
    picks.dispatch({ type: 'seen', sig: sig !== undefined && read!.words ? sig : undefined })
    followPick()
  }
  let seen = true
  tick = requestAnimationFrame(look)

  return {
    visible(on) {
      if (on === seen) return
      seen = on
      if (on) tick = requestAnimationFrame(look)
      else cancelAnimationFrame(tick)
    },
    update: () => held?.region.update(held.subject),
    close() {
      cancelAnimationFrame(tick)
      picks.dispatch({ type: 'drop' })
      document.removeEventListener('pointerdown', pressedOutside, true)
      box.remove()
    },
  }
}
