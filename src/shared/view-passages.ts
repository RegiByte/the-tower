import { loop, timers } from './loop.ts'
import { PICK_HANDLERS, PICK_START, type PickEffect, type PickEvent, type PickState } from './picks.ts'
import type { FromPage, ToPage } from './shelf-page.ts'
import { passageSubject, type Passage } from './passage.ts'
import type { Subject } from './subjects.ts'
import type { Kit, RegionHandle } from './views.ts'

/**
 * Text picked in a framed file, as a `passage` of the subject the frame draws (decision `passage-picks`), for any view
 * that frames one: `tower/document`'s sections, `tower/text`'s file and `tower/html`'s page. What is picked comes from
 * a `PickSource`: the frame's own selection, read from the page in a frame where nothing runs (`frameSource`), or the
 * page's report of it, sent by `/frame-picks.js` from a page that runs its own scripts (`reportedSource`). Each
 * animation frame while the view is seen, the source is read and the pick machine (`picks.ts`) told what it read; what acts on the pick
 * held (`passage.acts`) is drawn in a box over the frame, in the page's own document: under the passage, or over it
 * where there is no room below.
 */

/** Where a range is in what a view draws: its words and its source lines. */
export type Where = (doc: Document, range: Range) => Picked

/** What a pick says of itself: all of a passage but whose and where the file is, which the subject drawn says. */
type Picked = Omit<Passage, 'of' | 'project' | 'card' | 'file'>

/** Where a pick is in the frame's viewport. */
type Rect = { top: number; bottom: number; left: number }

/**
 * Where picks in a frame come from: `sig`, the selection's signature now, none while nothing is picked; `take`, the
 * selection as it is now as a pick, and where it stands as the frame scrolls; `light` and `unlight`, the pick taken
 * shown in the frame and not; `clear`, the frame's selection let go; `close`, the source ended.
 */
export type PickSource = {
  sig(): string | undefined
  take(): { picked: Picked; rect(): Rect } | undefined
  light(): void
  unlight(): void
  clear(): void
  close(): void
}

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

/** A selection's signature, as the pick machine (`picks.ts`) is told it: its ends; none while it is collapsed or outside the body. */
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

/**
 * The selection of `frame`'s document, drawn, read from the page: a frame where nothing runs and that the page can
 * reach (`allow-same-origin`). The view says where a range is (`where`); the pick is lit by a highlight registered on
 * the frame's window, not by an element written into the document.
 */
export function frameSource(frame: HTMLIFrameElement, where: Where): PickSource {
  const doc = frame.contentDocument!
  const win = frame.contentWindow as FrameWindow
  doc.head.append(Object.assign(doc.createElement('style'), { textContent: HIGHLIGHT_CSS }))
  /** The last selection read and whether it holds words, read once for each selection: a long one is long to read. */
  let read: { sig: string; words: boolean } | undefined
  let taken: Range | undefined
  return {
    sig() {
      const sig = selectionSig(doc)
      if (sig !== undefined && sig !== read?.sig) read = { sig, words: doc.getSelection()!.toString().trim() !== '' }
      return sig !== undefined && read!.words ? sig : undefined
    },
    take() {
      const selection = doc.getSelection()!
      if (!selection.rangeCount || selection.isCollapsed) return undefined
      const range = (taken = selection.getRangeAt(0).cloneRange())
      return { picked: where(doc, range), rect: () => range.getBoundingClientRect() }
    },
    light: () => void win.CSS.highlights.set(HIGHLIGHT, new win.Highlight(taken!)),
    unlight: () => void win.CSS.highlights.delete(HIGHLIGHT),
    clear() {
      const selection = doc.getSelection()
      if (selection && !selection.isCollapsed) selection.removeAllRanges()
    },
    close() {},
  }
}

/**
 * The selection of a page that runs its own scripts, as `/frame-picks.js` reports it from inside: heard only from
 * `frame`'s window, and only from the document the frame holds at its first load, which alone is given the token its
 * reports must carry (`picks`): a page that sends the frame elsewhere before its own load ends hands that to the
 * document it sent it to, as its own choice. Any later load (a link followed, a script sending the frame elsewhere, a
 * reload) ends it: what the frame holds then may be any site's, and it never has the token. A new selection is heard
 * only while the frame holds the focus, as a pick made by hand does, so a page's script can't open the box over
 * what the user is doing elsewhere; one heard without it lets go of what was heard, so a pick still settling
 * when the user clicks away doesn't open. The one held is followed as it moves or ends wherever the focus is. The words are the page's word: a
 * script in it could report others than those selected. The page's own selection shows the pick; letting it go sends
 * `unpick`.
 */
