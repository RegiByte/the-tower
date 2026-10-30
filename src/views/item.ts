import type { Board, CardShown, Floor, FloorCollection, FloorItem } from '../bridge/board.ts'
import { esc, shownHref, shownTitle, span } from '../shared/cards.ts'
import { fileButtonsHtml, fileCall } from '../shared/file-acts.ts'
import { ICON } from '../shared/icons.ts'
import { documentCss } from '../shared/design.ts'
import { deleteAsk, itemFile, itemPath, itemsCss, keptTitles } from '../shared/items.ts'
import { failedHtml } from '../shared/panel-kit.ts'
import type { Tower } from '../shared/shelf-page.ts'
import type { Subject } from '../shared/subjects.ts'
import { viewsOf, type Kit, type Mount } from '../shared/views.ts'
import { closeHtml, paintOnce, viewCss } from './parts.ts'

/**
 * A view by type: one body per media type, drawn in a frame by the kind of its subject. A kept item's frame is a head
 * naming it (its collection, tag, file, who kept it, what extensions add to `item.head`, a new tab, Delete and the
 * close) over its body, drawn again when the item changes; an item whose collection an extension declares leads back
 * to that extension's view of the floor, when it has one. Any other subject's, a showing's, is its body alone, filling
 * its tab, whose head is the tab strip's.
 */

/**
 * What a body is drawn from: `url`, where its content is served; `body`, its text itself, where its subject carries it
 * (an address); `title`, what it is called; `name`, its file's name; `file`, its path on disk; `version`, its
 * content's, where it has one; `docCss`, a document frame's styles beside the design's; `stale`, whether a newer draw
 * has begun since.
 */
export type Body = { tower: Tower; kit: Kit; url: string; body?: string; title: string; name: string; file: string; version?: number; docCss: string; stale: () => boolean }

/**
 * A view by type: `rules`, its own look; `draw`, its body into `el`; `restyled`, drawn again as the viewer's scheme or
 * appearance changes (a document drawn from the design's tokens).
 */
export type TypeViewSpec = { id: string; rules: string; draw: (el: HTMLElement, at: Body) => void | Promise<void>; restyled: boolean }

const HEAD_RULES = `& .shelf-head .by { min-height: 0; padding: 0; border: 0; background: none; font: inherit; color: var(--accent); text-decoration: underline; cursor: pointer; }
  & .shelf-head :is(.lead, .adds, .own) { display: contents; }`

/** The view of the floor that the extension declaring collection `c` gives, where it is on: the way back from its items. */
const backOf = (board: Board, project: string, c: FloorCollection) =>
  c.by === undefined ? undefined : viewsOf(board).find((v) => v.cap === c.by && v.on.includes('floor') && !v.off?.includes(project))
/** The empty body of a file the tower draws nothing of, left to Finder and the editor. */
export const unshownHtml = ({ name, file }: Body) =>
  `<div class="shelf-empty">the tower shows no ${esc(name.split('.').pop()!)} file<br><br>reveal it in Finder or open it in your editor ${fileButtonsHtml(file)}</div>`

/**
 * A body's text, its own where it carries it, else read where it is served, drawn by `article` in a document frame
 * where nothing runs, from the design's tokens; links open a tab of their own.
 */
export const framedText =
  (article: (text: string, url: string) => string) =>
  async (el: HTMLElement, { tower, title, url, body, docCss, stale }: Body) => {
    const text = body ?? await tower.text(url.slice(1)).catch((err: Error) => {
      if (!stale()) el.innerHTML = failedHtml(title, err.message, 'data-read-again')
    })
    if (text === undefined || stale()) return
    el.innerHTML = `<iframe title="${esc(title)}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`
    el.querySelector('iframe')!.srcdoc =
      `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css"><style>${documentCss}${docCss}</style><article>${article(text, url)}</article>`
  }

/** A body's file as served, as of its version when it has one: a frame or an element loading it gets the newest. */
export const versioned = ({ url, version }: Body) => (version === undefined ? esc(url) : `${esc(url)}?v=${version}`)

