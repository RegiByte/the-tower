/** Each runtime's composer of the sessions the host starts, and the flags each composes, which no contributor may pass. */
import type { Runtime } from './model.ts'
import { claudeResume, claudeSpawn, EVERY_PART, EVERY_PLACE, flagName, type HostStart, type Place, type ResumeLaunch, type SpawnLaunch } from './launch.ts'
import { opencodeResume, opencodeSpawn } from './launch-opencode.ts'

type Composer = { spawn: (s: SpawnLaunch, place: Place) => HostStart; resume: (s: ResumeLaunch, place: Place) => HostStart }

const COMPOSERS: Record<Runtime, Composer> = {
  claude: { spawn: claudeSpawn, resume: claudeResume },
  opencode: { spawn: opencodeSpawn, resume: opencodeResume },
}

export const spawnRequest = (s: SpawnLaunch, place: Place): HostStart => COMPOSERS[s.runtime].spawn(s, place)

export const resumeRequest = (s: ResumeLaunch, place: Place): HostStart => COMPOSERS[s.runtime].resume(s, place)

/** The flags `runtime`'s composer passes, read from what it composes with every part. */
const flagsOf = (runtime: Runtime): string[] => [
  ...new Set(
    [
      ...spawnRequest({ ...EVERY_PART, runtime, kind: 'spawn', launch: { model: 'model', effort: 'effort', prompt: 'prompt' } }, EVERY_PLACE).args,
      ...resumeRequest({ ...EVERY_PART, runtime, kind: 'resume', conversation: 'conversation', prompt: 'prompt', ran: {} }, EVERY_PLACE).args,
    ].flatMap((arg) => (arg.startsWith('-') ? [flagName(arg)] : [])),
  ),
]

/**
 * The flags the core composes, by runtime: a contributor may pass none of them. Claude's `--` ends the flags before a
 * prompt; its `--plugin-dir` also loads the tower mod.
 */
export const CORE_FLAGS: Record<Runtime, string[]> = { claude: flagsOf('claude'), opencode: flagsOf('opencode') }
