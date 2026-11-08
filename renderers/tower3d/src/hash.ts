export const fnv1a = (text: string): number => {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}

/** murmur3's finalizer: FNV-1a alone leaves scores of different names biased, some names winning rarely. */
export const mix = (h: number): number => {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
