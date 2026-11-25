import type { Board } from '/lib/board.js'
import type { ThemePick } from '/lib/client.js'
import { type Mount, paintOnce, viewCss } from '/lib/view.js'
import { esc } from '/lib/words.js'

/**
 * `tower/themes`, the Theme dialog: a frame for the renderer's own look and each theme an extension offers it, every
 * one drawing the page's own parts with that theme and the config's tweak sheets over it, in one scheme the dialog
 * toggles. Each frame can be drawn on this screen, live, or made the tower's (the config's `renderers.<name>.theme`);
 * the head says both choices and takes the screen back to the tower's.
 *
 * A frame is a document written here: the page's own stylesheets (its head's links and styles, but its themes), the
 * theme's (`tower.theme.sheet`), then the renderer's sample (`themeSample` in its `renderer.json`, its `sample()`)
 * beside the parts every renderer shares: a button pair, an open menu and a terminal strip in the ANSI colours.
 */

const ID = 'tower/themes'

const STYLE = viewCss(
  ID,
  `& .themes { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--sp-l); align-content: start; scrollbar-width: thin; }
  & .theme { display: block; width: 100%; height: 560px; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--bg); }
  & .theme[data-drawn] { border-color: var(--accent); }
  & .now { color: var(--muted); }`,
)

/** The frame's own layout around the parts it draws; their looks are the page's and the theme's. */
const FRAME_CSS = `body { display: flex; flex-direction: column; margin: 0; height: 100vh; background: var(--bg); color: var(--ink); font: var(--fs-m)/1.4 var(--ui); overflow: hidden; }
.theme-head { flex: none; display: flex; align-items: baseline; gap: 8px; margin: 0; padding: 12px 12px 0; color: var(--heading); font: var(--display-weight) var(--fs-m)/1.3 var(--display); }
.theme-head .marks { color: var(--muted); font: var(--fs-xs)/1.3 var(--ui); }
.theme-acts { flex: none; display: flex; gap: 6px; justify-content: flex-end; padding: 0 12px 12px; }
.preview { flex: 1; min-height: 0; overflow: hidden; display: grid; align-content: start; gap: 14px; padding: 12px; }
.preview .side { position: static; width: auto; height: auto; min-height: 0; overflow: visible; border-radius: var(--radius-card); }
.preview .side .floors { overflow: visible; padding: 8px; }
.preview .buttons { display: flex; gap: 6px; }
.preview .menu-at { height: 124px; }
.preview .term { padding: 6px 8px; border-radius: var(--radius-s); background: var(--enamel); color: var(--term-fg); font: var(--fs-s)/1.5 var(--mono); white-space: pre; overflow: hidden; }`

/** The eight ANSI colours, by the name of their token and a short one that fits a frame's width. */
const ANSI = [['black', 'blk'], ['red', 'red'], ['green', 'grn'], ['yellow', 'yel'], ['blue', 'blu'], ['magenta', 'mag'], ['cyan', 'cyn'], ['white', 'wht']]

/** The terminal strip: each of the sixteen colours naming itself, the bright ones under the normal. */
const TERM_HTML = `<div class="term">${['', 'bright-']
  .map((bright) => ANSI.map(([name, short]) => `<span style="color: var(--ansi-${bright}${name})">${bright ? short.toUpperCase() : short}</span>`).join(' '))
  .join('\n')}</div>`

/** Opens the frame's menu where its parts leave room and keeps it open, with nothing to act on: the frame is inert. */
const MENU_SCRIPT = `<script type="module">
import '/lib-ui/menu.js'
await customElements.whenDefined('tower-menu')
const menu = document.querySelector('tower-menu')
menu.items = [{ value: 'open', label: 'Open' }, { value: 'rename', label: 'Rename', hint: 'a new name for it' }, { type: 'separator' }, { value: 'delete', label: 'Delete' }]
menu.addEventListener('openchange', (e) => e.detail.value || e.preventDefault())
menu.openAt('sample', document.querySelector('.buttons'))
</script>`

