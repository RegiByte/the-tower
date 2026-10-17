import path from 'node:path'
import type { Catalog } from './catalog.ts'
import { check, checkDocument, type Issue } from './check.ts'
import { flatFile, readScene } from './files.ts'

/** A scene file's issues: its document's own, then its models' in the shared scene and in each of its states alone. */
export async function checkFile(file: string, catalog: Catalog): Promise<Issue[]> {
  const scene = readScene(file)
  const variants = [[], ...Object.keys(scene.states ?? {}).map((s) => [s])]
  const placed = await Promise.all(
    variants.map((states) =>
      flatFile(file, states).then(
        (flat) => check(flat, catalog),
        (e: Error): Issue[] => [{ level: 'error', at: `${file}${states.length ? ` in ${states[0]}` : ''}`, message: e.message }],
      ),
    ),
  )
  const seen = new Set<string>()
  return [...checkDocument(scene, path.resolve(file)), ...placed.flat()].filter((i) => !seen.has(i.at + i.message) && !!seen.add(i.at + i.message))
}
