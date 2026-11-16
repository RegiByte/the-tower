import type { AppEvent, Db } from './app.ts'

/**
 * Where the page's resources send what happened and read what the app decided, started before the app: the reads
 * that land (archives, titles), and every resource started before the app that reads its db or dispatches to it. The
 * app attaches itself once it is made; this is the one late binding between those resources and the app (decision
 * `tower3d-system`).
 */
export type Port = {
  dispatch: (event: AppEvent) => void
  /** The app's db, once the app attached. */
  state: () => Db
  attach: (app: { dispatch: (event: AppEvent) => void; state: () => Db }) => void
}

export function startPort(): Port {
  let app: { dispatch: (event: AppEvent) => void; state: () => Db } | undefined
  return {
    dispatch: (event) => {
      if (!app) throw new Error(`Tower 3D's port took a ${event.type} before the app attached: a source dispatched before the app resource started`)
      app.dispatch(event)
    },
    state: () => {
      if (!app) throw new Error("Tower 3D read its app's state before the app attached: a resource read the db while it started, before the app resource started")
      return app.state()
    },
    attach: (next) => {
      if (app) throw new Error("Tower 3D's port has its app already: the app attaches once")
      app = next
    },
  }
}
