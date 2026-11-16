import type { Tower } from './api.ts'

/** The page's elements by id, and showing or hiding one. */
export const $ = (id: string) => document.getElementById(id)!
export const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on)

/**
 * A document drawn in a frame follows the viewer's appearance: drawn again when the record changes, or the system's
 * scheme while the viewer chose none.
 */
export const onAppearance = (tower: Tower, fn: () => void) => (tower.onScheme(() => tower.prefs.get().scheme || fn()), tower.prefs.on(fn))
