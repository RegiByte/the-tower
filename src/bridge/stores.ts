/**
 * Extensions' stores as the core reads them (decision `extensions`): which collections a floor keeps, the config's and
 * those of the extensions on there, who owns each, and an extension's session facts over a worker's lineage.
 */
import type { Collection, Doors, SessionFact } from '../shared/extensions.ts'
import { projectCollections, TOWER_WIDE, type CollectionType, type Config } from '../shared/model.ts'
import { EXTENSION_FACTS, type Session } from './facts.ts'

/**
 * What an accepted extension declares of its collections, the capabilities it is off with (`Accepted.chain`), and the
 * hooks it answers while it runs.
 */
export type ExtensionStores = { provides: string; chain: string[]; collections: Record<string, Collection>; answers: string[] }

/** Whether a running extension on the floor answers `hook`: a discard is offered only where one records it. */
export const answeredOn = (config: Config, project: string, extensions: ExtensionStores[], hook: string): boolean =>
  extensions.some((x) => x.answers.includes(hook) && !offOn(config, project, x.chain))

/** Whether an extension is off on a floor: a capability of its `chain` is off there. */
export const offOn = (config: Config, project: string, chain: string[]): boolean =>
  chain.some((cap) => config.projects[project]?.capabilities?.[cap]?.off === true)

/**
 * A collection on a floor: `by`, the capability of the extension that declares it; `owner`, the capability that alone
 * writes it; `doors`, how others reach it, as declared.
 */
export type FloorCollectionType = CollectionType & { by?: string; owner?: string; doors?: Doors }

/** A collection as an extension declares it on the board: by its capability, owned and with doors when it says so. */
const declaredBy = (provides: string, c: Collection, words: CollectionType): FloorCollectionType => ({
  label: words.label,
  description: words.description,
  by: provides,
  ...(c.owned && { owner: provides }),
  ...(c.doors && { doors: c.doors }),
})

/** Whether a collection is one tower-wide collection rather than one on each floor. */
const towerWide = (c: Collection): boolean => c.scope === 'system'

/**
 * A floor's collections: the config's, then each of the extensions on that floor, tower-wide ones aside. A collection both declare takes the
 * config's label and description, and stays the extension's, owned when it says so; on a floor where the extension
 * is off, it is the config's alone, open, and one only the extension declares isn't there.
 */
export const floorCollections = (config: Config, project: string, extensions: ExtensionStores[]): Record<string, FloorCollectionType> => {
  const declared = projectCollections(config, project)
  const added = extensions
    .filter((x) => !offOn(config, project, x.chain))
    .flatMap((x) =>
      Object.entries(x.collections)
        .filter(([, c]) => !towerWide(c))
        .map(([id, c]): [string, FloorCollectionType] => [id, declaredBy(x.provides, c, { label: declared[id]?.label ?? c.label, description: declared[id]?.description ?? c.description })]),
    )
  return { ...declared, ...Object.fromEntries(added) }
}

/** The tower-wide collections, kept under `_tower/`: those the accepted extensions declare with `scope: "system"`. */
export const towerCollections = (extensions: ExtensionStores[]): Record<string, FloorCollectionType> =>
  Object.fromEntries(extensions.flatMap((x) => Object.entries(x.collections).flatMap(([id, c]) => (towerWide(c) ? [[id, declaredBy(x.provides, c, c)]] : []))))

/** Why a generic write to `collection` is refused: it is owned, and its owner's create door says how to add to it. */
export const ownedRefusal = (collection: string, { owner, doors }: FloorCollectionType): string | undefined => {
  if (!owner) return undefined
  const create = doors!.create
  return `${owner} owns ${collection}: ${typeof create === 'string' ? `use ${create}` : `only ${owner} writes it (${create.none})`}`
}

/** The session fact an extension logs as `name`. */
export const extensionFactName = (cap: string, name: string): string => `${EXTENSION_FACTS}${cap}.${name}`

/** A capability's session facts over a worker's `lineage` (oldest first), in order, each session's once. */
export const sessionFacts = (cap: string, lineage: Session[]): SessionFact[] =>
  [...new Map(lineage.map((s) => [s.header.id, s])).values()].flatMap((s) =>
    s.facts.extensionFacts.flatMap(([at, of, name, value]) => (of === cap ? [{ name, value, at, session: s.header.id }] : [])),
  )

/**
 * A floor's collection by id, or with `project` `_tower` a tower-wide one: `undefined` when there is none of that
 * name there, or no such floor.
 */
export const collectionOn = (config: Config, project: string, collection: string, extensions: ExtensionStores[]): FloorCollectionType | undefined => {
  const kept = project === TOWER_WIDE ? towerCollections(extensions) : Object.hasOwn(config.projects, project) ? floorCollections(config, project, extensions) : {}
  return Object.entries(kept).find(([id]) => id === collection)?.[1]
}
