import type { Board, BoardRuntime, Card } from '../bridge/board.ts'
import type { Attention } from '../bridge/life.ts'
import { esc } from './format.ts'

/** The tower's own state in words: the host, the daemons a verb needs, a board error and an untested runtime. */

/** Why the board says `hostOutdated`, and what ends it. */
export const HOST_OUTDATED = 'the running host is older than the tower: it updates when restarted (tower down, then tower up), which ends every session and shell'

/** The host as the board reads it: answering, answering with older code than the tower's, or not answering. */
/** `unknown` is a renderer's while the tower doesn't answer (a `disconnected` board error): no board says. */
export type HostState = 'up' | 'outdated' | 'down' | 'unknown'
export const hostState = (b: Pick<Board, 'hostUp' | 'hostOutdated'>): HostState => (!b.hostUp ? 'down' : b.hostOutdated ? 'outdated' : 'up')
/** How loudly the host's state asks for you, in the attention colours: an outdated host wants a restart some time, a host down now. */
export const HOST_ATTENTION: Record<HostState, Attention> = { up: 'quiet', outdated: 'working', down: 'broken', unknown: 'quiet' }
export const HOST_NAME: Record<HostState, string> = { up: 'host up', outdated: 'host outdated', down: 'host down', unknown: 'host unknown' }
export const HOST_MEANS: Record<HostState, string> = {
  up: "host up: the process that holds every session's terminal answers",
  outdated: `host outdated: ${HOST_OUTDATED}`,
  unknown: "host unknown: the tower isn't answering, so nothing reads the host's state until it is back",
  down: "host down: nothing holds the sessions' terminals. Running sessions read lost (each stays resumable), and nothing can start, resume or take keys until it runs again: tower up",
}

/** The daemons a verb needs running: the host holds every session's terminal, the terms daemon every shell. */
const NEEDS = { spawn: 'host', cut: 'host', resume: 'host', 'carry-on': 'host', review: 'host', 'let-go': 'host', shell: 'terms' } as const
export type DaemonVerb = keyof typeof NEEDS
const DOWN = { host: 'the host is down: tower up starts it', terms: 'the terms daemon is down: tower up starts it' } as const

/**
 * Why a verb can't run now because a daemon it needs is down, as a sentence: a renderer draws the verb disabled with
 * it in place of leaving it out. `undefined` while the daemon runs.
 */
export const whyNot = (b: Pick<Board, 'hostUp' | 'termsUp'>, verb: DaemonVerb): string | undefined =>
  (NEEDS[verb] === 'host' ? b.hostUp : b.termsUp) ? undefined : DOWN[NEEDS[verb]]

/** What a renderer heads a board error with: the tower lost, or the board it can't build. */
export const boardErrorTitle = (code: string) => (code === 'disconnected' ? 'Lost the tower' : "The tower can't build the board")

/** Why a session of `runtime` is flagged untested, and what ends it. */
export const untestedTitle = ({ label, tested }: Pick<BoardRuntime, 'label' | 'tested'>) =>
  `the tower is tested on ${label} ${tested.lowest} to ${tested.highest}: another release may change what the tower reads, and the board can go quietly wrong (a worker stuck working, waits that never come)`

const untestedOf = (board: Pick<Board, 'runtimes'>) => Object.values(board.runtimes).filter((r) => r.untested.length)

const runtimeUntestedLine = (r: BoardRuntime) => `${r.label} ${r.untested.join(', ')} untested`

/** What each runtime's `untested` says once for every worker: `undefined` while every live worker runs a tested release. */
export const untestedLine = (board: Pick<Board, 'runtimes'>) => untestedOf(board).map(runtimeUntestedLine).join(' · ') || undefined

/** That line with its reason on hover, a span per runtime. It can run long (several releases, a build suffix): it takes a line of its own. */
export const untestedHtml = (board: Pick<Board, 'runtimes'>) =>
  untestedOf(board)
    .map((r) => `<span class="untested" data-tip="${esc(untestedTitle(r))}">${esc(runtimeUntestedLine(r))}</span>`)
    .join('') || undefined

/** A worker's own flag beside its stats: `undefined` while its runtime's release is tested or unknown. */
export const untestedFlagHtml = (c: Pick<Card, 'runtime' | 'runtimeRelease' | 'runtimeUntested'>, board: Pick<Board, 'runtimes'>) => {
  if (!c.runtimeUntested) return undefined
  const r = board.runtimes[c.runtime]
  return `<span class="untested" data-tip="${esc(untestedTitle(r))}">${esc(r.label)} ${esc(c.runtimeRelease!)} untested</span>`
}