export function reportedSource(frame: HTMLIFrameElement): PickSource {
  const token = crypto.randomUUID()
  let loads = 0
  let report: Extract<FromPage, { t: 'pick' }> | undefined
  const loaded = () => {
    loads++
    if (loads > 1) return void (report = undefined)
    const picks: ToPage = { t: 'picks', token }
    frame.contentWindow?.postMessage(picks, '*')
  }
  const focused = () => document.activeElement === frame && document.hasFocus()
  const heard = (e: MessageEvent) => {
    const msg = e.data as FromPage | undefined
    if (e.source !== frame.contentWindow || loads !== 1 || msg?.t !== 'pick' || msg.token !== token) return
    if (msg.sig === undefined) return void (report = undefined)
    report = msg.sig === report?.sig || focused() ? msg : undefined
  }
  frame.addEventListener('load', loaded)
  addEventListener('message', heard)
  return {
    sig: () => report?.sig,
    take() {
      if (!report) return undefined
      const { sig, quote } = report
      /** Where the pick stands: as the page last said, while its selection is still the one taken. */
      let rect = report.rect!
      const now = () => {
        const latest = report
        if (latest && latest.sig === sig) rect = latest.rect!
        return rect
      }
      return { picked: { quote: quote! }, rect: now }
    },
    light() {},
    unlight() {},
    clear() {
      report = undefined
      const unpick: ToPage = { t: 'unpick' }
      frame.contentWindow?.postMessage(unpick, '*')
    },
    close() {
      frame.removeEventListener('load', loaded)
      removeEventListener('message', heard)
    },
  }
}

/** Picks in a frame, with the box in its positioned parent. */
export type Picks = { visible(on: boolean): void; update(): void; close(): void }

/**
 * Follows what `source` says is picked in `frame` as passages of `of`, with what acts on the one held in a box
 * appended to `host`. `visible(false)` stops reading until `visible(true)`; `update` hands the region the board as it
 * stands; `close` lets the pick go and ends it, the source with it.
 */
export function pickPassages(frame: HTMLIFrameElement, host: HTMLElement, kit: Kit, of: Subject, source: PickSource): Picks {
  const box = document.createElement('div')
  box.className = 'passage-box'
  box.setAttribute('role', 'group')
  box.setAttribute('aria-label', 'on the passage picked')
  box.hidden = true
  const acts = document.createElement('div')
  box.append(acts)
  host.append(box)

  /** The passage held, where it is and its subject, and the region on it: none while nothing is picked. */
  let held: { rect: () => Rect; subject: Subject; region: RegionHandle } | undefined

  /** The box over the frame, under the passage held or over it where there is no room below, within the frame. */
  const placeBox = () => {
    const r = held!.rect()
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
        const taken = source.take()
        if (!taken) return picks.dispatch({ type: 'drop' })
        const subject = passageSubject({ ...passageFrom(of), ...taken.picked })
        if (held) held.region.update(subject)
        held = { rect: taken.rect, subject, region: held?.region ?? kit.region(acts, 'passage.acts', subject) }
        source.light()
        box.classList.remove('moving')
        followPick()
      },
      moving: () => void box.classList.add('moving'),
      drop() {
        held?.region.close()
        held = undefined
        box.hidden = true
        box.classList.remove('moving')
        source.unlight()
        source.clear()
      },
    },
  })
  box.addEventListener('done', (e) => (e.stopPropagation(), picks.dispatch({ type: 'drop' })))
  /** A press anywhere on the page but the box lets the pick go; one in the frame does, by collapsing the selection. */
  const pressedOutside = (e: PointerEvent) => void (held && !box.contains(e.target as Node) && picks.dispatch({ type: 'drop' }))
  document.addEventListener('pointerdown', pressedOutside, true)

  /** Each animation frame while seen: the selection as the source says it now, and the box where its passage is. */
  let tick = 0
  const look = () => {
    tick = requestAnimationFrame(look)
    picks.dispatch({ type: 'seen', sig: source.sig() })
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
      source.close()
      box.remove()
    },
  }
}
