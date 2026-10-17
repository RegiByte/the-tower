import type { Scene } from './scene.ts'

/** How wide a value may print on one line before it breaks into one entry per line. */
const WIDTH = 120

const inline = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`
  if (v && typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined)
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}'
  }
  return JSON.stringify(v)
}

/** A placed thing (a model, a box, a slot, a guide): a line of its own however long, so a move diffs as one line. */
const placed = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && 'at' in v

const block = (v: unknown, indent: string, room: number): string => {
  const one = inline(v)
  if (!v || typeof v !== 'object' || placed(v) || (one.length <= room && !(Array.isArray(v) && v.some(placed)))) return one
  const inner = `${indent} `
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + block(x, inner, WIDTH - inner.length)).join(',\n')}\n${indent}]`
  const entries = Object.entries(v).filter(([, x]) => x !== undefined)
  return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${block(x, inner, WIDTH - inner.length - k.length - 4)}`).join(',\n')}\n${indent}}`
}

/**
 * A scene as its file holds it: the document broken into one key per line, every placed thing on a line of its own,
 * and any other value on one line when it fits, so a hand-made edit diffs as the lines it changed.
 */
export function formatScene(scene: Scene): string {
  const entries = Object.entries(scene).filter(([, v]) => v !== undefined)
  return `{\n${entries.map(([k, v]) => ` ${JSON.stringify(k)}: ${block(v, ' ', WIDTH - k.length - 5)}`).join(',\n')}\n}\n`
}
