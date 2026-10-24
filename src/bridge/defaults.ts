import { launchFlags } from '../shared/launch.ts'
import type { Session } from './facts.ts'

/**
 * What Claude runs a new worker on when the launch asks for no model or effort, as observed: settings files, env, plan
 * and `/model` decide it. One value for the machine, as a `/model` pick is saved in the user's settings: a project
 * whose own settings pin a model is not told apart. Absent until a session shows it.
 */
export type ClaudeDefaults = { model?: string; effort?: string }

/**
 * Whether a session's latest step tells Claude's default for each: one launched without the flag. A model asked for
 * may have no effort (haiku): its missing effort says nothing of the default's.
 */
const TELLS = {
  model: (s: Session) => !launchFlags(s.header.argv).model,
  effort: (s: Session) => {
    const asked = launchFlags(s.header.argv)
    return !asked.effort && !(asked.model && s.facts.effort === undefined)
  },
}

/** The session whose main loop stepped last, among the spawns that tell Claude's default `flag`. */
const latestTelling = (sessions: Session[], flag: keyof typeof TELLS) =>
  sessions
    .filter((s) => s.facts.steppedAt !== undefined && !s.header.argv.includes('--resume') && TELLS[flag](s))
    .reduce<Session | undefined>((latest, s) => (latest && latest.facts.steppedAt! >= s.facts.steppedAt! ? latest : s), undefined)

/**
 * `sessions`: every one, archived included. Each of the model and the effort is the latest main-loop step's of the spawns that did not
 * ask for it: a `/model` pick that Claude saves as the default shows from that session's next step. A resume carries
 * its conversation's choices, so only spawns tell. A Claude on its default model that reports no effort leaves it
 * unknown.
 */
export const claudeDefaults = (sessions: Session[]): ClaudeDefaults => ({
  model: latestTelling(sessions, 'model')?.facts.model,
  effort: latestTelling(sessions, 'effort')?.facts.effort,
})
