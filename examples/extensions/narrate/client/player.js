/**
 * Narration's player: while something is read, a bar of narrate's own at the bottom right of the page says what is
 * read, with the speed, Pause and Stop. It answers what a notice answers (`say`, `close`), so a reading tells it as it
 * would a notice. Pause holds the voice where it is and turns to Resume, in every player at once, as the palette's
 * Pause listening and Resume listening do. The speed is a button that opens a menu of the speeds, a check by the one read at, as Google Docs' reader
 * does: a popover, so a press elsewhere closes it, as Escape does (focus back on the button); the arrow keys move
 * along it. It follows the speed as this page changes it (the palette, another player) through `tower.store.on`, which
 * hears only the keys this page sets: a speed picked in another tab shows from its next reading. A memo said in the
 * middle of a reading stands its player above the reading's, as notices stack; the players are narrate's elements, each
 * removed as what it tells ends, their stack with the last.
 */
import { chooseSpeed, SPEED_KEY, SPEEDS, speedOf, speedWords } from './speed.js'
import * as voice from './voice.js'

const STYLE = `
[data-narrate-players] { position: fixed; right: 20px; bottom: 56px; z-index: 20; display: flex; flex-direction: column; align-items: flex-end;
  gap: var(--sp-s); max-width: min(560px, calc(100vw - 32px)); }
[data-narrate-player] { display: flex; align-items: center; gap: var(--sp-m); max-width: 100%; padding: var(--sp-s) var(--sp-s) var(--sp-s) var(--sp-l);
  background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: var(--radius); box-shadow: var(--shadow); }
[data-narrate-player] .words { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-narrate-player] button { flex: none; }
[data-narrate-player] .speed { min-width: 3.5em; font-variant-numeric: tabular-nums; }
[data-narrate-player] .pause { min-width: 5.5em; }
[data-narrate-player] .speeds { position: fixed; inset: auto; margin: 0; padding: var(--sp-xs) 0; min-width: 6em; background: var(--panel); color: var(--ink);
  border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
[data-narrate-player] .speeds button { display: grid; grid-template-columns: 1.5em auto; width: 100%; padding: var(--sp-xs) var(--sp-l) var(--sp-xs) var(--sp-m);
  font: inherit; font-variant-numeric: tabular-nums; text-align: left; color: var(--ink); background: none; border: 0; border-radius: 0; cursor: pointer; }
[data-narrate-player] .speeds button:hover, [data-narrate-player] .speeds button:focus-visible { background: var(--panel-2); outline: none; }
@media (max-width: 600px) { [data-narrate-players] { left: 16px; right: 16px; max-width: none; align-items: stretch; } }
`

/** The stack the players stand in, while one does. @type {HTMLElement | undefined} */
let stack

/** An element with its class and text. */
const el = (tag, className, text) => Object.assign(document.createElement(tag), className ? { className } : {}, text === undefined ? {} : { textContent: text })

/** The stack, made with its style as the first player opens. */
const stackOf = () => {
  if (stack) return stack
  stack = el('div')
  stack.dataset.narratePlayers = ''
  stack.append(el('style', '', STYLE))
  document.body.append(stack)
  return stack
}

/**
 * The speed button and its menu: pressing it opens the speeds above it, the one read at checked and focused; picking
 * one calls `choose` and closes the menu. Answers both elements and `show(speed)`, which draws the speed read at.
 */
const speedMenu = (choose) => {
  const button = el('button', 'speed')
  button.title = 'Reading speed'
  button.setAttribute('aria-haspopup', 'menu')
  const menu = el('div', 'speeds')
  menu.popover = 'auto'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Speed')
  const items = SPEEDS.map((speed) => {
    const item = el('button')
    item.setAttribute('role', 'menuitemradio')
    item.append(el('span', 'check'), el('span', '', String(speed)))
    item.addEventListener('click', () => (menu.hidePopover(), choose(speed)))
    return { speed, item }
  })
  menu.append(...items.map((i) => i.item))

  const show = (speed) => {
    button.textContent = speedWords(speed)
    button.setAttribute('aria-label', `Speed ${speedWords(speed)}`)
    for (const { speed: s, item } of items) {
      item.setAttribute('aria-checked', String(s === speed))
      item.querySelector('.check').textContent = s === speed ? '✓' : ''
    }
  }

  /** Opens the menu placed above the button, its right edge on the button's, the speed read at focused. */
  const open = () => {
    menu.showPopover()
    const at = button.getBoundingClientRect()
    menu.style.left = `${Math.max(16, Math.min(at.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 16))}px`
    menu.style.top = `${Math.max(16, at.top - menu.offsetHeight - 4)}px`
    menu.dataset.placed = ''
    ;(items.find((i) => i.item.getAttribute('aria-checked') === 'true') ?? items[0]).item.focus()
  }
  button.addEventListener('click', () => (menu.matches(':popover-open') ? menu.hidePopover() : open()))
  menu.addEventListener('toggle', (e) => {
    const opened = /** @type {ToggleEvent} */ (e).newState === 'open'
    button.setAttribute('aria-expanded', String(opened))
    if (!opened) delete menu.dataset.placed
  })
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return void (e.preventDefault(), menu.hidePopover(), button.focus())
    const by = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!by) return
    e.preventDefault()
    const at = items.findIndex((i) => i.item === document.activeElement)
    items[(at + by + items.length) % items.length].item.focus()
  })
  return { button, menu, show }
}

/**
 * The pause button: Pause while the voice reads, Resume while it is paused, following the voice as any player or the
 * palette pauses it. Answers the button and `close`, which stops following.
 */
const pauseButton = () => {
  const button = el('button', 'pause')
  const show = (paused) => {
    button.textContent = paused ? 'Resume' : 'Pause'
    button.setAttribute('aria-pressed', String(paused))
  }
  button.addEventListener('click', () => (voice.isPaused() ? voice.resume() : voice.pause()))
  show(voice.isPaused())
  return { button, close: voice.onPause(show) }
}

/**
 * Opens a player saying `words`, at the viewer's speed, with Pause, its Stop running `stop`. Answers `say` to tell it anew and
 * `close` to remove it.
 */
export function openPlayer({ tower, words, stop }) {
  const bar = el('div')
  bar.dataset.narratePlayer = ''
  bar.setAttribute('role', 'region')
  bar.setAttribute('aria-label', 'Narration')
  const said = el('span', 'words', words)
  const speed = speedMenu((rate) => void chooseSpeed(tower, rate))
  const hold = pauseButton()
  const halt = el('button', '', 'Stop')
  halt.addEventListener('click', () => void stop())
  bar.append(said, speed.button, hold.button, halt, speed.menu)
  stackOf().prepend(bar)

  const shown = async () => speed.show(await speedOf(tower))
  shown()
  const unhear = tower.store.on((key) => key === SPEED_KEY && shown())

  return {
    say: (next) => void (said.textContent = next),
    close() {
      unhear()
      hold.close()
      bar.remove()
      if (stack && !stack.querySelector('[data-narrate-player]')) (stack.remove(), (stack = undefined))
    },
  }
}
