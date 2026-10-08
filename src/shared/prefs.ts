/**
 * A viewer's appearance: one record per browser, kept by tower.js (`tower.prefs`) for every page of theirs and
 * applied on each page's root before it paints. Each field's empty value follows the default: the system's scheme,
 * motion and contrast, the shipped face. A font is any face installed on the viewer's computer, by name, and falls
 * back to the shipped face (`type` of design.ts) for any character it lacks or when it isn't installed.
 *
 *   scheme     '' | 'light' | 'dark'      `data-scheme` on the root
 *   ui         a face's name, or ''       the `--ui` stack starts with it
 *   display    a face's name, or ''       the `--display` stack starts with it
 *   mono       a face's name, or ''       the `--mono` stack starts with it; terminals draw in it
 *   termSize   px                         a terminal's font when its viewer drives it, and the most a watched one grows to
 *   motion     '' | 'reduce' | 'full'     `data-motion` on the root: reduce or full override the system's setting
 *   contrast   '' | 'more'                `data-contrast` on the root: more strengthens muted text and lines
 *
 * The tower serves this module as `/prefs.js`.
 */
import type { SchemeChoice } from './shelf-page.ts'

export type Motion = '' | 'reduce' | 'full'
export type Contrast = '' | 'more'

export type Prefs = {
  scheme: SchemeChoice
  ui: string
  display: string
  mono: string
  termSize: number
  motion: Motion
  contrast: Contrast
}

export const PREFS_DEFAULT: Prefs = { scheme: '', ui: '', display: '', mono: '', termSize: 13, motion: '', contrast: '' }

/** The range of `termSize` a viewer may pick, in px. */
export const TERM_SIZES = { min: 9, max: 24 }

/** Font families CSS names by keyword: a name the viewer gives as one stays unquoted. */
export const GENERIC_FACES = ['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']

/** A face's name as a CSS font family. tower.js writes the stacks with the same rule. */
export const faceFamily = (name: string) => (GENERIC_FACES.includes(name) ? name : `"${name.replace(/["\\]/g, '\\$&')}"`)

/** Whether the page moves less: as the viewer set it on the root (`data-motion`), or else as the system does. */
export const reducedMotion = (): boolean => {
  const motion = document.documentElement.dataset.motion
  return motion ? motion === 'reduce' : matchMedia('(prefers-reduced-motion: reduce)').matches
}
