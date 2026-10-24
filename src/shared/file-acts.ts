/**
 * The Finder and editor controls of a file, wherever a panel names one, and the call a click on them makes. Bundled into
 * `/panels.js`.
 */
import type { Call } from './api.ts'
import { esc } from './cards.ts'
import { ICON } from './icons.ts'

/** The Finder and editor controls of a file, each opened by `open`, which names the element and its role. */
const fileActsHtml = (open: string, close: string, path: string, line?: number) => {
  const name = esc(path.replace(/\/$/, '').split('/').pop()!)
  return `<span class="file-acts">${open} class="file-act" data-reveal="${esc(path)}" aria-label="reveal ${name} in Finder" data-tip="reveal ${esc(path)} in Finder">${ICON.finder}${close}` +
    `${open} class="file-act" data-edit="${esc(path)}" ${line ? `data-line="${line}"` : ''} aria-label="open ${name} in your editor" data-tip="open ${esc(path)}${line ? `:${line}` : ''} in your editor">${ICON.editor}${close}</span>`
}

/** Quiet buttons that show a file or folder in Finder and open it in the user's editor, at `line` when given. */
export const fileButtonsHtml = (path: string, line?: number) => fileActsHtml('<button type="button"', '</button>', path, line)

/** `fileButtonsHtml` for a place inside another button, such as a tab, where a button may not sit: the same controls as spans. */
export const fileSpansHtml = (path: string) => fileActsHtml('<span role="button"', '</span>', path)

/** The call a click on a `data-reveal` or `data-edit` element makes: none when the click was elsewhere. */
export function fileCall(target: Element): Call<'reveal' | 'edit'> | undefined {
  const reveal = target.closest<HTMLElement>('[data-reveal]')?.dataset.reveal
  if (reveal) return ['reveal', { path: reveal }]
  const edit = target.closest<HTMLElement>('[data-edit]')
  if (!edit) return undefined
  const line = edit.dataset.line
  return ['edit', line ? { path: edit.dataset.edit!, line: Number(line) } : { path: edit.dataset.edit! }]
}
