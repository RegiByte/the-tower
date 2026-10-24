/**
 * The tower's slot loop (decisions `extensions`, `policies`): every 30 s each source decides which of its slots are due
 * and acts on them. The policies are one source (`policies.ts`), the extensions' manifests another. A source's tick in
 * flight skips its next ticks, never another source's. Fired is held in memory only: a restart within a slot's 5 on-time
 * minutes fires it again, and a slot missed while the tower was down stays missed.
 */
import { offOn } from './bridge/stores.ts'
import type { Caller } from './shared/extensions.ts'
import type { Config } from './shared/model.ts'
import { dueSlot } from './shared/slots.ts'
import type { ExtensionsResource } from './tower/extensions.ts'

export const TICK_MS = 30_000

/** What decides and acts on slots at each tick. `label`: how the tower's log names it. */
export type SlotSource = { label: string; tick: () => Promise<void> }

/** Who a slot's handler calls for: the tower, at a slot. */
export const SLOT_CALLER: Caller = { t: 'tower', id: 'slot', via: 'loop', within: [] }

/**
 * The extensions' slots as a source: each slot of a running extension's manifest, once for the tower or, scoped
 * `project`, once per floor where its capability is on, fired when due. A handler runs on its own: the tick doesn't wait
 * for it, and its throw is a problem of its extension's.
 */
export const extensionSlots = (holder: ExtensionsResource, readConfig: () => Config): SlotSource => {
  /** The latest slot fired, by capability, slot name and floor. */
  const fired = new Map<string, number>()
  return {
    label: 'extensions',
    tick: async () => {
      const config = readConfig()
      const now = Date.now()
      for (const { a, instance } of holder.running()) {
        for (const [name, { when, scope }] of Object.entries(a.manifest.slots ?? {})) {
          const floors = scope === 'project' ? Object.keys(config.projects).filter((project) => !offOn(config, project, a.chain)) : [undefined]
          for (const project of floors) {
            const key = `${a.provides}/${name}@${project ?? ''}`
            const at = dueSlot(when, fired.get(key), now)
            if (at === undefined) continue
            fired.set(key, at)
            void instance.slot(name, { name, at, ...(project && { project }) }, SLOT_CALLER).catch((err) => {
              console.error(`${a.id}: slot ${name}:`, err)
              holder.problem(a.id, { lane: 'trigger', level: 'error', code: 'threw', message: `slot ${name} threw: ${(err as Error).message ?? String(err)}`, at: Date.now(), path: `slots.${name}` })
            })
          }
        }
      }
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
