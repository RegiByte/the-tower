/**
 * Floors' clones, folded from its own stream and the board's jobs. A clone is a job the jobs daemon runs; the stream
 * holds what floors did about it: `s` the clone it started (the floor it is for), `a` the floor it added from it,
 * `r` why adding it was refused, `d` a clone the user dismissed. What a clone came to is derived from its job, so a
 * floor the user removed by hand is never added back, and a restart that replays the trigger changes nothing. Pure.
 */
import type { Job } from '/lib/board.js'
import type { Ask, StreamFact, TriggerCall } from '/lib/extension.js'

export const CLONES = 'clones'

/** The clone a job runs: the floor it is for and where it goes. */
export type CloneStarted = { job: string; id: string; name: string; url: string; into: string }

/** Floors' facts about its clones, by job. */
export type ClonesState = {
  started: Record<string, CloneStarted & { at: number }>
  added: Record<string, string>
  refused: Record<string, string>
  dismissed: Record<string, true>
}

export const NO_CLONES: ClonesState = { started: {}, added: {}, refused: {}, dismissed: {} }

export const step = (state: ClonesState, [at, code, fact]: StreamFact): ClonesState => {
  switch (code) {
    case 's': {
      const started = fact as CloneStarted
      return { ...state, started: { ...state.started, [started.job]: { ...started, at } } }
    }
    case 'a': {
      const { job, project } = fact as { job: string; project: string }
      return { ...state, added: { ...state.added, [job]: project } }
    }
    case 'r': {
      const { job, message } = fact as { job: string; message: string }
      return { ...state, refused: { ...state.refused, [job]: message } }
    }
    case 'd': {
      const { job } = fact as { job: string }
      return { ...state, dismissed: { ...state.dismissed, [job]: true } }
    }
    default:
      throw new Error(`The clones stream holds a fact "${code}", which floors never writes`)
  }
}

/** What a clone came to: its job's state, with an end of exit 0 read as cloned and any other as failed. */
export type Outcome = 'running' | 'cloned' | 'failed' | 'cancelled' | 'lost'

/** A clone as the board carries it: what floors started, what its job came to, and what floors did about it. */
export type Clone = CloneStarted & {
  startedAt: number
  outcome: Outcome
  endedAt?: number
  exit?: number | null
  signal?: string | null
  /** The floor added from it. */
  added?: string
  /** Why adding its floor was refused. */
  refused?: string
  dismissed?: true
}

const outcomeOf = (job: Job): Outcome => (job.state === 'ended' ? (job.exit === 0 ? 'cloned' : 'failed') : job.state)

/** Each clone whose job the board holds (running, or over within the last day), newest first. */
export const clonesOf = (state: ClonesState, jobs: readonly Job[], owner: string): Clone[] =>
  jobs.flatMap((job) => {
    const started = state.started[job.id]
    if (job.owner !== owner || !started) return []
    const { at: _, ...clone } = started
    return [
      {
        ...clone,
        startedAt: job.startedAt,
        outcome: outcomeOf(job),
        ...(job.endedAt !== undefined && { endedAt: job.endedAt, exit: job.exit, signal: job.signal }),
        ...(state.added[job.id] !== undefined && { added: state.added[job.id] }),
        ...(state.refused[job.id] !== undefined && { refused: state.refused[job.id] }),
        ...(state.dismissed[job.id] && { dismissed: true as const }),
      },
    ]
  })

/** The clones whose floor is still to add: cloned, and neither added, refused nor dismissed. */
export const toAdopt = (clones: readonly Clone[]): Clone[] => clones.filter((c) => c.outcome === 'cloned' && !c.added && !c.refused && !c.dismissed)

/** The trigger's calls: `floors/adopt` for each clone whose floor is still to add. Reads only the board it is handed. */
export const adoptCalls = (clones: readonly Clone[]): TriggerCall[] => toAdopt(clones).map((c) => ({ verb: 'floors/adopt', input: { job: c.job } }))

