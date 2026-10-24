import { launchFlags } from '../shared/launch.ts'
import type { Session } from './facts.ts'

/**
 * What Claude runs a new worker on when the launch asks for no model or effort, as observed: settings files, env, plan
 * and `/model` decide it. One value for the machine, as a `/model` pick is saved in the user's settings: a project
 * whose own settings pin a model is not told apart. Absent until a session shows it.
 */
export type ClaudeDefaults = { model?: string; effort?: string }

/** The session whose main loop stepped last, among the spawns that did not ask for `flag`. */
const latestUnasked = (sessions: Session[], flag: 'model' | 'effort') =>
  sessions
    .filter((s) => s.facts.steppedAt !== undefined && !s.header.argv.includes('--resume') && !launchFlags(s.header.argv)[flag])
    .reduce<Session | undefined>((latest, s) => (latest && latest.facts.steppedAt! >= s.facts.steppedAt! ? latest : s), undefined)

/**
 * `sessions`: every one, archived included. Each of the model and the effort is the latest main-loop step's of the spawns that did not
 * ask for it: a `/model` pick that Claude saves as the default shows from that session's next step. A resume carries
 * its conversation's choices, so only spawns tell. A Claude that reports no effort leaves it unknown.
 */
export const claudeDefaults = (sessions: Session[]): ClaudeDefaults => ({
  model: latestUnasked(sessions, 'model')?.facts.model,
  effort: latestUnasked(sessions, 'effort')?.facts.effort,
})
