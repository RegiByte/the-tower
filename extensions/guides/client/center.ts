import type { Board } from '/lib/board.js'
import { fenceText, imagePath, markdownCss, markdownHtml } from '/lib/markdown.js'
import { closeHtml, copyTelling, itemPath, type Mount, paintOnce, viewCss } from '/lib/view.js'
import { esc } from '/lib/words.js'
import { type Broken, byCategory, type Guide, GUIDES, guideOf, isGuide, matches, TOWER_WIDE } from './guide.ts'

/**
 * `guides/center`, the learning center on the board: every guide in the tower-wide `guides` collection, the ones the
 * guides extension ships, those other extensions contribute and the user's own, listed by category and order and
 * searched by title and keyword, the one picked drawn beside the list. A guide's relative images are read from beside
 * it in the collection.
 */

const ID = 'guides/center'

const STYLE = viewCss(
  ID,
  `& .center { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(200px, 18em) 1fr; gap: var(--sp-l); }
  & .index, & .reader { min-height: 0; overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  & .index { display: flex; flex-direction: column; gap: var(--sp-m); padding: var(--sp-l); }
  & .index input { padding: var(--sp-s) var(--sp-m); font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--radius); }
  & .index input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  & .index h3 { margin: var(--sp-s) 0 0; font: 700 var(--fs-s)/1.3 var(--display); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  & .index ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
  & .index li button { width: 100%; text-align: left; padding: var(--sp-xs) var(--sp-s); border: 0; border-radius: var(--radius-s); background: none; color: var(--ink); font: inherit; cursor: pointer; }
  & .index li button:hover { background: color-mix(in oklab, var(--accent) 10%, transparent); }
  & .index li button[aria-current="true"] { background: color-mix(in oklab, var(--accent) 18%, transparent); font-weight: 700; }
  & .index .from { color: var(--faint); font-size: var(--fs-s); }
  & .index .none, & .index .broken { color: var(--muted); font-size: var(--fs-s); margin: 0; }
  & .reader { padding: var(--sp-xl) var(--sp-2xl); }
  & .reader .md img { max-width: 100%; border-radius: var(--radius-s); border: 1px solid var(--line); }
  & .reader .empty { color: var(--muted); }
  @media (max-width: 640px) { & .center { grid-template-columns: 1fr; grid-template-rows: auto 1fr; } }`,
)

/** A guide's text as of its version, read again when the board shows a newer one. */
type Read = { modifiedAt: number; guide: Guide | Broken }

const pathOf = (id: string) => itemPath(TOWER_WIDE, GUIDES, id)

/** `body` drawn as markdown, each relative image read from beside the guide. */
const bodyHtml = (guide: Guide) => {
  const page = document.createElement('template')
  page.innerHTML = markdownHtml(guide.body)
  for (const img of page.content.querySelectorAll('img')) {
    const at = imagePath(img.getAttribute('src') ?? '', `/${pathOf(guide.id)}`)
    if (at) img.setAttribute('src', at)
  }
  return page.innerHTML
}

export const mount: Mount = (host, { tower, board: first, kit }) => {
  let board: Board = first
  let query = ''
  let open: string | undefined
  const reads = new Map<string, Read>()

  host.innerHTML = `<style>${STYLE}${markdownCss}</style>
  <div class="shelf-head"><span class="label">Learning center</span><span class="dim">how to do things in the tower</span><span class="actions"></span></div>
  <div class="center"><nav class="index" aria-label="guides"><input type="search" placeholder="Search guides" aria-label="search guides"><div class="list"></div></nav>
    <article class="reader" aria-live="polite"></article></div>`
  const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector)!

  /** The guides' files on the board: markdown only, an image beside a guide being one of its parts. */
  const files = () => (board.collections.find((c) => c.id === GUIDES)?.items ?? []).filter((i) => i.id.endsWith('.md'))

  /** Reads each guide the board shows at a version not yet read, then draws again. */
  const readAll = async () => {
    const stale = files().filter((i) => reads.get(i.id)?.modifiedAt !== i.modifiedAt)
    if (!stale.length) return
    await Promise.all(
      stale.map(async (i) => {
        const guide = await tower.text(pathOf(i.id)).then(
          (text) => guideOf(i.id, text),
          (err: Error) => ({ id: i.id, why: err.message }),
        )
        reads.set(i.id, { modifiedAt: i.modifiedAt, guide })
      }),
    )
    draw()
  }

  const fromOf = (id: string) => board.collections.find((c) => c.id === GUIDES)?.items.find((i) => i.id === id)?.from

  const listHtml = (guides: Guide[], broken: Broken[]) => {
    const shown = guides.filter((g) => matches(g, query))
    const groups = byCategory(shown).map(
      ({ category, guides }) =>
        `<h3>${esc(category)}</h3><ul>${guides
          .map((g) => {
            const from = fromOf(g.id)
            return `<li><button data-guide="${esc(g.id)}" aria-current="${g.id === open}">${esc(g.title)}${from && from !== 'guides' ? ` <span class="from">· ${esc(from)}</span>` : ''}</button></li>`
          })
          .join('')}</ul>`,
    )
    const none = !shown.length ? `<p class="none">${guides.length ? `No guide matches “${esc(query)}”.` : files().length ? 'Reading the guides…' : 'No guides yet.'}</p>` : ''
    const bad = broken.map((b) => `<p class="broken">${esc(b.id)} is not a guide: ${esc(b.why)}</p>`).join('')
    return groups.join('') + none + bad
  }

  const draw = () => {
    const all = files().flatMap((i) => (reads.has(i.id) ? [reads.get(i.id)!.guide] : []))
    const guides = all.filter(isGuide)
    if (!open || !guides.some((g) => g.id === open)) open = byCategory(guides)[0]?.guides[0]?.id
    paintOnce($('.shelf-head .actions'), closeHtml(board.keys))
    paintOnce($('.list'), listHtml(guides, all.filter((g): g is Broken => !isGuide(g))))
    const guide = guides.find((g) => g.id === open)
    paintOnce($('.reader'), guide ? `<div class="md"><h1>${esc(guide.title)}</h1>${bodyHtml(guide)}</div>` : '<p class="empty">Pick a guide.</p>')
  }

  $<HTMLInputElement>('input').addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value
    draw()
  })

  host.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-home]')) return kit.display('board')
    const code = target.closest<HTMLElement>('[data-copy-code]')
    if (code) return void copyTelling(fenceText(code), 'the code', kit.toast)
    const id = target.closest<HTMLElement>('[data-guide]')?.dataset.guide
    if (!id) return
    open = id
    draw()
    $('.reader').scrollTop = 0
  })

  draw()
  void readAll()

  return {
    update(next) {
      board = next
      draw()
      void readAll()
    },
    close() {},
  }
}
