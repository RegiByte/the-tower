import type { Call, Verb as ApiVerb, Verbs } from '/lib/extension.js'
import { closableNoticer, toaster, type Notice } from '/lib/chrome.js'
import { copyTelling } from '/lib/view.js'
import { tower } from './api.ts'
import { $ } from './dom.ts'

/**
 * What tells the user what happened: toasts, the notice that the tower serves newer code, and the API calls whose
 * failure is told in a toast.
 */
export type Toasts = ReturnType<typeof startToasts>

export function startToasts() {
  /** Tells what just happened, with an action that follows it up when given (`toasts.ts`). */
  const toast = toaster($('toasts'))

  /**
   * While the tower serves other code than this page loaded with (`tower.stale()`), a notice offers to reload the page,
   * never reloading it alone: a draft in progress would be lost. Its × hides it until the tower serves other code again.
   * Framed, the page framing Tower 3D says so, and its Reload reloads the frame.
   */
  const staleNotice: { shown?: Notice; hiddenFor?: string } = {}

  const closableNotice = closableNoticer($('toasts'))

  if (!tower.framed)
    tower.onStale((served) => {
      staleNotice.shown?.close()
      staleNotice.shown = undefined
      if (served === null || served.id === staleNotice.hiddenFor) return
      const words = served.version && served.version !== tower.served.version ? `The tower was updated to ${served.version}` : 'The tower was updated'
      staleNotice.shown = closableNotice(words, { label: 'Reload', run: () => location.reload() }, () => {
        staleNotice.hiddenFor = served.id
        staleNotice.shown = undefined
      })
    })

  const call = <K extends Parameters<typeof tower.call>[0]>(verb: K, body: Parameters<typeof tower.call<K>>[1]) =>
    tower.call(verb, body).catch((err: Error) => (toast(err.message), undefined))

  /** A call the board offers, with the fields the user supplied. */
  /** `request` with its failure told in a toast, a throw before anything is sent too: answers undefined then. */
  const tried = <R>(request: () => R | Promise<R>) => Promise.resolve().then(request).catch((err: Error) => (toast(err.message), undefined))

  const offered = <V extends ApiVerb>(c: Call<V>, fields?: Partial<Verbs[V]>) => tried(() => tower.run(c, fields))

  const copiedAs = (text: string, what: string) => copyTelling(text, what, toast)

  return { toast, call, tried, offered, copiedAs }
}
