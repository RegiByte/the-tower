import type { Board, Floor, FloorCollection, FloorItem } from '../bridge/board.ts'
import { esc, span } from '../shared/cards.ts'
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
 * What every view by type of a kept item draws alike: a head naming the item (its collection, tag, file, who kept it,
 * what extensions add to `item.head`, a new tab, Delete and the close), and a body each view draws by the item's type,
 * drawn again when the item changes. An item whose collection an extension declares leads back to that extension's
 * view of the floor, when it has one.
 */

/** What a body is drawn from: the item as it stands, where it is served, and whether a newer draw has begun since. */
export type ItemBody = { tower: Tower; kit: Kit; item: FloorItem; c: FloorCollection; url: string; stale: () => boolean }

/**
 * A view by type: `rules`, its own look; `draw`, its body into `el`; `restyled`, drawn again as the viewer's scheme or
 * appearance changes (a document drawn from the design's tokens).
 */
export type ItemViewSpec = { id: string; rules: string; draw: (el: HTMLElement, at: ItemBody) => void | Promise<void>; restyled: boolean }

const HEAD_RULES = `& .shelf-head .by { min-height: 0; padding: 0; border: 0; background: none; font: inherit; color: var(--accent); text-decoration: underline; cursor: pointer; }
  & .shelf-head :is(.lead, .adds, .own) { display: contents; }`

/** The view of the floor that the extension declaring collection `c` gives, where it is on: the way back from its items. */
const backOf = (board: Board, project: string, c: FloorCollection) =>
  c.by === undefined ? undefined : viewsOf(board).find((v) => v.cap === c.by && v.on.includes('floor') && !v.off?.includes(project))

/** The empty body of an item the tower draws nothing of, left to Finder and the editor. */
export const unshownHtml = (c: FloorCollection, item: FloorItem) =>
  `<div class="shelf-empty">the tower shows no ${esc(item.id.split('.').pop()!)} file<br><br>reveal it in Finder or open it in your editor ${fileButtonsHtml(itemFile(c, item.id))}</div>`

/** A body read as text and drawn by `article` in a document frame where nothing runs, from the design's tokens; links open a tab of their own. */
export const framedText =
  (article: (text: string, url: string) => string) =>
  async (el: HTMLElement, { tower, item, url, stale }: ItemBody) => {
    const text = await tower.text(url.slice(1)).catch((err: Error) => {
      if (!stale()) el.innerHTML = failedHtml(item.tag, err.message, 'data-read-again')
    })
    if (text === undefined || stale()) return
    el.innerHTML = `<iframe title="${esc(item.tag)}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`
    el.querySelector('iframe')!.srcdoc =
      `<!doctype html><html ${tower.prefs.attributes()}><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/design.css"><style>${documentCss}${itemsCss}</style><article>${article(text, url)}</article>`
  }

/** An item's file as served, as of its version: a frame or an element loading it gets the newest. */
export const versioned = ({ url, item }: ItemBody) => `${esc(url)}?v=${item.modifiedAt}`

export const itemView =
  ({ id, rules, draw, restyled }: ItemViewSpec): Mount =>
  (host, { tower, board: first, subject, kit }) => {
    let board = first
    const { project, collection, id: itemId } = subject.value as FloorItem & { project: string; collection: string }
    const floor = () => board.floors.find((f) => f.id === project) as Floor
    const c = () => floor().collections.find((c) => c.id === collection) as FloorCollection
    const item = () => c().items.find((i) => i.id === itemId) as FloorItem
    /** The version of the item its body was drawn from, and how many draws began. */
    let drawn: number | undefined
    let draws = 0
    let closed = false

    host.innerHTML = `<style>${viewCss(id, `${HEAD_RULES}\n${rules}`)}</style><div class="shelf-head"><span class="lead"></span><span class="actions"><span class="adds"></span><span class="own"></span></span></div><div class="shelf-body"></div>`
    const [lead, own, body] = [host.querySelector('.lead')!, host.querySelector('.own')!, host.querySelector<HTMLElement>('.shelf-body')!]
    const addsEl = host.querySelector<HTMLElement>('.adds')!
    const adds = kit.region(addsEl, 'item.head', subject)

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
      const n = ++draws
      void draw(body, { tower, kit, item: it, c: c(), url: `/${itemPath(project, collection, it.id)}`, stale: () => closed || n !== draws })
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

    const offs = restyled ? [tower.prefs.on(drawBody), tower.onScheme(drawBody)] : []

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
        closed = true
        adds.close()
        offs.forEach((off) => off())
      },
    }
  }
