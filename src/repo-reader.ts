/**
 * A thread that reads project dirs' git for the board: each message is a read asked, a dir's refs (`rereadRefs`, its
 * git calls ahead of every checkouts read's) or its checkouts on those refs (`rereadCheckouts`), and its reply comes as
 * it settles, whatever else is still being read, so a repo that hangs delays only its own reads. Started by
 * `system.ts`, which keeps each repo's parts and sends them back with the next read.
 */
import { parentPort } from 'node:worker_threads'
import { ahead } from './git.ts'
import { rereadCheckouts, rereadRefs } from './worktrees.ts'
import type { ReaderAsk } from './repo-watch.ts'

const readOf = (ask: ReaderAsk): Promise<unknown> =>
  ask.t === 'refs' ? ahead(() => rereadRefs(ask.dir, ask.last, ask.stale)) : rereadCheckouts(ask.refs, ask.last, ask.stale)

parentPort!.on('message', async ({ id, ask }: { id: number; ask: ReaderAsk }) => {
  const [reading] = await Promise.allSettled([readOf(ask)])
  parentPort!.postMessage({ id, reading })
})
