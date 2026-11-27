import { scene as ask } from './scenes/ask.js'
import { scene as combobox } from './scenes/combobox.js'
import { scene as dialog } from './scenes/dialog.js'
import { scene as escapeOut } from './scenes/escape-out.js'
import { scene as fit } from './scenes/fit.js'
import { scene as framePress } from './scenes/frame-press.js'
import { scene as menu } from './scenes/menu.js'
import { scene as split } from './scenes/split.js'
import { scene as popover } from './scenes/popover.js'
import { scene as tips } from './scenes/tips.js'
import { scene as toasts } from './scenes/toasts.js'

/**
 * A scene: one element or behavior, drawn in a frame from fixture data, its module `scenes/<id>.js` exporting it as
 * `scene`. `html` is its markup and `css` its layout, both
 * written into the frame; `wire` runs inside the frame once it has loaded, imports what it draws with (`/lib/` and
 * `/lib-ui/` modules are imported there, never at a scene module's top: the playground's own page imports the scenes,
 * and so does `tool:lib-ui` in Node for their fixtures) and returns its steps, what an agent runs through
 * `playground.act`. `size` is the frame's width and height in CSS pixels.
 *
 * @typedef {{ id: string, title: string, about: string, size: [number, number], css?: string, html: () => string, wire: (doc: Document, win: Window) => Steps | Promise<Steps> }} Scene
 * @typedef {Record<string, (...args: any[]) => unknown>} Steps
 */

/** Every scene, in the playground's order: the elements, then the behaviors. @type {Scene[]} */
export const SCENES = [menu, combobox, dialog, split, popover, tips, toasts, ask, fit, framePress, escapeOut]
