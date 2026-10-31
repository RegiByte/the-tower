/**
 * Tab line's one command, run by renderers that import client modules: asks for the worker's line and writes it
 * through the fact's door, `tabline/facts/line`. The line on the card is the tower's projection of that fact.
 */

/** The worker's line as the card shows it now, empty when it has none. */
const lineOf = (board, card) => board.adds[`card:${card}`]?.lines?.find((l) => l.cap === 'tabline')?.text ?? ''

/** Asks for one line in a small modal `<dialog>`: answers the text, or `null` when the viewer cancels. */
const askLine = (title, was) =>
  new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.innerHTML = `<form method="dialog" style="display:flex;flex-direction:column;gap:8px;min-width:320px">
      <label style="font:inherit"></label>
      <input name="line" maxlength="80" autocomplete="off" style="font:inherit;padding:4px 6px">
      <div style="display:flex;gap:8px;justify-content:flex-end"><button value="cancel">Cancel</button><button value="ok">Save</button></div>
    </form>`
    dialog.querySelector('label').textContent = title
    const input = dialog.querySelector('input')
    input.value = was
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      dialog.close('ok')
    })
    dialog.addEventListener('close', () => {
      dialog.remove()
      resolve(dialog.returnValue === 'ok' ? input.value : null)
    })
    document.body.append(dialog)
    dialog.showModal()
    input.select()
  })

/** Names the worker's tab: an empty line clears it. */
export async function set({ tower, board, subject }) {
  const line = await askLine(`A line for ${subject.callsign} (empty clears it)`, lineOf(board, subject.id))
  if (line === null) return
  const reply = await tower.call('tabline/facts/line', { session: subject.id, value: line.trim() || null })
  if (reply?.t === 'error') throw new Error(reply.message)
}
