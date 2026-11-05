import { esc } from '../../../src/shared/cards.ts'
import type { Tower } from '../../../src/shared/shelf-page.ts'
import { paintOnce } from '../../../src/views/parts.ts'

/**
 * A browser of the machine's folders, read from `floors/dirs`: the form picks a floor's hub and repos with it, and the
 * Repos view a floor's. A browser page has no folder picker that answers an absolute path, so the extension lists them.
 */

/** What `floors/dirs` answers: the folder listed, its parent, where browsing starts, and its folders. */
export type Listing = { path: string; parent?: string; root: string; git: boolean; dirs: { name: string; git: boolean }[] }

/** The browser's rules, nested in a view's `viewCss`. */
export const DIRS_CSS = `
  & .browse { display: flex; flex-direction: column; gap: var(--sp-s); }
  & .crumb { display: flex; align-items: center; gap: var(--sp-m); font: var(--fs-s)/1.3 var(--mono); color: var(--muted); }
  & .crumb code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
  & .dirs { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--radius); scrollbar-width: thin; }
  & .dirs button { display: flex; align-items: center; gap: var(--sp-m); padding: var(--sp-s) var(--sp-l); border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: none;
    color: var(--ink); text-align: left; font: var(--fs-m)/1.3 var(--mono); cursor: pointer; }
  & .dirs button:last-child { border-bottom: 0; }
  & .dirs button:hover, & .dirs button:focus-visible { background: var(--panel-2); }
  & .dirs .git { margin-left: auto; font: var(--fs-xs)/1 var(--mono); color: var(--muted); }
  & .dirs .empty { padding: var(--sp-m) var(--sp-l); color: var(--faint); }`

export type Browser = {
  /** Lists `dir`, or the settings' root when left out. */
  browse(dir?: string): Promise<void>
  /** The folder listed now, once one is. */
  listing(): Listing | undefined
}

/**
 * The browser drawn in `el`: a click on a folder goes into it, `↑ up` to its parent. `went` is told each folder a
 * click goes to, `listed` each listing drawn, and `failed` why one couldn't be read. Only the latest browse is drawn: a
 * slower listing of a folder clicked before it is dropped.
 */
export const browser = (
  el: HTMLElement,
  tower: Tower,
  on: { went?(dir: string): void; listed?(listing: Listing): void; failed(message: string): void },
): Browser => {
  let listing: Listing | undefined
  let latest = 0
  el.classList.add('browse')
  el.innerHTML = `<div class="crumb"><button type="button" data-up aria-label="the folder above">↑ up</button><code></code></div><div class="dirs" role="list"></div>`

  const draw = (l: Listing) => {
    paintOnce(el.querySelector('.crumb code')!, `<bdi>${esc(l.path)}</bdi>`)
    el.querySelector<HTMLButtonElement>('[data-up]')!.disabled = !l.parent
    paintOnce(
      el.querySelector('.dirs')!,
      l.dirs.length
        ? l.dirs.map((x) => `<button type="button" role="listitem" data-dir="${esc(x.name)}">📁 ${esc(x.name)}${x.git ? '<span class="git">git</span>' : ''}</button>`).join('')
        : '<div class="empty">no folders here</div>',
    )
  }

  const browse = async (dir?: string) => {
    const n = ++latest
    try {
      const read = (await tower.get(`floors/dirs${dir ? `?path=${encodeURIComponent(dir)}` : ''}` as never)) as unknown as Listing
      if (n !== latest) return
      listing = read
      draw(listing)
      on.listed?.(listing)
    } catch (err) {
      if (n === latest) on.failed((err as Error).message)
    }
  }

  const go = (dir: string) => {
    on.went?.(dir)
    return browse(dir)
  }

  el.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest('[data-up]') && listing?.parent) return void go(listing.parent)
    const dir = target.closest<HTMLElement>('[data-dir]')?.dataset.dir
    if (dir && listing) return void go(`${listing.path.replace(/\/$/, '')}/${dir}`)
  })

  return { browse, listing: () => listing }
}
