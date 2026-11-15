import { runtimeOf, type SessionHeader, type SessionLog } from '../shared/model.ts'
import type { NormalEvent, Normalizer, RuntimeReader, ToolFormat } from './events.ts'
import { claude } from './runtimes/claude.ts'
import { opencode } from './runtimes/opencode.ts'

const READERS: Record<string, RuntimeReader> = { claude, opencode }

/**
 * A session's log read by the runtime its header names. One the bridge has no reader for breaks wherever it is
 * folded: its first event throws.
 */
const readerOf = (header: SessionHeader): RuntimeReader => {
  const runtime = runtimeOf(header)
  const reader = READERS[runtime]
  if (reader) return reader
  const unread = () => {
    throw new Error(`no normalizer for runtime "${runtime}": the tower reads ${Object.keys(READERS).join(', ')} logs`)
  }
  return { normalizer: () => unread, tools: () => ({ line: unread, label: unread }) }
}

export const normalizerOf = (header: SessionHeader): Normalizer => readerOf(header).normalizer(header)

export const toolFormatOf = (header: SessionHeader): ToolFormat => readerOf(header).tools(header)

/**
 * A log's events, normalized up to the first line its runtime's reader can't follow. The facts fold breaks the
 * session on that line and says so on its card (`factsAfter`); a fold that reads the log whole reads it as far, so
 * the bad line costs only what follows it.
 */
export const readableEvents = ({ header, events }: SessionLog): NormalEvent[] => {
  const normalize = normalizerOf(header)
  const read: NormalEvent[] = []
  for (const event of events) {
    try {
      read.push(...normalize(event))
    } catch {
      break
    }
  }
  return read
}
