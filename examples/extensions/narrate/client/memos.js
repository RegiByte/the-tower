/**
 * Narration's memos view, mounted on the board in a strip a renderer keeps for as long as its page is open
 * (`board.strip` on the tower page). It lists what workers said aloud today (each worker's card carries its latest
 * memos), the newest first, each to hear again. A memo that arrives while the view is mounted is said aloud by the
 * page of this renderer the user acted on last (`board.viewers.last[<renderer>]` is this page's `tower.viewer`), so a
 * tab of another renderer the user is at leaves it to the tower page they used last; every other page lists it
 * silently, and one the user hasn't pressed or typed on yet, which the browser lets play nothing, shows it as a notice
 * to hear. What was on the board when the view mounted is never said on its own.
 */
import * as voice from './voice.js'

/** Today's memos, the newest first, each with its worker's callsign beside what its card carries. */
const memosOf = (board) => {
  const today = new Date().setHours(0, 0, 0, 0)
  return board.floors
    .flatMap((f) => f.cards)
    .flatMap((card) => (card.x?.narrate?.memos ?? []).map((m) => ({ ...m, callsign: card.callsign })))
    .filter((m) => m.at >= today)
    .sort((a, b) => b.at - a.at)
}

const timeOf = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const STYLE = `
:where([data-view="narrate/memos"]) .memos { display: grid; gap: var(--sp-xs); font-size: var(--fs-s); }
:where([data-view="narrate/memos"]) .memo { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 var(--sp-s); padding: var(--sp-xs) var(--sp-s); border-left: 2px solid var(--line-strong); }
:where([data-view="narrate/memos"]) .memo.sounding { border-left-color: var(--accent); }
:where([data-view="narrate/memos"]) .who { color: var(--muted); }
:where([data-view="narrate/memos"]) .who b { color: var(--ink); font-weight: 600; }
:where([data-view="narrate/memos"]) .memo p { grid-column: 1; margin: 0; overflow-wrap: anywhere; }
:where([data-view="narrate/memos"]) .memo button { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
:where([data-view="narrate/memos"]) .foot { display: flex; gap: var(--sp-s); }
:where([data-view="narrate/memos"]) button { font: inherit; color: var(--muted); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
:where([data-view="narrate/memos"]) button:hover, :where([data-view="narrate/memos"]) button:focus-visible { color: var(--ink); }
`

/** An element with its class and text. */
const el = (tag, className, text) => Object.assign(document.createElement(tag), className ? { className } : {}, text === undefined ? {} : { textContent: text })

export function mount(host, { tower, board, kit, state }) {
  /** The memos on the board as the view mounted: listed, never said on their own. */
  const heard = new Set(memosOf(board).map((m) => m.key))
  let memos = memosOf(board)
  let open = false
  /** The newest memo the user cleared, by its time: those up to it are no longer listed. */
  let cleared = 0
  /** The memo sounding now. */
  let sounding

  const listed = () => memos.filter((m) => m.at > cleared)

  /** What the view last drew from: it draws again only when that moves, so a press's focus stays through boards. */
  let drawn

  const draw = () => {
    const shown = listed()
    const from = JSON.stringify([shown.map((m) => m.key), open, sounding])
    if (from === drawn) return
    drawn = from
    if (!shown.length) return host.replaceChildren()
    const list = el('div', 'memos')
    for (const memo of open ? shown : shown.slice(0, 1)) {
      const row = el('div', `memo${memo.key === sounding ? ' sounding' : ''}`)
      const who = el('span', 'who')
      who.append(el('b', '', memo.callsign), ` · ${timeOf(memo.at)}`)
      const again = el('button', '', memo.key === sounding ? 'Saying' : 'Hear again')
      again.addEventListener('click', () => hear(memo))
      row.append(who, again, el('p', '', memo.text))
      list.append(row)
    }
    const foot = el('div', 'foot')
    if (shown.length > 1) {
      const more = el('button', '', open ? 'Only the latest' : `${shown.length - 1} more today`)
      more.addEventListener('click', () => ((open = !open), draw()))
      foot.append(more)
    }
    const clear = el('button', '', 'Clear')
    clear.addEventListener('click', () => {
      cleared = shown[0].at
      state.set('cleared', cleared)
      draw()
    })
    foot.append(clear)
    list.append(foot)
    host.replaceChildren(el('style', '', STYLE), list)
  }

  /** Says `memo` aloud, after the chunk sounding when something is being read: its row marked and a notice standing meanwhile. */
  const hear = async (memo) => {
    const text = `${memo.callsign} says: ${memo.text}`
    let notice
    const track = {
      at() {
        sounding = memo.key
        draw()
        notice ??= kit.notice(text, { label: 'Stop', run: voice.stop })
      },
      end() {
        if (sounding === memo.key) sounding = undefined
        draw()
        notice?.close()
      },
    }
    try {
      const { command } = await tower.get('narrate/voice')
      await voice.interject({ tower, text, track, toast: kit.toast }, command)
    } catch (err) {
      kit.toast(err.message)
    }
  }

  /**
   * A browser plays nothing on a page the user hasn't pressed or typed on since it loaded: there, a memo stands as a
   * notice whose Hear says it.
   */
  const offer = (memo) => {
    const notice = kit.notice(`${memo.callsign} says: ${memo.text}`, { label: 'Hear', run: () => (notice.close(), hear(memo)) })
  }

  /** The renderer this page is: a memo is said by the page of it the user acted on last (`viewers.last`). */
  let renderer
  tower.renderer().then((r) => (renderer = r?.name))

  state.get('cleared').then((at) => {
    cleared = typeof at === 'number' ? at : 0
    draw()
  })
  draw()

  return {
    update(next) {
      memos = memosOf(next)
      const fresh = memos.filter((m) => !heard.has(m.key)).reverse()
      for (const m of fresh) heard.add(m.key)
      draw()
      if (renderer !== undefined && next.viewers.last?.[renderer] === tower.viewer) for (const m of fresh) (navigator.userActivation.hasBeenActive ? hear(m) : offer(m))
    },
    close() {
      drawn = undefined
      host.replaceChildren()
    },
  }
}
