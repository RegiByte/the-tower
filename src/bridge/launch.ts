/**
 * What launch contributors add to a session, merged (decision `extensions`): each contributor's parts read as a runtime
 * places them, then joined in fold order. Text parts are concatenated; a flag, an env key, a `defaults` member or a
 * `reportsTo` given twice, a flag the core or the config's `argv` passes, or an env key the config's `env` sets, refuses
 * the launch, naming both sides.
 */
import { z } from 'zod'
import type { LaunchParts } from '../shared/extensions.ts'
import { withoutParentSession } from '../shared/env.ts'
import { CORE_FLAGS, flagName, type Contributed, type ResumeLaunch, type SpawnLaunch } from '../shared/launch.ts'
import { RUNTIMES, type ModEvent, type Runtime } from '../shared/model.ts'
import { EXEMPT, REPORTS_TO, type Session } from './facts.ts'
import { extensionFactName } from './stores.ts'

/** A runtime's flag as a contributor passes it: `--flag` or `--flag=value`, so no value is ever read as a positional. */
const FLAG = /^--?[A-Za-z0-9][\w.-]*(=[\s\S]*)?$/

const Parts = z.strictObject({
  systemPrompt: z.array(z.string()).optional(),
  prompt: z.array(z.string()).optional(),
  env: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'an environment variable name'), z.string()).optional(),
  defaults: z.strictObject({ model: z.string().min(1).optional(), effort: z.string().min(1).optional() }).optional(),
  args: z
    .strictObject(Object.fromEntries(RUNTIMES.map((runtime) => [runtime, z.array(z.string().regex(FLAG, 'one flag: --flag or --flag=value')).optional()])))
    .optional(),
  exempt: z.array(z.literal('hiring')).optional(),
  reportsTo: z.string().min(1).optional(),
}) satisfies z.ZodType<LaunchParts>

/** What a contributor returned, as parts the runtime places, or why it can't place them. */
export const placeable = (returned: unknown): { ok: true; parts: LaunchParts } | { ok: false; why: string } => {
  const parsed = Parts.safeParse(returned ?? {})
  return parsed.success ? { ok: true, parts: parsed.data } : { ok: false, why: z.prettifyError(parsed.error) }
}

/** One contributor's parts, by the capability that gave them. */
export type Contribution = { cap: string; parts: LaunchParts }

/** A flag or an env key something already sets, and who: the tower, or the config at a key. */
export type Taken = { name: string; by: string }

/** What no contributor may set: `flags`, by name; `env`, by key. */
export type TakenParts = { flags: Taken[]; env: Taken[] }

/** The flags no contributor may pass on `runtime`: the core's, and those the config's `argv` passes. */
export const takenFlags = (runtime: Runtime, argv: string[]): Taken[] => [
  ...CORE_FLAGS[runtime].map((name) => ({ name, by: 'the tower' })),
  ...argv.flatMap((arg, i) => (i > 0 && arg.startsWith('-') ? [{ name: flagName(arg), by: `the config's argv[${i}] (${arg})` }] : [])),
]

/** The env keys no contributor may set: those the config's `env` sets, which a contributed one would override in silence. */
export const takenEnv = (env: Record<string, string> | undefined): Taken[] => Object.keys(env ?? {}).map((name) => ({ name, by: `the config's env.${name}` }))

/** A crew edge as a contributor gives it: the callsign the new worker reports to. */
export type ReportsTo = { callsign: string; by: string }

/** What every contributor added, merged: what the runtime places, and a spawn's defaults, exemptions and crew edge. */
export type Merged = { t: 'merged'; contributed: Contributed; defaults: { model?: string; effort?: string }; exempt: { from: 'hiring'; by: string }[]; reportsTo?: ReportsTo }

/** Two contributors on one name, or one on a name the core or the config passes: `caps`, the contributors named. */
export type Conflict = { t: 'conflict'; message: string; caps: string[] }

/** The parts of a spawn only: a resume or fork keeps its transcript's prompt and model, and its worker's crew and limits. */
const spawnOnly = ({ prompt, defaults, exempt, reportsTo, ...rest }: LaunchParts, kind: SpawnLaunch['kind'] | ResumeLaunch['kind']): LaunchParts =>
  kind === 'spawn' ? { ...rest, prompt, defaults, exempt, reportsTo } : rest

