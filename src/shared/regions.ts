import type { Manifest } from './extensions.ts'

/**
 * Where a renderer draws what extensions contribute (decision `renderers-in-config`): its regions, each named by a
 * subject kind and a place (`card.head`), declared in `renderer.json` at its root and served in `GET /renderers`.
 * `landing` says, for an extension, which renderers' regions draw each of its commands and contributions.
 */

/** A region's id: a subject kind and a place, `card.head`, `item.*.row`, `reviews.thread.head`. */
export const REGION_ID = /^[a-z][a-z0-9-]*(\.([a-z][a-z0-9-]*|\*))*\.[a-z][a-z0-9-]*$/

/** What a region draws: actions split into those calling a verb and those running a client command, and the other contributions. */
export const HOLDS = ['verbs', 'commands', 'badges', 'lines', 'marks', 'tidy', 'asks', 'views'] as const
export type Hold = (typeof HOLDS)[number]

/** The room a view gets in a region that holds views. */
export const SCALES = ['chip', 'row', 'cell', 'pane'] as const
export type Scale = (typeof SCALES)[number]

/** What a renderer lends the views it hosts. */
export const KIT_MEMBERS = ['terminal', 'region', 'run', 'display', 'go', 'bus', 'toast', 'confirm', 'href', 'showing'] as const
export type KitMember = (typeof KIT_MEMBERS)[number]

/**
 * A place a renderer draws for subjects of one kind. `id`: `<subject kind>.<place>`; `subject`: the kind, `item.*`
 * for every collection's items; `scale` and `arity` matter to one that holds views, `one` at a time or several as
 * `tabs`; `description`: where it is on screen, in words.
 */
export type Region = { id: string; subject: string; holds: Hold[]; scale?: Scale; arity?: 'one' | 'tabs'; description?: string }

/**
 * An arrangement of the views in a renderer's regions, by region id: `order` the views first, in this order; `hidden`
 * those not offered there; `open` the tab a tabs region opens on; `options` each view's own settings there. A
 * renderer's own (its `renderer.json`), the config's and the viewer's are laid one over the other by `layoutOf`.
 */
export type Layout = Record<
  string,
  { order?: string[]; hidden?: string[]; open?: { view: string; subject?: string }; options?: Record<string, Record<string, unknown>> }
>

/** What a renderer's `renderer.json` declares: its regions, its kit, the chords it keeps for itself, its default layout. */
export type Declared = { regions: Region[]; kit: KitMember[]; keeps: string[]; layout: Layout }

/** Where the `tower` command draws contributions, served in `/schema` as `cli.regions`. */
export const CLI_REGIONS: Region[] = [{ id: 'card.whoami', subject: 'card', holds: ['lines'], description: 'under the worker in `tower whoami`' }]

/**
 * Something that draws contributions, by name: a renderer, or the `tower` command. `regions` is absent when it declares
 * none, `why` saying why when it is known; `kit`, what it lends the views it hosts.
 */
export type Drawer = { name: string; regions?: Region[]; why?: string; kit?: readonly KitMember[] }

/**
 * One of an extension's commands or contributions and where it lands: `what` names it, `hold` is what a region must
 * hold to draw it, `on` the subject kinds it is offered on (empty for a command with none, which a palette runs), and
 * `at` each drawer's regions that draw it, `undefined` for a drawer that declares none (with its `why`), and `palette`
 * for a command with no `on` where the drawer runs commands: a renderer whose regions hold commands lists them in its
 * palette.
 */
export type Landing = { what: string; hold: Hold; on: string[]; at: { drawer: string; regions: string[] | undefined; why?: string; palette?: true }[] }

/** Whether a region for subjects of `region` draws one of `kind`: the same kind, or `item.*` against any collection's items. */
const forKind = (region: string, kind: string) =>
  region === kind || (region === 'item.*' && kind.startsWith('item.')) || (kind === 'item.*' && region.startsWith('item.'))

