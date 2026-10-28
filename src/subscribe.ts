/**
 * The tower's edge to the OS's file events: a recursive watch of a tree that reports which paths changed, nothing
 * more, through `@parcel/watcher`. On macOS each subscription is an FSEvents stream of its own: Node's recursive
 * `fs.watch` shares one stream across the process and recreates it whenever a watch opens or closes, losing every
 * watch's events in between. On Linux it is inotify, a watch per directory, ignored ones skipped.
 */
import watcher from '@parcel/watcher'
import { logged, loggedRead } from './logged.ts'

export type Subscription = { close: () => Promise<void> }

/** FSEvents dropped events and says so: the watch goes on, and what changed is unknown. */
const MUST_RESCAN = 'must be re-scanned.'

/**
 * Watches `root` and every directory below it, but those `ignore` names (their contents ignored with them), all real
 * paths, as the events name them. Resolves once watching, so a change after it resolves is reported; rejects when the watch can't start.
 * `changed` gets the absolute paths that changed, or `null` when what changed is unknown and everything under `root`
 * may have. `failed` gets why the watch stopped, `root` removed among them; nothing is reported after it.
 */
export const subscribe = async (root: string, ignore: string[], changed: (paths: string[] | null) => void, failed: (err: Error) => void): Promise<Subscription> => {
  let stopped = false
  const options = { ignore }
  const unsubscribe = loggedRead(`unwatch of ${root}`, () => watcher.unsubscribe(root, onEvents, options))
  const onEvents = logged(`watch of ${root}`, (err: Error | null, events: watcher.Event[]) => {
    if (stopped) return
    if (err && !err.message.endsWith(MUST_RESCAN)) {
      stopped = true
      return failed(err)
    }
    if (events.some((e) => e.type === 'delete' && e.path === root)) {
      stopped = true
      void unsubscribe()
      return failed(new Error(`${root} was removed`))
    }
    changed(err ? null : events.map((e) => e.path))
  })
  await watcher.subscribe(root, onEvents, options)
  return {
    close: () => {
      if (stopped) return Promise.resolve()
      stopped = true
      return unsubscribe()
    },
  }
}
