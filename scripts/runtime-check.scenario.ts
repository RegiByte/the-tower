/**
 * What `scripts/runtime-check.ts` drives, as data: a runtime's scenarios, and the runtime itself, the part of a check
 * that differs between Claude and opencode. Each runtime is one record (`runtime-check.<runtime>.ts`), its scenarios
 * beside it; the runner, the waits and the shared report sections know no runtime by name.
 *
 * A scenario runs in its own directory, its own git repo (Claude keeps folder trust per repo root), seeded again with
 * `seed` files on each run. The directory is the same on every run, so Claude asks to trust it only on the first; a
 * `fresh` scenario, which needs the trust screen, gets a directory Claude has never seen. Its steps run in order: each
 * waits on what the session's log says (`on`), then `pause`s, then does one thing (`do`). An `on` reads the log after
 * the previous step: after its action when it acted, else after the event it waited on. Every session it spawned and
 * that has not exited is killed after its last step, and each log is a recording, named after its session.
 *
 * Seed files, prompts, submitted text and a launch's flags and environment name the run's places as `{root}` (the
 * run's root), `{dir}` (the scenario's directory) and whatever the runtime's services serve (`{provider}`).
 */
import type { BlockedKind } from '../src/bridge/blocked.ts'
import type { Facts } from '../src/bridge/facts.ts'
import type { Status } from '../src/bridge/status.ts'
import type { TestedRange } from '../src/shared/claude.ts'
import type { Config, LogEvent, Runtime as RuntimeId, SessionHeader, SessionLog } from '../src/shared/model.ts'
import type { Baseline } from './runtime-check.read.ts'

/**
 * What a status replay leaves out to compare a recording with its fixture (`comparedForm`): `trust`, the trust screen's
 * leading `blocked`, left out of every scenario but a `fresh` one or one held at start by a `blocked` screen, since a
 * fixture and a run may differ in whether the directory was trusted; `watching` and `repeats`, for subagents that race
 * the main loop to the end of its turn and report in as many turns as the race leaves.
 */
export type Ignore = 'trust' | 'watching' | 'repeats'

/**
 * What a step waits for in a session's log. `event`: a hook event by name, the main loop's only unless `agents`,
 * whose fields equal each `where` string or match each pattern; the `count`th such. `status`: the session's folded
 * status entering it, the `count`th time. `exit`: the session's process exiting.
 */
export type On =
  | { event: string; where?: Record<string, string | RegExp>; agents?: true; count?: number; within?: number }
  | { status: Status; count?: number; within?: number }
  | { exit: true; within?: number }

/**
 * What a step does. `spawn`: a session named `as` in the scenario's directory, answering the trust screen the
 * directory's first session raises, or held by `blocked`'s; `resume`: a session named `as` continuing the conversation
 * of `from`, which has exited by then; `keys`: raw input; `submit`: text typed and sent, as `POST /submit`; `atPrompt`:
 * the same as `POST /submit/at-prompt`, which must answer the error code `refused` names when it names one; `write`: a
 * file in the directory; `kill`: the session, through the tower, waited on until it exits; `killOutside`: the
 * session's process signalled by the runner itself, never through the tower, waited on until it exits.
 */
export type Act =
  | { spawn: string; prompt?: string; model?: string; effort?: string; callsign?: string; blocked?: BlockedKind }
  | { resume: string; from: string }
  | { keys: string }
  | { submit: string }
  | { atPrompt: string; refused?: 'not_at_prompt' | 'composer_holds' | 'moved' }
  | { write: string; text: string }
  | { kill: true }
  | { killOutside: true }

/** `in`: the session the step waits on and acts in, the first spawned when left out. */
export type Step = { in?: string; on?: On; pause?: number; do?: Act }

/**
 * A runtime's flags and environment for a group of scenarios, by `name`: every scenario with the same launch runs
 * together, the config written once for them. What else it holds is the runtime's.
 */
export type Launch = { name: string }

/**
 * `recordings`: each session it records, by name, with the fixture its timeline replays against and what that leaves
 * out. `fresh`: it runs in a directory the runtime has never trusted.
 */
