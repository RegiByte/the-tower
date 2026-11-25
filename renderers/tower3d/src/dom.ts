import type { Tower } from './api.ts'

/** The page's elements by id, and showing or hiding one. */
export const $ = (id: string) => document.getElementById(id)!
export const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on)

/**
 * A document drawn in a frame follows the viewer's appearance and the renderer's themes: drawn again when the record
 * or the themes change, or the system's scheme while the viewer chose none.
 */
export const onAppearance = (tower: Tower, fn: () => void) => (tower.onScheme(() => tower.prefs.get().scheme || fn()), tower.onThemes(fn), tower.prefs.on(fn))
