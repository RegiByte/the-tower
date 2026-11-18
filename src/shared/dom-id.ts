/**
 * An element's id, by which the morph finds it again: `<place>:<key>`. `place` is named by the code, words of `[a-z0-9-]`
 * joined by `/`, never holding `:`; a part of a thing goes in its place (`row/menu`), and a view that can be mounted
 * twice puts its mount's scope first. `key` comes from data, never from position, as written but for whitespace and `%`,
 * percent-encoded, since an id holds no whitespace. Never parse an id back into data.
 */
export const domId = (place: string, key: string): string =>
  `${place}:${key.replace(/[\s%]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))}`
