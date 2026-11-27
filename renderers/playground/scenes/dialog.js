/**
 * `<tower-dialog>` over a frame-sized page: its title, its close button, a body taller than the dialog that scrolls
 * inside it, and focus coming back to the button that opened it.
 */

const PARAGRAPHS = Array.from({ length: 12 }, (_, i) => `<p>Paragraph ${i + 1}: the body scrolls inside the dialog, under its title, the close button kept in place.</p>`).join('')

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'dialog',
  title: '<tower-dialog>',
  about: 'A modal with a title and a close button; a body taller than it scrolls inside it; Escape, a press outside or the button close it and focus goes back.',
  size: [420, 360],
  html: () => `<button type="button" id="opener">Open the dialog</button>
<tower-dialog id="dialog" label="A dialog" data-owned="children"></tower-dialog>`,
  async wire(doc) {
    await import('/lib-ui/dialog.js')
    await customElements.whenDefined('tower-dialog')
    const dialog = /** @type {HTMLElement & { open: boolean, body: HTMLElement }} */ (doc.getElementById('dialog'))
    const opener = /** @type {HTMLButtonElement} */ (doc.getElementById('opener'))
    dialog.body.innerHTML = PARAGRAPHS
    opener.addEventListener('click', () => (dialog.open = true))
    dialog.addEventListener('openchange', (e) => (dialog.open = /** @type {CustomEvent<{ value: boolean }>} */ (e).detail.value))
    return {
      open: () => (opener.focus(), (dialog.open = true), true),
      close: () => ((dialog.open = false), true),
      state: () => ({ open: dialog.open, focused: doc.activeElement?.localName ?? null }),
    }
  },
}
