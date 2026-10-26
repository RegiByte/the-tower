/**
 * A thread that reads project dirs' git for the board: each message is a list of reads asked, each reply their
 * readings, settled one by one. Started by `system.ts`, which keeps each repo's parts and sends them back with the
 * next read.
 */
import { parentPort } from 'node:worker_threads'
import { rereadRepo } from './worktrees.ts'
import type { RepoAsk } from './repo-watch.ts'

parentPort!.on('message', async (asks: RepoAsk[]) => parentPort!.postMessage(await Promise.allSettled(asks.map(({ dir, last, stale }) => rereadRepo(dir, last, stale)))))
