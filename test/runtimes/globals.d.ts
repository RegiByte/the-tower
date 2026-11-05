/**
 * What code that runs anywhere may use beyond the language: the globals a browser and node both have. The generic
 * modules' typecheck reads this in place of the DOM's types and node's.
 */
declare function setTimeout(run: () => void, ms?: number): unknown
declare function clearTimeout(timer: unknown): void
declare class URL {
  constructor(url: string, base?: string | URL)
  static canParse(url: string, base?: string | URL): boolean
  href: string
  pathname: string
  protocol: string
  search: string
  hash: string
  origin: string
  host: string
  hostname: string
  searchParams: { get(name: string): string | null }
}
declare class AbortSignal {
  aborted: boolean
}
declare const crypto: { randomUUID(): string; getRandomValues<T extends Uint8Array | Uint32Array>(array: T): T }
declare const console: { log(...said: unknown[]): void; warn(...said: unknown[]): void; error(...said: unknown[]): void }
