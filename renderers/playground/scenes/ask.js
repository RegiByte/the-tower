/**
 * The confirm dialog (`ask`): a question, what it means after a blank line, and the verb that goes ahead; Cancel, Escape
 * and the backdrop answer no.
 */

/** @type {import('../scenes.js').Scene} */
export const scene = {
  id: 'ask',
  title: 'The confirm dialog',
  about: 'ask(text, verb): the question, what it means, Cancel and the verb; Cancel, Escape and the backdrop answer no.',
  size: [420, 300],
  html: () => '',
  async wire(doc) {
    const { ask, asking } = await import('/lib/chrome.js')
    /** @type {Promise<boolean> | undefined} */
    let answer
    return {
      ask: () => ((answer = ask('Send AHAB-47 home?\n\nIts session ends; its worktree and branch stay.', 'Send home')), asking()),
      state: () => ({ asking: asking() }),
      /** Escape on the dialog, then what it answered. */
      escape: async () => {
        doc.querySelector('dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        return { answered: await answer, asking: asking() }
      },
    }
  },
}
