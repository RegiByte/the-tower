/**
 * The tower's slot loop (decisions `extensions`, `policies`): every 30 s each source decides which of its slots are due
 * and acts on them. The policies are one source (`policies.ts`), the extensions' slots another. A source's tick in
 * flight skips its next ticks, never another source's. Fired is held in memory only: a restart within a slot's 5 on-time
 * minutes fires it again, and a slot missed while the tower was down stays missed.
 */
import { offOn } from './bridge/stores.ts'
import type { Accepted } from './bridge/extensions.ts'
import type { Board } from './bridge/board.ts'
import type { Caller } from './shared/extensions.ts'
import type { Config } from './shared/model.ts'
import { dueSlot, type When } from './shared/slots.ts'
import { projectOfKey } from './shared/subjects.ts'
import type { ExtensionsResource, Instance } from './tower/extensions.ts'

export const TICK_MS = 30_000

/** What decides and acts on slots at each tick. `label`: how the tower's log names it. */
export type SlotSource = { label: string; tick: () => Promise<void> }

/** Who a slot's handler calls for: the tower, at a slot. */
export const SLOT_CALLER: Caller = { t: 'tower', id: 'slot', via: 'loop', within: [] }

/** One slot of an extension's to decide: by its manifest's name (`*` for one its folds give), and for which subject and floor. */
type Declared = { a: Accepted; instance: Instance; name: string; when: When; key?: string; project?: string }

/**
 * The extensions' slots as a source: each slot of a running extension's manifest, once for the tower or, scoped
 * `project`, once per floor where its capability is on, and each slot its floor and board folds give on the board now
 * (`board.adds[subject].slots`, fired through `slots['*']`), each fired when due. A handler runs on its own: the tick
 * doesn't wait for it, and its throw is a problem of its extension's.
 */
export const extensionSlots = (holder: ExtensionsResource, readConfig: () => Config, board: () => Board): SlotSource => {
  /** The latest slot fired, by capability, slot name, subject and floor. */
  const fired = new Map<string, number>()
  const fire = ({ a, instance, name, when, key, project }: Declared, now: number) => {
    const id = `${a.provides}/${name}/${key ?? ''}@${project ?? ''}`
    const at = dueSlot(when, fired.get(id), now)
    if (at === undefined) return
    fired.set(id, at)
    void instance.slot(name, { name, at, ...(key && { key }), ...(project && { project }) }, SLOT_CALLER).catch((err) => {
      console.error(`${a.id}: slot ${name}${key ? ` (${key})` : ''}:`, err)
      holder.problem(a.id, { lane: 'trigger', level: 'error', code: 'threw', message: `slot ${name} threw: ${(err as Error).message ?? String(err)}`, at: Date.now(), path: `slots.${name}` })
    })
  }
  return {
    label: 'extensions',
    tick: async () => {
      const config = readConfig()
      const running = holder.running()
      const declared = running.flatMap(({ a, instance }) =>
        Object.entries(a.manifest.slots ?? {}).flatMap(([name, { when, scope }]): Declared[] =>
          scope === 'project'
            ? Object.keys(config.projects)
                .filter((project) => !offOn(config, project, a.chain))
                .map((project) => ({ a, instance, name, when, project }))
            : [{ a, instance, name, when }],
        ),
      )
      const current = board()
      const folded = Object.entries(current.adds).flatMap(([subject, adds]) =>
        (adds.slots ?? []).flatMap((slot): Declared[] => {
          const provider = running.find(({ a }) => a.provides === slot.cap)
          const project = projectOfKey(current, subject)
          return provider ? [{ ...provider, name: '*', when: slot.when, key: slot.key, ...(project && { project }) }] : []
        }),
      )
      const at = Date.now()
      for (const slot of [...declared, ...folded]) fire(slot, at)
    },
  }
}

/** Ticks every source until stopped. */
export const runSlots = (sources: SlotSource[]) => {
  const ticking = new Set<SlotSource>()
  const tick = (source: SlotSource) => {
    if (ticking.has(source)) return
    ticking.add(source)
    void source
      .tick()
      .catch((err) => console.error(`${source.label}:`, err))
      .finally(() => ticking.delete(source))
  }
  const ticks = setInterval(() => sources.forEach(tick), TICK_MS)
  /** No more ticks: a tick in flight finishes. */
  return { stop: () => clearInterval(ticks) }
}