/**
 * An ask is listed by the floor or the board its subject belongs to. One folded on the board may be about anything, so
 * any region holding asks draws it; one folded on another kind is about that floor's things, so the board's don't.
 */
const drawsAsk = (region: Region, on: string[]) => on.includes('board') || region.subject !== 'board'

const draws = (region: Region, hold: Hold, on: string[]) =>
  region.holds.includes(hold) && (hold === 'asks' ? drawsAsk(region, on) : on.some((kind) => forKind(region.subject, kind)))

const landed = (drawers: Drawer[], what: string, hold: Hold, on: string[]): Landing => ({
  what,
  hold,
  on,
  at: drawers.map((d) => ({
    drawer: d.name,
    regions: d.regions?.filter((r) => draws(r, hold, on)).map((r) => r.id),
    ...(!d.regions && d.why && { why: d.why }),
    ...(hold === 'commands' && !on.length && d.regions?.some((r) => r.holds.includes('commands')) && { palette: true as const }),
  })),
})

/** Where a view lands: in each region holding views of a kind it is on, at a scale it draws, of a drawer lending all it needs. */
const viewLanded = (drawers: Drawer[], what: string, view: { on: string[]; scales: Scale[]; needs?: KitMember[] }): Landing => ({
  what,
  hold: 'views',
  on: view.on,
  at: drawers.map((d) => {
    const lacks = (view.needs ?? []).filter((m) => !d.kit?.includes(m))
    const regions = d.regions?.filter((r) => draws(r, 'views', view.on) && (!r.scale || view.scales.includes(r.scale)))
    return { drawer: d.name, regions: regions && (lacks.length ? [] : regions.map((r) => r.id)), ...(!d.regions && d.why && { why: d.why }), ...(d.regions && lacks.length && regions?.length && { why: `lends no ${lacks.join(', ')}` }) }
  }),
})

/**
 * Where each of an extension's commands, views and fold contributions lands, per drawer: a command in regions holding
 * commands on its `on`; a fold's actions in those holding verbs, and commands too when it declares any; its badges,
 * lines and tidy in those holding them on its kind; its asks wherever asks are held. Slots go to the slot loop, which
 * no region draws.
 */
export const landing = (drawers: Drawer[], extension: Pick<Manifest, 'folds' | 'commands' | 'views'> & { cap: string }): Landing[] => [
  ...Object.entries(extension.commands ?? {}).map(([name, c]) => landed(drawers, `${extension.cap}/${name}`, 'commands', c.on ?? [])),
  ...Object.entries(extension.views ?? {}).map(([name, v]) => viewLanded(drawers, `${extension.cap}/${name}`, v)),
  ...Object.entries(extension.folds ?? {}).flatMap(([kind, fold]) =>
    (fold.adds ?? []).flatMap((add): Landing[] => {
      const what = `${extension.cap} ${add}`
      if (add === 'slots') return []
      if (add === 'actions') return [landed(drawers, what, 'verbs', [kind]), ...(extension.commands ? [landed(drawers, what, 'commands', [kind])] : [])]
      return [landed(drawers, what, add, [kind])]
    }),
  ),
]

/** Where one landing goes, in a line: `narrate/speak on shown: page shown.head; tower3d: no region holds commands`. */
export const landingLine = (l: Landing): string => {
  const at = l.at.map(({ drawer, regions, why, palette }) =>
    regions === undefined
      ? `${drawer}: ${why ?? 'declares no regions'}`
      : palette
        ? `${drawer} its palette`
        : regions.length
          ? `${drawer} ${regions.join(', ')}`
          : `${drawer}: ${why ?? `no region holds ${l.hold}`}`,
  )
  return `${l.what} ${l.on.length ? `on ${l.on.join(', ')}` : 'on no subject, run from a palette'} (${l.hold}): ${at.join('; ')}`
}
