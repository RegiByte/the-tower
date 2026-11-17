import { eventRecord, EVENTS_KEPT } from './record.ts'
import type { Archive } from './archive.ts'
import type { Sim } from './sim.ts'

export type Events = ReturnType<typeof startEvents>

export function startEvents({ archive, sim }: { archive: Archive; sim: Sim }) {
  /** What Tower 3D's loops handled, newest last, for the door (`tower3d.events()`). */
  const events = eventRecord(EVENTS_KEPT, sim.now)

  archive.watchArchives(events.listen('archives'))
  return events
}
