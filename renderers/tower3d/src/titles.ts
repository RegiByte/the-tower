import { gamesTitled } from './arcade.ts'
import type { Tower } from './api.ts'
import type { Clients } from './clients.ts'
import { keptTitled } from './kept.ts'
import { notesTitled } from './notes.ts'
import type { Port } from './port.ts'

/**
 * Every title Tower 3D reads from an item's text: the drafts pinned as notes, any collection's kept items, the games.
 * Each is `…` until its text has arrived, which the port is told (`titles/arrived`); each is pruned with every board.
 */
export function startTitles({ tower, clients, port }: { tower: Tower; clients: Clients; port: Port }) {
  return {
    ...notesTitled(tower, clients, () => port.dispatch({ type: 'titles/arrived', of: 'notes' })),
    ...keptTitled(tower, clients.DRAFTS, () => port.dispatch({ type: 'titles/arrived', of: 'kept' })),
    ...gamesTitled(tower, () => port.dispatch({ type: 'titles/arrived', of: 'games' })),
  }
}

export type Titles = ReturnType<typeof startTitles>
