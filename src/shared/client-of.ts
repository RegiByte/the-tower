import { importServed } from './import-served.ts'

/**
 * The extension client at `url`, or `without` when the tower serves no such file: another extension may provide the
 * capability, and `/x/<cap>/` then serves its folder, which may hold no such file. `without` holds what the renderer
 * calls with the file gone. A file that exists and fails to load fails here, as any import does.
 */
export async function clientOf<T>(url: string, without: Partial<T>): Promise<T> {
  return importServed(url).then(
    (module) => module as T,
    async (err) => {
      if ((await fetch(url)).status !== 404) throw err
      console.warn(`${url} is not served: its extension was replaced by one without it, and the renderer goes on without what it drew`)
      return without as T
    },
  )
}
