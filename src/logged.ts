/**
 * What runs with no caller to answer (a watcher's callback, a timer, a poll) says its failure in the process's log and
 * runs again on the next change or tick: an exception thrown there, or a rejection nothing handles, ends the process.
 */
import type { FSWatcher } from 'node:fs'

const say = (what: string) => (err: unknown) => console.error(`${what}:`, err)

export const logged =
  <A extends unknown[]>(what: string, run: (...args: A) => void) =>
  (...args: A): void => {
    try {
      run(...args)
    } catch (err) {
      say(what)(err)
    }
  }

/** Resolves once the read settles, failed or not: a failed read leaves what the last one read. */
export const loggedRead =
  (what: string, read: () => Promise<void>) =>
  (): Promise<void> =>
    read().catch(say(what))

/** A watcher that fails sees no more changes: the log says what is no longer watched. */
export const watchedLoudly = (watcher: FSWatcher, what: string): FSWatcher =>
  watcher.on('error', say(`${what} is no longer watched`))
