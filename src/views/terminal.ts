import type { Board, Card } from '../bridge/board.ts'
import { keysLabel } from '../shared/keymap.ts'
import { modeText, type TermView } from '../shared/term-view.ts'
import type { Mount } from '../shared/views.ts'

/**
 * A worker's session in its terminal, streamed while the view is mounted: the PTY's one size held by whoever types, and
 * a chip saying so while this viewer only watches.
 */

const ID = 'tower/terminal'

const CSS = `:where([data-view="${ID}"]) {
  position: absolute; inset: 0; padding: var(--sp-l);
  & .term { width: 100%; height: 100%; }
  & .mode { position: absolute; top: 8px; right: 12px; z-index: 1; padding: var(--sp-2xs) var(--sp-m); border-radius: var(--radius-pill); background: var(--panel); color: var(--muted); font-size: var(--fs-s);
    box-shadow: var(--shadow); pointer-events: none; }
  & .mode:empty { display: none; }
}`

/** How often the chip reads how the terminal holds its PTY. */
const MODE_MS = 250

/** The chip's words: none while this viewer holds the PTY, else how it holds it and the chord that leaves. */
const chipText = (view: TermView, board: Board) => {
  if (view.t === 'opening' || view.t === 'owning') return ''
  const leave = keysLabel(board.keys, 'leave-terminal')
  return modeText(view) + (leave ? ` · ${leave} leaves` : '')
}

export const mount: Mount = (host, { board: first, subject, kit }) => {
  let board = first
  const id = (subject.value as Card).id
  host.innerHTML = `<style>${CSS}</style><div class="term" aria-label="Terminal"></div><span class="mode"></span>`
  const chip = host.querySelector<HTMLElement>('.mode')!
  const term = kit.terminal(host.querySelector<HTMLElement>('.term')!, `terminal/${id}`)
  const paint = () => {
    const text = chipText(term.state(), board)
    if (chip.textContent !== text) chip.textContent = text
  }
  let poll: ReturnType<typeof setInterval> | undefined
  const watch = (on: boolean) => {
    clearInterval(poll)
    poll = on ? setInterval(paint, MODE_MS) : undefined
    if (on) paint()
  }
  watch(true)
  return {
    update(next) {
      board = next
    },
    visible: watch,
    close() {
      clearInterval(poll)
      term.close()
    },
  }
}
