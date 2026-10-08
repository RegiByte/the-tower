import type { SessionLog } from '../shared/model.ts'

/** The text after the last newline is dropped: it is a line the host is still writing. */
export const parseLog = (text: string): SessionLog => {
  const [header, ...events] = text.split('\n').slice(0, -1).map((line) => JSON.parse(line))
  return { header, events }
}
