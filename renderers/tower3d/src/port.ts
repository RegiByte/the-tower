import type { AppEvent } from './app.ts'

/**
 * Where the page's event sources send what happened: the reads that land (archives, titles), started before the app
 * that handles them. The app attaches itself once it is made; this is the one late binding between the sources and the
 * app (decision `tower3d-system`).
 */
export type Port = {
  dispatch: (event: AppEvent) => void
  attach: (app: { dispatch: (event: AppEvent) => void }) => void
}

export function startPort(): Port {
  let app: { dispatch: (event: AppEvent) => void } | undefined
  return {
    dispatch: (event) => {
      if (!app) throw new Error(`Tower 3D's port took a ${event.type} before the app attached: a source dispatched before main.ts made the app`)
      app.dispatch(event)
    },
    attach: (next) => {
      if (app) throw new Error("Tower 3D's port has its app already: the app attaches once")
      app = next
    },
  }
}
