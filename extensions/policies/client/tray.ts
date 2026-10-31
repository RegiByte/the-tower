import type { Floor, FloorCollection } from '../../../src/bridge/board.ts'
import { ICON } from '../../../src/shared/icons.ts'
import { itemsCss, pressTrayHtml } from '../../../src/shared/items.ts'
import type { Mount } from '../../../src/shared/views.ts'
import { floorPolicies } from './policies.ts'

/**
 * `policies/tray`, the policies collection in a floor's row of trays: how many policies, how many slots are offered,
 * how many need the user and how many are invalid, pressed while the floor's Policies are open, which a press opens.
 * A floor with no policies draws nothing.
 */

const ID = 'policies/tray'

const VIEW = 'policies/policies'

export const mount: Mount = (host, { board: first, subject, kit }) => {
  let board = first
  const project = (subject.value as FloorCollection & { project: string }).project
  const floorKey = `floor:${project}`
  let painted = ''

  const draw = () => {
    const { policies, offers } = floorPolicies(board.floors.find((f) => f.id === project) as Floor)
    const needs = policies.filter((p) => p.needs).length
    const invalid = policies.filter((p) => !p.header && !p.needs).length
    const at = kit.location?.()
    const label = `${ICON.resume} <b>${policies.length}</b> ${policies.length === 1 ? 'policy' : 'policies'}${offers.length ? `, ${offers.length} offered` : ''}${needs ? ` <i class="needs">${needs} need${needs === 1 ? 's' : ''} you</i>` : ''}${invalid ? ` <i>${invalid} invalid</i>` : ''}`
    const html = !policies.length
      ? ''
      : `<style>:where([data-view="${ID}"]) { ${itemsCss} }</style>${pressTrayHtml(at?.view === VIEW && at.subject === floorKey, label, 'standing work the tower runs at its slots: rules, standing, Run now and Approve, in the main pane')}`
    if (html !== painted) host.innerHTML = painted = html
  }

  host.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-tray]')) kit.display(floorKey, { view: VIEW })
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
