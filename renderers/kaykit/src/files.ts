import fs from 'node:fs'
import path from 'node:path'
import { flatten, parseScene, type Flat } from './scene.ts'

/** A scene document on disk, checked against the schema. */
export const readScene = (file: string) => parseScene(JSON.parse(fs.readFileSync(file, 'utf8')), file)

/** A scene file with its prefabs placed, each read relative to the file that names it. */
export const flatFile = (file: string): Promise<Flat> =>
  flatten(readScene(file), path.resolve(file), async (ref, from) => {
    const name = path.resolve(path.dirname(from), ref)
    return { scene: readScene(name), name }
  })
