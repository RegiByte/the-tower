/**
 * Roles: a worker's role names its default model and effort, a prompt from the floor's `roles.prompts`, and flags the
 * tower reads. A worker's role is its `role` fact, the newest over its lineage: the one its spawn named, or the floor's
 * `hireDefault`, which `launch` gives a hire naming none as a field the tower logs.
 */
import type { Card, Floor } from '/lib/board.js'
import type { CallCtx, FoldCtx, LaunchParts, LaunchRequest, Start } from '/lib/extension.js'

/** A role as the settings hold it. `hires` is true and `consultable` false unless set. */
export type Role = { model?: string; effort?: string; hires?: boolean; consultable?: boolean }

/** The manifest's settings, a floor's value winning. */
export type Settings = { roles: Record<string, Role>; hireDefault?: string }

type Facts = LaunchRequest['facts']

const PROMPTS = 'roles.prompts'

/** A worker's role: the newest `role` fact over its lineage. */
export const roleOf = (facts: Facts): string | undefined => facts.findLast((f) => f.name === 'role')?.value as string | undefined

/** The role a launch runs in, and whether it is the default this launch gives: a hire naming none takes `hireDefault`. */
export const launchRole = (settings: Settings, request: LaunchRequest): { name: string; filled: boolean } | undefined => {
  const named = (request.fields?.role as string | undefined) ?? roleOf(request.facts)
  if (named) return { name: named, filled: false }
  return request.kind === 'spawn' && request.hire && settings.hireDefault ? { name: settings.hireDefault, filled: true } : undefined
}

/** The role of that name, or an error naming the roles there are. */
const roleIn = (settings: Settings, name: string): Role => {
  const role = settings.roles[name]
  if (!role) throw new Error(`no role "${name}" in roles's settings: the roles are ${Object.keys(settings.roles).join(', ') || 'none'}`)
  return role
}

/** What a role's spawn defaults to: its model and effort, each only when it sets one. */
export const defaultsOf = (role: Role): LaunchParts['defaults'] => {
  const defaults = { ...(role.model && { model: role.model }), ...(role.effort && { effort: role.effort }) }
  return Object.keys(defaults).length ? defaults : undefined
}

/** A role's hint in the spawn form's choices: its model and effort, and its flags when set. */
const hintOf = (role: Role) => [role.model, role.effort, role.hires === false && "doesn't hire", role.consultable && 'consulted'].filter(Boolean).join(' · ')

/** A floor's badge when its `hireDefault` names no role it lists: such a hire's launch throws, and it starts unroled. */
export const misnamedDefault = (settings: Settings) =>
  settings.hireDefault !== undefined && !(settings.hireDefault in settings.roles)
    ? [{ label: `No role "${settings.hireDefault}"`, tone: 'broken' as const, hint: `roles's hireDefault names no role this floor lists: hires naming no role start without one. Roles: ${Object.keys(settings.roles).join(', ') || 'none'}` }]
    : []

const optionsOf = (settings: Settings) =>
  Object.entries(settings.roles).map(([name, role]) => ({ value: name, label: name, ...(hintOf(role) && { hint: hintOf(role) }) }))

/** The consultable workers on duty on a floor, oldest first. */
export const advisorsOf = (cards: Card[], project: string, settings: Settings, factsOf: (session: string) => Facts) =>
  cards
    .filter((c) => c.project === project && c.onDuty)
    .flatMap((c) => {
      const role = roleOf(factsOf(c.id))
      return role && settings.roles[role]?.consultable ? [{ card: c, role }] : []
    })
    .sort((a, b) => a.card.startedAt - b.card.startedAt)

const advisorLine = ({ card, role }: { card: Card; role: string }) =>
  `${card.callsign} (${role}): ${card.peer ? `message as "${card.peer}"` : 'not reachable: its Claude is not running'}`

const start: Start = (ctx) => {
  const settingsOf = (project: string) => ctx.settingsOf(project) as Settings

  return {
    folds: {
      floor: (_floor: Floor, { settings }: FoldCtx) => ({ x: { options: optionsOf(settings as Settings) }, badges: misnamedDefault(settings as Settings) }),
      card: (_card: Card, { own }: FoldCtx) => {
        const role = roleOf(own.facts ?? [])
        return role ? { x: { role }, badges: [{ label: role, tone: 'quiet', hint: 'Its role' }] } : {}
      },
    },

    launch: async (request, { settings, collections }) => {
      const s = settings as Settings
      const role = launchRole(s, request)
      if (!role) return {}
      const defaults = defaultsOf(roleIn(s, role.name))
      const file = `${role.name}.md`
      const prompt = collections.list(request.project, PROMPTS).some((i) => i.id === file) ? [await collections.read(request.project, PROMPTS, file)] : undefined
      return { ...(defaults && { defaults }), ...(prompt && { systemPrompt: prompt }), ...(role.filled && { fields: { role: role.name } }) }
    },

    answers: {
      'tower/spawn.gate': ({ by }: { by?: string }, call: CallCtx) => {
        if (!by) return {}
        const hirer = call.cards().find((c) => c.id === by)
        if (!hirer) throw new Error(`the tower holds no card for the hirer ${by}`)
        const role = roleOf(call.own.facts(by))
        if (!role || settingsOf(hirer.project).roles[role]?.hires !== false) return {}
        return { code: 'refused', message: `${hirer.callsign} is in the ${role} role, which doesn't hire: propose the work to whoever hires on the floor` }
      },
    },

    reads: {
      'advisor/<project>': ({ params }, call: CallCtx) => {
        const found = advisorsOf(call.cards(), params.project, settingsOf(params.project), (s) => call.own.facts(s))
        return {
          advisors: found.map(({ card, role }) => ({ session: card.id, callsign: card.callsign, role, ...(card.peer && { peer: card.peer }) })),
          said: found.length ? found.map(advisorLine).join('\n') : `No consultable worker is on duty on ${params.project}: decide, or ask whoever you report to.`,
        }
      },
    },
  }
}

export default start
