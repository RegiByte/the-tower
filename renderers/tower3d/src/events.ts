import { eventRecord, EVENTS_KEPT } from './record.ts'
import { watchArchives } from './archive.ts'
import { s } from './state.ts'

export type Events = ReturnType<typeof startEvents>

export function startEvents() {
  /** What Tower 3D's loops handled, newest last, for the door (`tower3d.events()`). */
  const events = eventRecord(EVENTS_KEPT, () => s.simNow)

  watchArchives(events.listen('archives'))
  return events
}
