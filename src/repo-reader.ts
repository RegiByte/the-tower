/**
 * A thread that reads project dirs' git for the board: each message is a read asked, and its reply comes as it
 * settles, whatever else is still being read, so a repo that hangs delays only its own reads. Started by `system.ts`,
 * which keeps each repo's parts and sends them back with the next read.
 */
import { parentPort } from 'node:worker_threads'
import { rereadRepo } from './worktrees.ts'
import type { RepoAsk } from './repo-watch.ts'

parentPort!.on('message', async ({ id, ask: { dir, last, stale } }: { id: number; ask: RepoAsk }) => {
  const [reading] = await Promise.allSettled([rereadRepo(dir, last, stale)])
  parentPort!.postMessage({ id, reading })
})