/** The first name two contributors both give: `seen` holds who gave each so far. */
const twice = (seen: Map<string, string>, cap: string, names: string[]): [string, string] | undefined => {
  for (const name of names) {
    const first = seen.get(name)
    if (first !== undefined && first !== cap) return [first, name]
    seen.set(name, cap)
  }
  return undefined
}

/** Contributions merged in fold order for a launch of `kind` on `runtime`, or the first conflict among them. */
export const mergeParts = (kind: SpawnLaunch['kind'] | ResumeLaunch['kind'], runtime: Runtime, contributions: Contribution[], taken: TakenParts): Merged | Conflict => {
  const merged: Merged = { t: 'merged', contributed: { systemPrompt: [], prompt: [], env: {}, args: [] }, defaults: {}, exempt: [] }
  const flags = new Map<string, string>()
  const envs = new Map<string, string>()
  const defaults = new Map<string, string>()
  const reports = new Map<string, string>()
  for (const { cap, parts: given } of contributions) {
    const parts = spawnOnly(given, kind)
    const args = parts.args?.[runtime] ?? []
    const core = args.map(flagName).flatMap((flag) => taken.flags.filter((t) => t.name === flag))[0]
    if (core) return { t: 'conflict', message: `${cap} passes ${core.name}, which ${core.by} passes`, caps: [cap] }
    const flag = twice(flags, cap, args.map(flagName))
    if (flag) return { t: 'conflict', message: `${flag[0]} and ${cap} both pass ${flag[1]}`, caps: [flag[0], cap] }
    const env = withoutParentSession(parts.env ?? {})
    const configured = Object.keys(env).flatMap((key) => taken.env.filter((t) => t.name === key))[0]
    if (configured) return { t: 'conflict', message: `${cap} sets ${configured.name} in env, which ${configured.by} sets`, caps: [cap] }
    const key = twice(envs, cap, Object.keys(env))
    if (key) return { t: 'conflict', message: `${key[0]} and ${cap} both set ${key[1]} in env`, caps: [key[0], cap] }
    const member = twice(defaults, cap, Object.keys(parts.defaults ?? {}))
    if (member) return { t: 'conflict', message: `${member[0]} and ${cap} both give defaults.${member[1]}`, caps: [member[0], cap] }
    const edge = twice(reports, cap, parts.reportsTo === undefined ? [] : ['reportsTo'])
    if (edge) return { t: 'conflict', message: `${edge[0]} and ${cap} both give reportsTo`, caps: [edge[0], cap] }
    const { contributed } = merged
    contributed.systemPrompt.push(...(parts.systemPrompt ?? []))
    contributed.prompt.push(...(parts.prompt ?? []))
    contributed.args.push(...args)
    Object.assign(contributed.env, env)
    Object.assign(merged.defaults, parts.defaults)
    merged.exempt.push(...[...new Set(parts.exempt)].map((from) => ({ from, by: cap })))
    if (parts.reportsTo !== undefined) merged.reportsTo = { callsign: parts.reportsTo, by: cap }
  }
  return merged
}

/** A spawn's core facts, from what its contributors gave: each exemption, and its crew edge as the session it names now. */
export const coreFacts = (merged: Merged, reportsTo: string | undefined): ModEvent[] => [
  ...merged.exempt.map(({ from, by }) => ({ hook_event_name: EXEMPT, from, by })),
  ...(merged.reportsTo && reportsTo ? [{ hook_event_name: REPORTS_TO, callsign: merged.reportsTo.callsign, session: reportsTo, by: merged.reportsTo.by }] : []),
]

/** A spawn's field values, by capability, as the facts the host logs: `tower.x.<cap>.<field>`. */
export const fieldFacts = (x: Record<string, Record<string, unknown>>): ModEvent[] =>
  Object.entries(x).flatMap(([cap, fields]) => Object.entries(fields).map(([name, value]) => ({ hook_event_name: extensionFactName(cap, name), value })))

/**
 * What a fork carries of the lineage it forks (oldest first): a copy of every extension's session fact, each session's
 * once. A fork is a new worker, so the facts about a hire, its exemptions and its crew, stay behind.
 */
export const forkFacts = (lineage: Session[]): ModEvent[] =>
  [...new Map(lineage.map((s) => [s.header.id, s])).values()].flatMap((s) =>
    s.facts.extensionFacts.map(([, cap, name, value]) => ({ hook_event_name: extensionFactName(cap, name), value })),
  )
