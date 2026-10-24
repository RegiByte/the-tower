import { launchFlags } from '../shared/launch.ts'
import type { Session } from './facts.ts'

/**
 * What Claude runs a new worker on when the launch asks for no model or effort, as observed: settings files, env, plan
 * and `/model` decide it. One value for the machine, as a `/model` pick is saved in the user's settings: a project
 * whose own settings pin a model is not told apart. Absent until a session shows it.
 */
export type ClaudeDefaults = { model?: string; effort?: string }

/** The spawn whose main loop stepped last among `sessions`: a resume carries its conversation's choices. */
const latestSpawn = (sessions: Session[]) =>
  sessions
    .filter((s) => s.facts.steppedAt !== undefined && !s.header.argv.includes('--resume'))
    .reduce<Session | undefined>((latest, s) => (latest && latest.facts.steppedAt! >= s.facts.steppedAt! ? latest : s), undefined)

/**
 * `sessions`: every one, archived included. The model is the latest main-loop step's of the spawns that did not ask
 * for one: a `/model` pick that Claude saves as the default shows from that session's next step. Claude saves effort
 * per model, so the effort is the latest step's on that model of the spawns that did not ask for one: a session on
 * another model says nothing of it, and a default model that reports no effort leaves it unknown.
 */
export const claudeDefaults = (sessions: Session[]): ClaudeDefaults => {
  const model = latestSpawn(sessions.filter((s) => !launchFlags(s.header.argv).model))?.facts.model
  const effort = latestSpawn(sessions.filter((s) => !launchFlags(s.header.argv).effort && s.facts.model === model))?.facts.effort
  return { model, effort }
}
