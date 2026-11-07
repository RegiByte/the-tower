/** The address of the document a browser module runs in; declared here since the library's generic modules know no DOM. */
declare const location: { href: string }

/**
 * The module the tower serves at `path`, imported by its whole address: a classic script framed at an opaque origin has
 * `about:blank` as `import()`'s base in Chrome, while `location.href` keeps the real one (`location.origin` is `null`).
 */
export const importServed = (path: string): Promise<Record<string, unknown>> => import(new URL(path, location.href).href)
