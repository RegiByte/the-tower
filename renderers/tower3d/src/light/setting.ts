import { choice, section } from '../../../../src/shared/settings.ts'
import { tower } from '../api.ts'
import { FIXTURE } from '../fixtures.ts'

/**
 * The lighting setting: the light rig that follows the clock (rig.ts), contact shadows under your level (contact.ts)
 * and the night's bloom (bloom.ts). On unless the viewer turned it off, kept in `tower.store` under `LIGHTING_KEY`, and
 * read once before the page loads (boot.ts): the rig changes the toon ramp and every lit material's shader as they are
 * made, so a change applies on the next load. A fixture page (`?board=`) reads no store and takes `?lighting=off`.
 * Off, the building and the city are lit by the outside's hemisphere, sun and ambient alone.
 */

export const LIGHTING_KEY = 'tower3d.lighting'

/** Whether this page draws the lighting: set by `startLighting` before the rest of the page loads; off in a page that never starts it (the lab). */
export let LIT = false

export async function startLighting() {
  LIT = FIXTURE === undefined ? (await tower.store.get(LIGHTING_KEY)) !== false : new URLSearchParams(location.search).get('lighting') !== 'off'
}

const CHOICES = [
  { on: true, label: 'On', means: 'the sun follows the clock and casts shadows, what stands on the floor is grounded, and at night what glows blooms' },
  { on: false, label: 'Off', means: 'one even light over everything, lighter on the graphics card' },
]

/** The settings popover's section: on or off, and a reload while the page draws other than chosen. */
export const lightingSection = (chosen: boolean) =>
  section('Lighting', 'sun, shadows and night glow',
    `<div class="seg" role="group" aria-label="lighting">${CHOICES.map(({ on, label, means }) => choice('data-lighting', String(on), label, means, on === chosen)).join('')}</div>` +
    (chosen === LIT ? '' : '<div class="row"><button data-lighting-reload data-tip="the lighting is set as the page loads">Reload to apply</button></div>'))

export function chooseLighting(on: boolean) {
  if (FIXTURE === undefined) tower.store.set(LIGHTING_KEY, on)
}
