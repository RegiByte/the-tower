/**
 * Text put on the clipboard. `navigator.clipboard` exists only in a secure context, and a tower may be reached by a
 * name of the config's `hosts` over plain http, where it is undefined: there the document's copy command does it.
 */

/** `text` copied by the document's copy command, from a field selected for the moment, the focus put back after. */
const copiedByCommand = (text: string) => {
  const was = document.activeElement as HTMLElement | null
  const field = Object.assign(document.createElement('textarea'), { value: text, readOnly: true })
  field.style.cssText = 'position: fixed; inset: 0 auto auto 0; opacity: 0'
  document.body.append(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  was?.focus({ preventScroll: true })
  if (!copied) throw new Error('The browser refused to copy: select the text and copy it by hand')
}

/** Puts `text` on the clipboard, settling when it is there and rejecting with what to do when the browser refuses. */
export const copyText = (text: string): Promise<void> =>
  window.isSecureContext ? navigator.clipboard.writeText(text) : new Promise((copied) => copied(copiedByCommand(text)))

/** Puts `text` on the clipboard and toasts the outcome: `Copied <what>`, or why it wasn't. */
export const copyTelling = (text: string, what: string, toast: (said: string) => unknown): Promise<void> =>
  copyText(text).then(
    () => void toast(`Copied ${what}`),
    (err: Error) => void toast(err.message),
  )
