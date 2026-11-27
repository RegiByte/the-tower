import { fail } from '../checks.js'

/**
 * An Escape passed out of a frame (`passEscapeOut`): a `<tower-dialog>` holding a frame of the page's origin closes on
 * an Escape pressed inside the frame, as it does with focus anywhere else in it.
 */

const FRAME = `<body style="margin: 0; padding: 12px; font: 13px system-ui"><label>Inside the frame <input id="typed" value="Escape here"></label></body>`

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'escape-out',
  title: 'An Escape passed out of a frame',
  about: 'A dialog holding a frame: Escape pressed in the frame closes the dialog, as it does anywhere else in it. Without passEscapeOut the frame keeps the key.',
  size: [420, 300],
  html: () => `<button type="button" id="opener">Open the dialog</button>
<tower-dialog id="dialog" label="A dialog holding a frame" data-owned="children"></tower-dialog>`,
  async wire(doc) {
    const { passEscapeOut } = await import('/lib/chrome.js')
    await import('/lib-ui/dialog.js')
    await customElements.whenDefined('tower-dialog')
    const dialog = /** @type {HTMLElement & { open: boolean, body: HTMLElement }} */ (doc.getElementById('dialog'))
    const opener = /** @type {HTMLButtonElement} */ (doc.getElementById('opener'))
    const frame = Object.assign(doc.createElement('iframe'), { title: 'A frame in the dialog', srcdoc: FRAME })
    frame.style.cssText = 'display: block; width: 100%; height: 72px; border: 1px solid var(--line); border-radius: var(--radius);'
    dialog.body.append(frame)
    passEscapeOut(frame)
    opener.addEventListener('click', () => (dialog.open = true))
    dialog.addEventListener('openchange', (e) => (dialog.open = /** @type {CustomEvent<{ value: boolean }>} */ (e).detail.value))
    const loaded = new Promise((r) => frame.addEventListener('load', r, { once: true }))
    const input = () => /** @type {HTMLInputElement} */ (frame.contentDocument?.getElementById('typed'))
    return {
      open: async () => {
        opener.focus()
        dialog.open = true
        await loaded
        frame.contentWindow?.focus()
        input().focus()
        return { open: dialog.open, focused: frame.contentDocument?.activeElement?.id }
      },
      /** An Escape as a key pressed in the frame's field. */
      escapeInFrame: () => (input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })), true),
      state: () => ({ open: dialog.open }),
      /**
       * The dialog is open, the page's focus in the frame and the frame's in its field, as `open` leaves them: with the
       * page's focus anywhere else, an Escape would close the dialog without passing through the frame.
       */
      opened: () => {
        const seen = { open: dialog.open, frameFocused: doc.activeElement === frame, focused: frame.contentDocument?.activeElement?.id }
        if (!seen.open || !seen.frameFocused || seen.focused !== 'typed') fail('the dialog should be open with focus in the frame', seen)
        return seen
      },
      /** An Escape pressed in the frame closed the dialog. */
      closed: () => {
        const seen = { open: dialog.open }
        if (seen.open) fail('an Escape pressed in the frame should close the dialog holding it', seen)
        return seen
      },
    }
  },
}
