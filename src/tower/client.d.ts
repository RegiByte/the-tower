/** The globals a page has once it includes `/tower.js`, for the client's own typecheck (tsconfig.client.json). */
import type { Tower } from '../shared/shelf-page.ts'

declare global {
  var tower: Tower
}
