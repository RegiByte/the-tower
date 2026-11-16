import { eventRecord, EVENTS_KEPT } from './record.ts'
import type { Archive } from './archive.ts'
import { s } from './state.ts'

export type Events = ReturnType<typeof startEvents>

export function startEvents({ archive }: { archive: Archive }) {
  /** What Tower 3D's loops handled, newest last, for the door (`tower3d.events()`). */
  const events = eventRecord(EVENTS_KEPT, () => s.simNow)

  archive.watchArchives(events.listen('archives'))
  return events
}
