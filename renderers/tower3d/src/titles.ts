import { gamesTitled } from './arcade.ts'
import type { Clients } from './clients.ts'
import { keptTitled } from './kept.ts'
import { notesTitled } from './notes.ts'
import type { Port } from './port.ts'

/**
 * Every title Tower 3D reads from an item's text: the drafts pinned as notes, any collection's kept items, the games.
 * Each is `…` until its text has arrived, which the port is told (`titles/arrived`); each is pruned with every board.
 */
export function startTitles({ clients, port }: { clients: Clients; port: Port }) {
  return {
    ...notesTitled(clients, () => port.dispatch({ type: 'titles/arrived', of: 'notes' })),
    ...keptTitled(clients.DRAFTS, () => port.dispatch({ type: 'titles/arrived', of: 'kept' })),
    ...gamesTitled(() => port.dispatch({ type: 'titles/arrived', of: 'games' })),
  }
}

export type Titles = ReturnType<typeof startTitles>
