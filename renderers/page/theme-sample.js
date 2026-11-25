import { branchLine } from '/lib/cards.js'
import { ICON } from '/lib/view.js'
import { floorPlateHtml, workerRowHtml } from './sidebar.js'

/**
 * The page's sample for a theme's preview (`themeSample` in `renderer.json`): a floor's plate holding two workers, one
 * working on a worktree and one waiting on the viewer, drawn by the sidebar's own row and plate on sample cards.
 * @import { Card, Floor } from '/lib/board.js'
 */

const FLOOR = /** @type {Floor} */ ({ id: 'sample', name: 'Atlas' })

/** A sample worker on duty: `status`, `attention` and the tool it runs or asks about. @param {Partial<Card>} card */
const sampleCard = (card) => /** @type {Card} */ ({ project: FLOOR.id, cwd: '~/atlas', onDuty: true, enteredAt: Date.now(), conversations: [], says: [], ...card })

const WORKING = sampleCard({ id: 'sample-working', callsign: 'ORION-07', status: 'working', attention: 'working', tool: 'Edit src/app.ts', worktree: /** @type {Card['worktree']} */ ({ name: 'search', branch: 'tower/search' }) })
const WAITING = sampleCard({ id: 'sample-waiting', callsign: 'VEGA-12', status: 'needs_input', attention: 'needs', waiting: true, tool: 'Bash' })

const NO_ADDS = { by: '', lines: '', badges: '', note: '' }

/** @param {Card} c @param {boolean} selected */
const rowHtml = (c, selected) =>
  `<div class="crew-group">${workerRowHtml(c, { callsign: /** @type {string} */ (c.callsign), selected, calls: Boolean(c.waiting), adds: NO_ADDS, branch: branchLine(c), satellites: '', act: '' })}</div>`

/**
 * The sample's html, inside the sidebar as the page draws it, and the body's class it draws in: `drawer`, the sidebar
 * open on a window as narrow as a preview's frame.
 */
export const sample = () => ({
  bodyClass: 'drawer',
  html: `<aside class="side"><nav class="floors">${floorPlateHtml(FLOOR, {
    n: 1,
    open: true,
    style: '--p:var(--accent)',
    sign: `<button aria-label="new session on ${FLOOR.name}">${ICON.plus}</button>`,
    body: `<div class="sessions">${rowHtml(WORKING, true)}${rowHtml(WAITING, false)}</div>`,
  })}</nav></aside>`,
})
