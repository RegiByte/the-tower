/**
 * The modules the tower serves below `/lib/`, `/shared/`, `/src/` and `/vendor/`, answered by a tool's own loopback
 * server (the dresser's, the editor's): the Tower 3D pages it serves import the library at run time. Each is built as
 * the tower builds it, at its plain URL, with no import map.
 */

import type http from 'node:http'
import { sourceModule, urlSource, urlVendor, vendorModule } from '../src/tower/served.ts'

const moduleText = (url: string): Promise<string> | undefined => {
  const file = urlSource(url)
  if (file !== undefined) return sourceModule(file)
  const specifier = urlVendor(url)
  return specifier === undefined ? undefined : vendorModule(specifier)
}

/** Answers `url` when it names a served module, saying whether it did. */
export function answerModule(url: string, res: http.ServerResponse): boolean {
  const text = moduleText(url)
  if (text === undefined) return false
  text.then(
    (js) => res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end(js),
    (err: Error) => res.writeHead(500, { 'content-type': 'text/plain' }).end(err.message),
  )
  return true
}