const DAY_MS = 86_400_000

/**
 * The clones holding their floor's id and folder: those running or cloned with the floor still to add, and those
 * started in the last day whose job the board doesn't carry yet, since the board learns of a job after it starts.
 */
export const holding = (state: ClonesState, jobs: readonly Job[], owner: string, now: number): CloneStarted[] => {
  const onBoard = new Set(jobs.map((j) => j.id))
  const held = clonesOf(state, jobs, owner).filter((c) => c.outcome === 'running' || toAdopt([c]).length > 0)
  const unseen = Object.values(state.started).filter((s) => !onBoard.has(s.job) && now - s.at < DAY_MS)
  return [...held, ...unseen]
}

const ended = (c: Clone): string => {
  if (c.outcome === 'cancelled') return 'was stopped'
  if (c.outcome === 'lost') return 'was lost: the jobs daemon stopped before it ended'
  return c.signal ? `was ended by ${c.signal}` : `failed (exit ${c.exit})`
}

const SCREEN_GONE = "Its screen is gone once the jobs daemon restarts."

/** The asks of the clones: one running, one whose floor was refused, one that didn't clone; none once dismissed. */
export const asksOf = (clones: readonly Clone[]): Ask[] =>
  clones.flatMap((c): Ask[] => {
    const call = { job: c.job }
    const watch = { command: 'watch', args: call, words: { label: 'Watch', hint: "the clone's screen" } }
    const dismiss = { verb: 'floors/dismiss', call, words: { label: 'Dismiss', hint: 'forget this clone; its folder stays as it is' } }
    if (c.dismissed) return []
    if (c.outcome === 'running')
      return [
        {
          key: c.job,
          subject: 'board',
          title: `Cloning ${c.url}`,
          hint: `Into ${c.into}, then the floor ${c.name}. Restarting the tower doesn't stop it; restarting the jobs daemon does.`,
          since: c.startedAt,
          sound: 'offer',
          actions: [{ verb: 'floors/cancel', call, words: { label: 'Stop', hint: 'cancel the clone: what it fetched stays until Remove', destructive: true } }, watch],
        },
      ]
    if (c.outcome === 'cloned') {
      if (c.added || !c.refused) return []
      return [
        {
          key: c.job,
          subject: 'board',
          title: `Cloned ${c.url}, but the floor wasn't added`,
          hint: `${c.refused}. ${c.into} is ready.`,
          since: c.endedAt ?? c.startedAt,
          sound: 'wait',
          actions: [{ verb: 'floors/adopt', call, words: { label: 'Add as floor', hint: `add the floor ${c.id} for ${c.into}` } }, dismiss],
        },
      ]
    }
    return [
      {
        key: c.job,
        subject: 'board',
        title: `The clone of ${c.url} ${ended(c)}`,
        hint: `${c.signal ? 'Restarting the jobs daemon ends a clone this way. ' : ''}${c.into} may hold part of it: Remove deletes it, then Retry clones again. ${c.outcome === 'lost' ? SCREEN_GONE : `Watch clones, in the palette, shows what git said. ${SCREEN_GONE}`}`,
        since: c.endedAt ?? c.startedAt,
        sound: 'wait',
        actions: [
          { verb: 'floors/remove', call, words: { label: 'Remove', hint: `delete ${c.into}, if git started it`, destructive: true } },
          { verb: 'floors/retry', call, words: { label: 'Retry', hint: 'clone it again into the same folder' } },
          dismiss,
        ],
      },
    ]
  })

/**
 * Whether a URL carries credentials, which the jobs log would keep with its argv: a password, or over http(s) any user,
 * since a token is often pasted as the user alone. `ssh://git@host/…` and `git@host:…` carry none.
 */
export const carriesCredentials = (url: string): boolean => {
  try {
    const { protocol, username, password } = new URL(url)
    return password !== '' || (/^https?:$/.test(protocol) && username !== '')
  } catch {
    return false
  }
}
