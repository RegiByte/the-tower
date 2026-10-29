/** Code, configuration and logs: served as plain text, so nothing a framed page loads from them runs as a script. */
const SOURCES = ['.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.sh', '.sql', '.edn', '.clj', '.cljs', '.toml', '.log']

/** The media type of each file extension the tower names: what a served file is sent as, and a subject's `type`. */
export const MEDIA_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.jsonl': 'application/x-ndjson',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.xml': 'text/xml',
  ...Object.fromEntries(SOURCES.map((ext) => [ext, 'text/plain'])),
}

/** The type of a file of any other extension. */
export const UNKNOWN_TYPE = 'application/octet-stream'

/** The media type of the file at `path`, by its extension. */
export const mediaTypeOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return (dot > 0 && MEDIA_TYPES[name.slice(dot).toLowerCase()]) || UNKNOWN_TYPE
}

/**
 * Whether `type` is one of `accepts`: a media type, or a top-level type's every subtype (`image/*`). A subject with no
 * type is accepted by none.
 */
export const accepted = (accepts: readonly string[], type: string | undefined): boolean =>
  type !== undefined && accepts.some((a) => a === type || (a.endsWith('/*') && type.startsWith(a.slice(0, -1))))
