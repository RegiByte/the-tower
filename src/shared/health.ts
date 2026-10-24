import type { Board, Card } from '../bridge/board.ts'
import type { Attention } from '../bridge/life.ts'
import { CLAUDE_UNTESTED } from './claude.ts'
import { esc } from './format.ts'

/** The tower's own state in words: the host, the daemons a verb needs, a board error and an untested Claude. */

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

/** What the board's `claudeUntested` says once for every worker: `undefined` while every live worker runs a tested Claude. */
export const claudeUntestedLine = (board: Pick<Board, 'claudeUntested'>) =>
  board.claudeUntested.length ? `claude ${board.claudeUntested.join(', ')} untested` : undefined

/** That line with its reason on hover. It can run long (several releases, a build suffix): it takes a line of its own. */
export const claudeUntestedHtml = (board: Pick<Board, 'claudeUntested'>) => {
  const line = claudeUntestedLine(board)
  return line && `<span class="untested" data-tip="${CLAUDE_UNTESTED}">${esc(line)}</span>`
}

/** A worker's own flag beside its stats: `undefined` while its Claude is tested or unknown. */
export const claudeFlagHtml = (c: Pick<Card, 'claude' | 'claudeUntested'>) =>
  c.claudeUntested ? `<span class="untested" data-tip="${CLAUDE_UNTESTED}">claude ${esc(c.claude!)} untested</span>` : undefined
