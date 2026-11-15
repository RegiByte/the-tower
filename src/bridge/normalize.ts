import { runtimeOf, type SessionHeader } from '../shared/model.ts'
import type { Normalizer, RuntimeReader } from './events.ts'
import { claude } from './runtimes/claude.ts'

const READERS: Record<string, RuntimeReader> = { claude }

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
  return { normalizer: () => unread }
}

export const normalizerOf = (header: SessionHeader): Normalizer => readerOf(header).normalizer(header)