/** A frame's draws of its body: each `draw` begins a newer one, so an older read lands nowhere; `close` ends them all. */
const draws = (spec: TypeViewSpec, el: HTMLElement) => {
  let n = 0
  let closed = false
  return {
    draw: (at: Omit<Body, 'stale'>) => {
      const mine = ++n
      void spec.draw(el, { ...at, stale: () => closed || mine !== n })
    },
    close: () => void (closed = true),
  }
}

/** A kept item's frame: its head over its body, drawn again when the item changes. */
const itemFrame = (spec: TypeViewSpec): Mount => (host, { tower, board: first, subject, kit }) => {
  let board = first
  const { project, collection, id: itemId } = subject.value as FloorItem & { project: string; collection: string }
  const floor = () => board.floors.find((f) => f.id === project) as Floor
  const c = () => floor().collections.find((c) => c.id === collection) as FloorCollection
  const item = () => c().items.find((i) => i.id === itemId) as FloorItem
  /** The version of the item its body was drawn from. */
  let drawn: number | undefined

  host.innerHTML = `<style>${viewCss(spec.id, `${HEAD_RULES}\n${spec.rules}`)}</style><div class="shelf-head"><span class="lead"></span><span class="actions"><span class="adds"></span><span class="own"></span></span></div><div class="shelf-body"></div>`
  const [lead, own, body] = [host.querySelector('.lead')!, host.querySelector('.own')!, host.querySelector<HTMLElement>('.shelf-body')!]
  const addsEl = host.querySelector<HTMLElement>('.adds')!
  const adds = kit.region(addsEl, 'item.head', subject)
  const bodies = draws(spec, body)

  const { title } = keptTitles((project, collection, id) => tower.text(itemPath(project, collection, id)), () => drawHead())

  function drawHead() {
    const [f, col, it] = [floor(), c(), item()]
    const file = itemFile(col, it.id)
    const back = backOf(board, project, col)
    const name = back?.words.label.toLowerCase()
    const by = it.keptBy ? ` · kept by <button class="by" data-card="${esc(it.keptBy.session)}" data-tip="go to the worker that kept it">${esc(it.keptBy.callsign)}</button>` : ''
    paintOnce(
      lead,
      `${back ? `<button class="icon-btn" data-back="${esc(back.id)}" aria-label="back to the ${esc(name!)}" data-tip="back to the floor's ${esc(name!)}">${ICON.back}</button>` : ''}<span class="label">${esc(col.label)}</span><button class="tag" data-copy="${esc(it.tag)}" data-tip="${esc(file)} · click to copy the tag">${esc(it.tag)}</button>${fileButtonsHtml(file)}
    <span class="dim">${esc(f.name)} · ${esc(title(f.id, col.id, it))}${by} · changed ${span(Date.now() - it.modifiedAt)} ago</span>`,
    )
    paintOnce(
      own,
      `<a href="/${esc(itemPath(f.id, col.id, it.id))}" target="_blank" rel="noreferrer" data-tip="open it on its own">${ICON.remote} new tab</a>
      <button class="danger" data-delete>Delete</button>
      ${closeHtml(board.keys)}`,
    )
  }

  const drawBody = () => {
    const it = item()
    drawn = it.modifiedAt
    bodies.draw({ tower, kit, url: `/${itemPath(project, collection, it.id)}`, title: it.tag, name: it.id, file: itemFile(c(), it.id), version: it.modifiedAt, docCss: itemsCss })
  }

  /** Deleting is the user's: asked first, and the view closes before the file goes. */
  async function remove() {
    const [col, it] = [c(), item()]
    if (!(await kit.confirm(deleteAsk(col, it, title(project, collection, it)), 'Delete'))) return
    kit.display('board')
    const done = await tower.call('collection/delete', { project, collection, id: it.id }).then(() => true, (err: Error) => (kit.toast(err.message), false))
    if (done) kit.toast(`Deleted ${it.tag} from ${col.label}`)
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (addsEl.contains(target)) return
    const file = fileCall(target)
    if (file) return void tower.run(file).catch((err: Error) => kit.toast(err.message))
    if (target.closest('[data-home]')) return kit.display('board')
    if (target.closest('[data-delete]')) return void remove()
    if (target.closest('[data-read-again]')) return drawBody()
    const back = target.closest<HTMLElement>('[data-back]')?.dataset.back
    if (back) return kit.display(`floor:${project}`, { view: back })
    const card = target.closest<HTMLElement>('[data-card]')?.dataset.card
    if (card) return kit.display(`card:${card}`)
    const copy = target.closest<HTMLElement>('[data-copy]')?.dataset.copy
    if (copy) void navigator.clipboard.writeText(copy).then(() => kit.toast(`Copied ${copy}`), (err: Error) => kit.toast(err.message))
  })

  const offs = spec.restyled ? [tower.prefs.on(drawBody), tower.onScheme(drawBody)] : []

  drawHead()
  drawBody()

  return {
    update(next: Board, now: Subject) {
      board = next
      adds.update(now)
      drawHead()
      if (drawn !== item().modifiedAt) drawBody()
    },
    close() {
      bodies.close()
      adds.close()
      offs.forEach((off) => off())
    },
  }
}

