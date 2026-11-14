import { launchOf } from '../shared/launch.ts'
import { runtimeOf } from '../shared/model.ts'
import type { Session } from './facts.ts'

/**
 * What a runtime runs a new worker on when the launch asks for no model or effort, as observed: for Claude, settings
 * files, env, plan and `/model` decide it. One value for the machine, as a `/model` pick is saved in the user's settings: a project
 * whose own settings pin a model is not told apart. Absent until a session shows it.
 */
export type RuntimeDefaults = { model?: string; effort?: string }

/** The spawn whose main loop stepped last among `sessions`: a resume carries its conversation's choices. */
const latestSpawn = (sessions: Session[]) =>
  sessions
    .filter((s) => s.facts.steppedAt !== undefined && launchOf(s.header.argv).resume === undefined)
    .reduce<Session | undefined>((latest, s) => (latest && latest.facts.steppedAt! >= s.facts.steppedAt! ? latest : s), undefined)

/**
 * `sessions`: every one of `runtime`'s, archived included, as `runtimeDefaults` passes them. The model is the latest main-loop step's of the spawns that did not ask
 * for one: a `/model` pick that Claude saves as the default shows from that session's next step. Claude saves effort
 * per model, so the effort is the latest step's on that model of the spawns that did not ask for one: a session on
 * another model says nothing of it, and a default model that reports no effort leaves it unknown.
 */
const defaultsOf = (sessions: Session[]): RuntimeDefaults => {
  const model = latestSpawn(sessions.filter((s) => !launchOf(s.header.argv).model))?.facts.model
  const effort = latestSpawn(sessions.filter((s) => !launchOf(s.header.argv).effort && s.facts.model === model))?.facts.effort
  return { model, effort }
}

/** The defaults of `runtime`, from every session, archived included: only its own sessions say what it picks. */
export const runtimeDefaults = (sessions: Session[], runtime: string): RuntimeDefaults => defaultsOf(sessions.filter((s) => runtimeOf(s.header) === runtime))
