/** The dialog's look, whole, so a renderer draws it with `/design.css` and nothing of its own. */
const ASK_CSS = `
dialog[data-tower-ask], dialog[data-tower-ask] * { box-sizing: border-box; }
dialog[data-tower-ask] { width: min(520px, 92vw); padding: var(--sp-2xl); background: var(--panel); color: var(--ink); font: var(--fs-l)/1.45 var(--ui); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-pop); }
dialog[data-tower-ask]::backdrop { background: var(--backdrop); }
dialog[data-tower-ask][open] { display: flex; flex-direction: column; overflow: hidden; }
dialog[data-tower-ask] form { display: flex; flex-direction: column; min-height: 0; }
dialog[data-tower-ask] h2 { flex: none; margin: 0 0 var(--sp-l); max-height: 30vh; overflow: auto; font: 700 var(--fs-l)/1.35 var(--ui); text-transform: none; letter-spacing: 0; overflow-wrap: anywhere; }
dialog[data-tower-ask] .confirm-body { flex: 0 1 auto; min-height: 3em; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--muted); }
dialog[data-tower-ask] .confirm-body:empty { display: none; }
dialog[data-tower-ask] .actions { flex: none; display: flex; justify-content: flex-end; align-items: center; gap: var(--sp-m); margin-top: var(--sp-xl); color: var(--faint); font-size: var(--fs-s); }
dialog[data-tower-ask] button { font: inherit; font-weight: 700; font-size: var(--fs-m); color: var(--ink); background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--sp-xs) var(--sp-l); cursor: pointer; transition: border-color .15s ease-out, background .15s ease-out; }
dialog[data-tower-ask] button:hover { border-color: var(--deco); }
dialog[data-tower-ask] button.primary { background: var(--ink); color: var(--panel); border-color: var(--ink); }
dialog[data-tower-ask] button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
`

/** A press that begins and ends on `dialog`'s backdrop closes it. */
export const closeOnBackdrop = (dialog: HTMLDialogElement) => {
  const outside = (e: MouseEvent) => {
    const r = dialog.getBoundingClientRect()
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  }
  let pressedOutside = false
  dialog.addEventListener('pointerdown', (e) => (pressedOutside = e.target === dialog && outside(e)))
  dialog.addEventListener('click', (e) => e.target === dialog && pressedOutside && outside(e) && dialog.close())
}

/** The library's dialog, by a mark of its own, so an element a renderer names `confirm` is never taken for it. */
const dialogNow = () => document.querySelector<HTMLDialogElement>('dialog[data-tower-ask]')

/** The document's dialog, made the first time it is asked for: a renderer declares nothing. */
const askDialog = () => {
  const found = dialogNow()
  if (found) return found
  const dialog = document.createElement('dialog')
  dialog.dataset.towerAsk = ''
  dialog.setAttribute('aria-labelledby', 'tower-ask-title')
  dialog.setAttribute('aria-describedby', 'tower-ask-body')
  dialog.innerHTML = `<style>${ASK_CSS}</style><form method="dialog"><h2 id="tower-ask-title"></h2><div class="confirm-body" id="tower-ask-body"></div><div class="actions"><button value="">Cancel</button><button class="primary" id="tower-ask-yes" value="yes"></button></div></form>`
  closeOnBackdrop(dialog)
  // Framed, a key the page leaves alone goes on to the tower (`/frame-keys.js`), where Escape goes home.
  dialog.addEventListener('keydown', (e) => e.key === 'Escape' && (e.preventDefault(), dialog.close()))
  document.body.append(dialog)
  return dialog
}

/**
 * Asks `text` (a question, then what it means after a blank line, as the shared asks are written) with `verb` on the
 * button that goes ahead; answers whether it was pressed. Cancel, Escape and the backdrop answer no.
 */
export function ask(text: string, verb: string): Promise<boolean> {
  const dialog = askDialog()
  const [question, ...rest] = text.split('\n\n')
  const part = (id: string) => dialog.querySelector(`#tower-ask-${id}`) as HTMLElement
  part('title').textContent = question
  part('body').textContent = rest.join('\n\n')
  part('yes').textContent = verb
  dialog.returnValue = ''
  dialog.showModal()
  part('yes').focus()
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true }))
}

/** Whether `ask` is waiting for an answer: keys stay with its dialog. */
export const asking = () => dialogNow()?.open ?? false
