import { choice, section } from '/lib/settings.js'
import type { Tower } from '../api.ts'
import { lightRamp } from '../toon.ts'

/**
 * The lighting setting: the light rig that follows the clock (rig.ts), contact shadows under your level (contact.ts)
 * and the night's bloom (bloom.ts). On unless the viewer turned it off, kept in `tower.store` under `LIGHTING_KEY`, and
 * read once as the page starts (system.ts), before anything draws: the rig changes the toon ramp and every lit
 * material's shader as they are made, so a change applies on the next load. A fixture page (`?board=`) takes
 * `?lighting=off` instead (`fixtureLighting`). Off, the building and the city are lit by the outside's hemisphere, sun and ambient
 * alone; a page that never starts it (the lab) is off.
 */

export const LIGHTING_KEY = 'tower3d.lighting'

/** The setting as this page draws it until it reloads (`lit`), its ramp banded, and `choose` keeping one for the next load. */
function lighting(tower: Tower, lit: boolean) {
  if (lit) lightRamp()
  return { lit, choose: (on: boolean) => tower.store.set(LIGHTING_KEY, on) }
}

export type Lighting = ReturnType<typeof lighting>

/** Reads the setting from `tower.store`. */
export async function startLighting({ tower }: { tower: Tower }): Promise<Lighting> {
  return lighting(tower, (await tower.store.get(LIGHTING_KEY)) !== false)
}

/** A fixture page's setting: on unless the page was opened with `?lighting=off`. */
export const fixtureLighting = ({ tower }: { tower: Tower }): Lighting => lighting(tower, new URLSearchParams(location.search).get('lighting') !== 'off')

const CHOICES = [
  { on: true, label: 'On', means: 'the sun follows the clock and casts shadows, what stands on the floor is grounded, and at night what glows blooms' },
  { on: false, label: 'Off', means: 'one even light over everything, lighter on the graphics card' },
]

/** The settings popover's section: on or off, and a reload while the page draws other than chosen (`lit`). */
export const lightingSection = (chosen: boolean, lit: boolean) =>
  section('Lighting', 'sun, shadows and night glow',
    `<div class="seg" role="group" aria-label="lighting">${CHOICES.map(({ on, label, means }) => choice('data-lighting', String(on), label, means, on === chosen)).join('')}</div>` +
    (chosen === lit ? '' : '<div class="row"><button data-lighting-reload data-tip="the lighting is set as the page loads">Reload to apply</button></div>'))
