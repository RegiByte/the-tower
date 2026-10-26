/**
 * The tower's edge to the OS's file events: a recursive watch of a tree that reports which paths changed, nothing
 * more. On macOS `fs.watch` is one FSEvents stream per tree; on Linux it is inotify, a watch per directory, ignored
 * ones included.
 */
import { watch } from 'node:fs'
import path from 'node:path'
import { logged } from './logged.ts'

export type Subscription = { close: () => void }

const inside = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`)

/**
 * Watches `root` and every directory below it, but those `ignore` names (absolute paths, their contents ignored with
 * them). `changed` gets the absolute paths that changed, or `null` when what changed is unknown and everything under
 * `root` may have. `failed` gets why the watch can't start or stopped; nothing is reported after it.
 */
export const subscribe = (root: string, ignore: string[], changed: (paths: string[] | null) => void, failed: (err: Error) => void): Subscription => {
  try {
    const watcher = watch(
      root,
      { recursive: true },
      logged(`watch of ${root}`, (_: string, file: string | null) => {
        if (file === null) return changed(null)
        const changedPath = path.join(root, file)
        if (!ignore.some((dir) => inside(changedPath, dir))) changed([changedPath])
      }),
    )
    watcher.on('error', (err) => {
      watcher.close()
      failed(err)
    })
    return { close: () => watcher.close() }
  } catch (err) {
    failed(err as Error)
    return { close: () => {} }
  }
}
