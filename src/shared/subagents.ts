import type { Card, CardSubagent } from '../bridge/board.ts'
import { ago, modelName, tokenCount } from './format.ts'

/** A worker's subagents as drawn beside it: those running and those fading, in words. */

/** How long a subagent stays drawn once its loop ended a turn: it leaves, it isn't kept. */
export const SUBAGENT_FADE_MS = 8000

/** A subagent drawn beside its worker: `left`, ms since it ended a turn while it fades, absent while it runs. */
export type Satellite = { run: CardSubagent; left?: number }

/** The worker's subagents to draw at `now`: those running, and those that ended a turn under `SUBAGENT_FADE_MS` ago, oldest first. */
export const satellitesOf = (c: Card, now: number): Satellite[] =>
  c.subagentRuns.flatMap((run): Satellite[] => {
    if (run.running) return [{ run }]
    const left = run.endedAt === undefined ? Infinity : now - run.endedAt
    return left < SUBAGENT_FADE_MS ? [{ run, left }] : []
  })

/** Every token of a subagent's steps, the cache's included, as Claude's own task list counts them. */
export const subagentTokens = ({ tokens: t }: CardSubagent) => t.input + t.output + t.cacheRead + t.cacheWrite

/** How a subagent's last turn ended, in words. */
export const subagentEnd = (run: CardSubagent) => (run.running ? 'running' : run.ended === 'aborted' ? 'stopped' : run.ended === 'answer' ? 'answered' : (run.ended ?? 'ended'))

/** A subagent on hover: its type, its task, its model, how long it ran once it ended, its tokens and how it ended. */
export const subagentTitle = (run: CardSubagent) =>
  `${run.type === 'fork' ? 'a fork of this worker (its whole conversation)' : `a ${run.type} subagent`}${run.background ? ', in the background' : ''}: ${run.description}\n` +
  [modelName(run.model), run.endedAt === undefined ? '' : ago(run.endedAt - run.startedAt), `${tokenCount(subagentTokens(run))} tokens`, subagentEnd(run)].filter(Boolean).join(' · ')
