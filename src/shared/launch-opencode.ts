/**
 * An opencode session as the host starts it. opencode applies its config when its server starts, so every session runs
 * its own server (`--standalone`): one attached to a running server would read that server's config and env, another
 * session's brief or no plugin at all, without a word. The config reaches it as `OPENCODE_CONFIG_CONTENT`, merged over
 * the user's and the project's own, so the user's config dir, credentials and sessions stay theirs. The TUI keeps
 * preferences that outrank the config (a model's variant) in its state dir, so each session gets a fresh one.
 */
import {
  handbookLine, hostStart, KEPT_LINE, opening, promptOf, SHOWING_LINE, STOPPING_LINE, WHOAMI_LINE, worktreeLine,
  type HostStart, type Place, type ResumeLaunch, type SpawnLaunch, type Start,
} from './launch.ts'

/** What every opencode worker is told on every request, through the tower plugin's context hook. */
const towerBrief = (user: string | undefined) =>
  [
    opening(user, 'coding agent'),
    WHOAMI_LINE,
    '- Reaching another worker: `tower agents` (`--all` for every floor) lists them, but this runtime has no messaging ' +
      'between workers: say what another worker needs in your answer, and the user or the worker that hired you passes it on.',
    SHOWING_LINE,
    STOPPING_LINE,
    KEPT_LINE,
    handbookLine('handbook'),
  ].join('\n')

const briefOf = (s: Start) => [towerBrief(s.user), ...(s.worktree ? [worktreeLine(s.worktree)] : []), ...s.contributed.systemPrompt].join('\n\n')

/** opencode names a model's effort as its variant: `provider/model#variant`. */
const modelOf = (model: string | undefined, effort: string | undefined): string | undefined => (model === undefined ? undefined : effort ? `${model}#${effort}` : model)

/**
 * The session's config: the tower plugin with the brief as its option, the plugins the config and the floor's
 * extensions name, the tower's skills, and the model when the launch names one.
 */
const configOf = (s: Start, place: Place, model: string | undefined) => ({
  plugins: [{ package: `${place.mod}/opencode`, options: { brief: briefOf(s) } }, ...s.plugins],
  skills: [`${place.mod}/skills`],
  ...(model !== undefined && { model }),
})

/** `TOWER_CALLSIGN`: the callsign the tower plugin's TUI part shows above the composer, which gets no plugin options. */
const envOf = (s: Start, place: Place, model: string | undefined): Record<string, string> => ({
  ...s.contributed.env,
  TOWER_CALLSIGN: s.name,
  OPENCODE_CONFIG_CONTENT: JSON.stringify(configOf(s, place, model)),
  XDG_STATE_HOME: place.state,
})

/** `--prompt` fills the composer and submits it once the model and agent are ready. */
const promptArgs = (prompt: string | undefined) => (prompt ? ['--prompt', prompt] : [])

const STANDALONE = '--standalone'

export const opencodeSpawn = (s: SpawnLaunch, place: Place): HostStart => {
  const model = modelOf(s.launch.model, s.launch.effort)
  return hostStart(s, [STANDALONE, ...s.contributed.args, ...promptArgs(promptOf(s.launch.prompt, s.contributed.prompt))], envOf(s, place, model), s.launch.command)
}

/** `-s` opens the conversation saved in opencode's database; the model it last ran on comes from the config again. */
export const opencodeResume = (s: ResumeLaunch, place: Place): HostStart => {
  const model = modelOf(s.ran.model, s.ran.effort)
  return hostStart(s, [STANDALONE, ...s.contributed.args, '-s', s.conversation, ...promptArgs(s.prompt)], envOf(s, place, model), s.command)
}