export type Scenario<L extends Launch = Launch> = {
  name: string
  fresh?: true
  launch: L
  seed: Record<string, string>
  recordings: Record<string, { fixture?: string; ignore?: Ignore[] }>
  steps: Step[]
}

/**
 * A session's log as it grows, read from where the last read stopped: its events, and the statuses its facts enter,
 * each at the index of the event that moved it.
 */
export type Tail = { file: string; offset: number; partial: string; header?: SessionHeader; events: LogEvent[]; facts?: Facts; entered: { at: number; status: string; blocked?: string }[] }

/** A session a scenario started: its log, and where its next `on` starts reading. */
export type Live = { name: string; id: string; tail: Tail; cursor: number; exited: boolean }

/** What a runtime's `started` may do to the session it waits on. */
export type Io = {
  waitForFirst: (tail: Tail, ons: On[], from: number) => Promise<number>
  quiet: (tail: Tail) => Promise<void>
  keys: (id: string, data: string) => Promise<unknown>
  sleep: (ms: number) => Promise<unknown>
}

/** What a scenario's run kept beside its recordings: why it stopped short, and what it read of the live system. */
export type ScenarioRun = {
  name: string
  error?: string
  recordings: { name: string; id: string }[]
  /** What the runtime's `registered` read of each session as it was killed. */
  registry: Record<string, boolean>
  resumed: { id: string; from: string }[]
  /** Whether `GET /conversations/<id>` of each resumed session names the session it resumes. */
  chain?: boolean
  /** What differed on each earlier attempt, when it was run again (`--retries`). */
  retried?: string[][]
}

/** A run as `run.json` keeps it: what the runtime's `afterRun` read is kept beside it, by its own keys. */
export type Run = { release: string; startedAt: number; minutes: number; scenarios: ScenarioRun[] }

/** What a runtime's report reads: the run, its recordings, and the files `<root>` holds beside them. */
export type ReportInput = {
  run: Run
  recordings: Record<string, SessionLog>
  baseline: Baseline
  fixture: (name: string) => SessionLog
  root: string
}

/** Places a runtime's services serve for one run, named for seeds and launches (`{provider}`), and how to stop them. */
export type Services = { vars: Record<string, string>; close: () => Promise<void> }

/** What reads differently in one recording, by the runtime's own checks: `[recording, why]`. */
export type Difference = [string, string]

/**
 * One runtime's part of a check. `word`: how reports, `due` and the pull request title (`<word> <release>`) name it;
 * `model`: what a spawn runs on unless a step names one; `plain`: the launch the hub's config is written with.
 */
export type Runtime<L extends Launch = Launch> = {
  id: RuntimeId
  word: string
  tested: TestedRange
  installed: () => string
  root: string
  port: number
  model: string
  baseline: string
  plain: L
  launches: L[]
  scenarios: Scenario<L>[]
  /** The config's `runtimes` and `env` for a launch, every value expanded by the runner. */
  configOf: (launch: L) => Pick<Config, 'runtimes' | 'env'>
  /** Waits until a directory's first session, or one held by `blocked`'s screen, has started: the index it read up to. */
  started: (live: Live, blocked: BlockedKind | undefined, io: Io) => Promise<number>
  /** Whether a hook payload is a subagent's, which an `on` skips unless it names `agents`. */
  subagent: (hook: Record<string, unknown>) => boolean
  /** The conversation a session's log holds, to resume. */
  conversation: (events: LogEvent[]) => string | undefined
  /**
   * What the runtime registers of a running session, read as it is killed: undefined when there is nothing to read yet,
   * absent for a runtime that registers none.
   */
  registered?: (log: SessionLog) => boolean | undefined
  /** What a take of the scenarios needs in the run's root beyond their directories, made again before each take. */
  prepare?: (root: string) => void
  /** Local services a run's scenarios reach, started before it and stopped after. */
  services?: () => Promise<Services>
  /** What the runtime is asked once the system is down, kept in `run.json`. */
  afterRun?: (config: Config) => Promise<Record<string, unknown>>
  /** The runtime's own checks of each scenario's recordings, beside the shared ones. */
  differences: (run: Run, recordings: Record<string, SessionLog>) => Difference[]
  report: (input: ReportInput) => { markdown: string; clean: boolean }
}