/** A showing's document frame: its article as wide as the tab, from its left edge. */
const SHOWN_DOC_CSS = `${itemsCss}article { max-width: 980px; margin: 0; padding: var(--sp-xl) var(--sp-3xl) 48px; }`

/** A body drawn alone fills its tab: a frame edge to edge, an image or a video whole within it, over the enamel. */
const SHOWN_RULES = `& > .shown-body { flex: 1; min-height: 0; position: relative; display: flex; }
  & > .shown-body > :not(.shelf-empty) { flex: 1; min-width: 0; }
  & > .shown-body iframe { border: 0; background: var(--panel); }
  & > .shown-body iframe.page { background: #fff; }
  & > .shown-body :is(.item-image, .item-video) { position: relative; padding: 0; background: var(--enamel); }
  & > .shown-body :is(.item-image img, .item-video video) { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; object-fit: contain; }`

/** What a body is drawn from, for a subject drawn alone, by its kind: a showing's, a file served or an address its own text. */
const bodyOf = (subject: Subject): Omit<Body, 'tower' | 'kit' | 'stale'> => {
  switch (subject.kind) {
    case 'shown': {
      const s = subject.value as CardShown
      return { url: shownHref(s), ...(s.kind !== 'file' && { body: s.target }), title: shownTitle(s), name: s.target, file: s.target, docCss: SHOWN_DOC_CSS }
    }
    default:
      throw new Error(`A view by type draws no ${subject.kind} alone: give bodyOf in src/views/item.ts a case for it`)
  }
}

/**
 * The frame of a subject drawn alone, a showing among them: its body alone, filling its tab, whose head is the tab
 * strip's. A video it shows plays as it opens and pauses while hidden.
 */
const bareFrame = (spec: TypeViewSpec): Mount => (host, { tower, subject, kit }) => {
  host.innerHTML = `<style>${viewCss(spec.id, `${spec.rules}\n${SHOWN_RULES}`)}</style><div class="shown-body"></div>`
  const body = host.querySelector<HTMLElement>('.shown-body')!
  const bodies = draws(spec, body)
  const drawBody = () => {
    bodies.draw({ tower, kit, ...bodyOf(subject) })
    for (const video of body.querySelectorAll('video')) video.autoplay = true
  }

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    const file = fileCall(target)
    if (file) return void tower.run(file).catch((err: Error) => kit.toast(err.message))
    if (target.closest('[data-read-again]')) drawBody()
  })

  const offs = spec.restyled ? [tower.prefs.on(drawBody), tower.onScheme(drawBody)] : []
  drawBody()

  return {
    update() {},
    visible(on) {
      if (!on) for (const video of body.querySelectorAll('video')) video.pause()
    },
    close() {
      bodies.close()
      offs.forEach((off) => off())
    },
  }
}

/** A view by type, drawn in its subject's frame: a kept item's under its head, any other alone. */
export const typeView = (spec: TypeViewSpec): Mount => {
  const [item, bare] = [itemFrame(spec), bareFrame(spec)]
  return (host, ctx) => (ctx.subject.kind.startsWith('item.') ? item : bare)(host, ctx)
}
