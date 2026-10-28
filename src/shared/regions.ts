import type { Manifest } from './extensions.ts'

/**
 * Where a renderer draws what extensions contribute (decision `renderers-in-config`): its regions, each named by a
 * subject kind and a place (`card.head`), declared in `renderer.json` at its root and served in `GET /renderers`.
 * `landing` says, for an extension, which renderers' regions draw each of its commands and contributions.
 */

/** What a region draws: actions split into those calling a verb and those running a client command, and the other contributions. */
export const HOLDS = ['verbs', 'commands', 'badges', 'lines', 'marks', 'tidy', 'asks', 'views'] as const
export type Hold = (typeof HOLDS)[number]

/** The room a view gets in a region that holds views. */
export const SCALES = ['chip', 'row', 'cell', 'pane'] as const
export type Scale = (typeof SCALES)[number]

/** What a renderer lends the views it hosts. */
export const KIT_MEMBERS = ['terminal', 'region', 'run', 'display', 'bus', 'toast', 'confirm'] as const
export type KitMember = (typeof KIT_MEMBERS)[number]

/**
 * A place a renderer draws for subjects of one kind. `id`: `<subject kind>.<place>`; `subject`: the kind, `item.*`
 * for every collection's items; `scale` and `arity` matter to one that holds views, `one` at a time or several as
 * `tabs`; `description`: where it is on screen, in words.
 */
export type Region = { id: string; subject: string; holds: Hold[]; scale?: Scale; arity?: 'one' | 'tabs'; description?: string }

/** A renderer's default arrangement of the views in its regions, by region id: read from API 1.102. */
export type Layout = Record<
  string,
  { order?: string[]; hidden?: string[]; open?: { view: string; subject?: string }; options?: Record<string, Record<string, unknown>> }
>

/** What a renderer's `renderer.json` declares: its regions, its kit, the chords it keeps for itself, its default layout. */
export type Declared = { regions: Region[]; kit: KitMember[]; keeps: string[]; layout: Layout }

/** Where the `tower` command draws contributions, served in `/schema` as `cli.regions`. */
export const CLI_REGIONS: Region[] = [{ id: 'card.whoami', subject: 'card', holds: ['lines'], description: 'under the worker in `tower whoami`' }]

/** Something that draws contributions, by name: a renderer, or the `tower` command. `regions` is absent when it declares none. */
export type Drawer = { name: string; regions?: Region[] }

/**
 * One of an extension's commands or contributions and where it lands: `what` names it, `hold` is what a region must
 * hold to draw it, `on` the subject kinds it is offered on (empty for a command with none, which a palette runs), and
 * `at` each drawer's regions that draw it, `undefined` for a drawer that declares none, and `palette` for a command
 * with no `on` where the drawer runs commands: a renderer whose regions hold commands lists them in its palette.
 */
export type Landing = { what: string; hold: Hold; on: string[]; at: { drawer: string; regions: string[] | undefined; palette?: true }[] }

/** Whether a region for subjects of `region` draws one of `kind`: the same kind, or `item.*` against any collection's items. */
const forKind = (region: string, kind: string) =>
  region === kind || (region === 'item.*' && kind.startsWith('item.')) || (kind === 'item.*' && region.startsWith('item.'))

/** An ask is listed by the floor or the board its subject belongs to, so any region holding asks draws it, whatever the kind it was folded on. */
const draws = (region: Region, hold: Hold, on: string[]) => region.holds.includes(hold) && (hold === 'asks' || on.some((kind) => forKind(region.subject, kind)))

const landed = (drawers: Drawer[], what: string, hold: Hold, on: string[]): Landing => ({
  what,
  hold,
  on,
  at: drawers.map((d) => ({
    drawer: d.name,
    regions: d.regions?.filter((r) => draws(r, hold, on)).map((r) => r.id),
    ...(hold === 'commands' && !on.length && d.regions?.some((r) => r.holds.includes('commands')) && { palette: true as const }),
  })),
})

/**
 * Where each of an extension's commands and fold contributions lands, per drawer: a command in regions holding
 * commands on its `on`; a fold's actions in those holding verbs, and commands too when it declares any; its badges,
 * lines and tidy in those holding them on its kind; its asks wherever asks are held. Slots go to the slot loop, which
 * no region draws.
 */
export const landing = (drawers: Drawer[], extension: Pick<Manifest, 'folds' | 'commands'> & { cap: string }): Landing[] => [
  ...Object.entries(extension.commands ?? {}).map(([name, c]) => landed(drawers, `${extension.cap}/${name}`, 'commands', c.on ?? [])),
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
  const at = l.at.map(({ drawer, regions, palette }) =>
    regions === undefined
      ? `${drawer}: declares no regions`
      : palette
        ? `${drawer} its palette`
        : regions.length
          ? `${drawer} ${regions.join(', ')}`
          : `${drawer}: no region holds ${l.hold}`,
  )
  return `${l.what} ${l.on.length ? `on ${l.on.join(', ')}` : 'on no subject, run from a palette'} (${l.hold}): ${at.join('; ')}`
}
