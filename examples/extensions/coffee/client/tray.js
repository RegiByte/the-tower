import { plural } from '/cards.js'
import { itemsCss, pressTrayHtml } from '/items.js'
import { floorCoffee } from './rounds.js'

/**
 * `coffee/tray`, the coffee collection in a floor's row of trays: whether a round is open and who is there, and the
 * ideas waiting on the user, pressed while the floor's coffee machine is open, which a press opens. A floor with no
 * round yet draws the machine alone, so coffee time is one press away.
 */

const ID = 'coffee/tray'

const VIEW = 'coffee/machine'

export function mount(host, { board: first, subject, kit }) {
  let board = first
  const project = subject.value.project
  const floorKey = `floor:${project}`
  let painted = ''

  const draw = () => {
    const { open, rounds, pending } = floorCoffee(board.floors.find((f) => f.id === project))
    const at = kit.location?.()
    const label = open
      ? `☕ <b>${open.present.length}</b> at the machine${pending ? ` <i class="needs">${plural(pending, 'idea')} for you</i>` : ''}`
      : `☕ <b>${rounds.length}</b> ${rounds.length === 1 ? 'round' : 'rounds'}${pending ? ` <i class="needs">${plural(pending, 'idea')} for you</i>` : ''}`
    const html = `<style>:where([data-view="${ID}"]) { ${itemsCss} }</style>${pressTrayHtml(at?.view === VIEW && at.subject === floorKey, label, open ? 'coffee time is on: who is at the machine, what they said, the ideas left for you' : 'the coffee machine: call coffee time, read earlier rounds, decide on the ideas left for you')}`
    if (html !== painted) host.innerHTML = painted = html
  }

  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-tray]')) kit.display(floorKey, { view: VIEW })
  })

  draw()
  return {
    update(next) {
      board = next
      draw()
    },
    close() {},
  }
}