/** What the page links and writes in its head, but its themes: the looks a frame draws the page's parts with. */
const pageSheets = () =>
  [...document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"]:not([data-tower-themes]), style')]
    .map((el) => (el instanceof HTMLLinkElement ? `<link rel="stylesheet" href="${esc(el.href)}">` : `<style>${el.textContent}</style>`))
    .join('')

type Choice = { pick: ThemePick; title: string }

/** A renderer's sample (`themeSample`): the html of its own parts, and the class its body takes for them to draw. */
type Sample = { html: string; bodyClass: string }

export const mount: Mount = async (host, { tower, board: first, kit }) => {
  let board: Board = first
  let scheme = tower.scheme()
  const renderer = await tower.renderer()
  if (!renderer) throw new Error(`${ID} draws a renderer's themes: open it from a page the tower serves at /r/<name>/`)
  const sampleOf: () => Sample = renderer.themeSample
    ? ((await import(`/r/${encodeURIComponent(renderer.name)}/${renderer.themeSample}`)) as { sample(): Sample }).sample
    : () => ({ html: '', bodyClass: '' })

  host.innerHTML = `<style>${STYLE}</style><div class="shelf-head"><span class="now"></span><span class="actions"></span></div><div class="themes"></div>`
  const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector)!

  const choices = (): Choice[] => [{ pick: null, title: 'Default' }, ...(board.offeredThemes[renderer.name] ?? []).map((t) => ({ pick: t.id, title: t.title }))]
  const titleOf = (pick: ThemePick | undefined) =>
    pick === undefined ? "the tower's" : (choices().find((c) => c.pick === pick)?.title ?? `${pick}, which no extension offers now`)

  /** A frame's document: the page's parts with `pick` and the config's tweak sheets, in the dialog's scheme. */
  const frameDoc = ({ pick, title }: Choice, sample: Sample) => {
    const value = esc(JSON.stringify(pick))
    return `<!doctype html><html ${tower.prefs.attributes().replace(/^data-scheme="[^"]*"/, `data-scheme="${scheme}"`)}><meta charset="utf-8">${pageSheets()}<link rel="stylesheet" href="${esc(tower.theme.sheet(pick))}"><style>${FRAME_CSS}</style>
    <body class="${esc(sample.bodyClass)}"><h3 class="theme-head">${esc(title)}<span class="marks"></span></h3>
    <div class="preview" inert>${sample.html}<div class="buttons"><button>Cancel</button><button class="primary">Save</button></div><div class="menu-at"><tower-menu id="sample-menu" modal="false" data-owned="children"></tower-menu></div>${TERM_HTML}</div>
    <div class="theme-acts"><button data-use="${value}">Use here</button><button data-make="${value}">Make it the tower's</button></div>${MENU_SCRIPT}`
  }

  const headHtml = () => {
    const { screen, tower: towers } = tower.theme.get()
    const toggle = `<button data-scheme-toggle aria-pressed="${scheme === 'dark'}">${scheme === 'dark' ? 'Dark' : 'Light'} previews</button>`
    const follow = screen === undefined ? '' : `<button data-follow>Use the tower's</button>`
    return { now: `this screen: ${esc(titleOf(screen))} · the tower's: ${esc(titleOf(towers))}`, actions: follow + toggle }
  }

  /**
   * A theme's card is its frame: its name, the parts it draws (inert) and its two buttons, all in the theme. The frame
   * is this page's origin, so its buttons' presses are heard here, and an Escape pressed in it is passed on from the
   * frame's element, so the dialog holding it closes as it does with focus anywhere else in it. The sample's menu takes
   * every Escape to stay open, so the frame passes Escape on whether or not it was taken.
   */
  const cardHtml = ({ pick, title }: Choice) => `<iframe class="theme" data-pick="${esc(JSON.stringify(pick))}" title="${esc(title)}"></iframe>`

  /** The frames again, from scratch: a new list, a new scheme, or tweak sheets that changed under them. */
  const frames = () => {
    const list = $('.themes')
    const all = choices()
    list.innerHTML = all.map(cardHtml).join('')
    const sample = sampleOf()
    list.querySelectorAll<HTMLIFrameElement>('iframe.theme').forEach((frame, i) => {
      frame.addEventListener('load', () => {
        const doc = frame.contentDocument!
        doc.addEventListener('click', clicked)
        doc.addEventListener('keydown', (k) => k.key === 'Escape' && frame.dispatchEvent(new KeyboardEvent('keydown', { key: k.key, code: k.code, bubbles: true, cancelable: true, composed: true })))
        marks()
      })
      frame.srcdoc = frameDoc(all[i], sample)
    })
    marks()
  }

  /** The marks and buttons as the choices stand, the frames left as they are; a frame still loading is marked as it loads. */
  const marks = () => {
    const { now, actions } = headHtml()
    paintOnce($('.now'), now)
    paintOnce($('.shelf-head .actions'), actions)
    const { screen, tower: towers, drawn } = tower.theme.get()
    for (const frame of host.querySelectorAll<HTMLIFrameElement>('iframe.theme')) {
      const pick = JSON.parse(frame.dataset.pick!) as ThemePick
      frame.toggleAttribute('data-drawn', drawn === pick)
      const doc = frame.contentDocument
      const use = doc?.querySelector<HTMLButtonElement>('[data-use]')
      if (!doc || !use) continue
      doc.querySelector('.marks')!.textContent = [screen !== undefined && screen === pick && 'this screen', towers === pick && "the tower's"].filter(Boolean).join(' · ')
      use.disabled = drawn === pick
      doc.querySelector<HTMLButtonElement>('[data-make]')!.disabled = towers === pick
    }
  }

  const makeTowers = (pick: ThemePick) =>
    tower.theme.pick(pick).then(
      () => tower.theme.follow(),
      (err: Error & { code?: string }) =>
        kit.toast(err.code === 'changed' || err.code === 'exists' ? "The config's theme changed meanwhile: look again and pick once more" : `The config kept its theme: ${err.message}`),
    )

  function clicked(e: Event) {
    const target = e.target as Element
    if (target.closest('[data-scheme-toggle]')) return ((scheme = scheme === 'dark' ? 'light' : 'dark'), frames())
    if (target.closest('[data-follow]')) return tower.theme.follow()
    const use = target.closest<HTMLElement>('[data-use]')?.dataset.use
    if (use !== undefined) return tower.theme.use(JSON.parse(use))
    const make = target.closest<HTMLElement>('[data-make]')?.dataset.make
    if (make !== undefined) return void makeTowers(JSON.parse(make))
  }
  host.addEventListener('click', clicked)

  /**
   * What the frames are drawn from: the choices and the config's tweak sheets, every frame's last; the renderer's theme
   * URLs less the first, the config's pick, when it picks one.
   */
  const drawnFrom = () => {
    const urls = board.themes[renderer.name] ?? []
    return JSON.stringify([choices(), urls.slice(board.offeredThemes[renderer.name]?.some((t) => t.picked) ? 1 : 0)])
  }
  let drawn = drawnFrom()
  frames()
  const offs = [tower.onThemes(marks)]
  return {
    update(next) {
      board = next
      const now = drawnFrom()
      if (now === drawn) return marks()
      drawn = now
      frames()
    },
    close: () => offs.forEach((off) => off()),
  }
}
