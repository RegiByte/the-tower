/** Words and numbers as every renderer prints them: escaped html, plain markdown, counts, sizes, spans and moments. */

/** A command line with its program by name alone: `/opt/x/bin/node server.js` → `node server.js`. */
export const commandName = (command: string) => command.replace(/^\S*\//, '')

/** A word for a count of `n` of it, plural but for one: `note`, `notes`. */
export const noun = (n: number, word: string) => (n === 1 ? word : `${word}s`)

/** A count with its word: `1 note`, `3 notes`. */
export const plural = (n: number, word: string) => `${n} ${noun(n, word)}`

/** A size in bytes as `340 MB`, a tenth under ten, kilobytes under one. */
export const sizeOf = (bytes: number) => {
  if (bytes < 1_000_000) return `${Math.ceil(bytes / 1000)} kB`
  const mb = bytes / 1_000_000
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/** Markdown on one line: emphasis and code marks only get in the way. */
export const plain = (text: string) => text.replace(/\*\*|`/g, '')
/** `claude-haiku-4-5-20251001` → `haiku 4.5` */
export const modelName = (m?: string) => m?.replace(/^claude-([a-z]+)-(\d+)-(\d+).*$/, '$1 $2.$3') ?? ''
export const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const ago = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d`
}

/** A moment in the viewer's locale: `Oct 6, 21:40`. */
export const when = (ms: number) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** A count of tokens: `33.6 k`. */
export const tokenCount = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)} B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)} k` : String(v))

const MINUTE = 60_000

/** A span to the minute: `<1m`, `40m`, `1h 12m`, `3d`. */
export const span = (ms: number) => {
  const m = Math.floor(Math.max(0, ms) / MINUTE)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  if (m < 24 * 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.floor(m / (24 * 60))}d`
}

/** A moment on the wall clock: `22:00` today, `Sun 22:00` another day. */
export const clockAt = (at: number, now: number) => {
  const time = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return new Date(at).toDateString() === new Date(now).toDateString() ? time : `${new Date(at).toLocaleDateString([], { weekday: 'short' })} ${time}`
}
