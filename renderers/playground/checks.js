/** A scene's check failing: what it wanted, and what it saw instead. @returns {never} */
export const fail = (/** @type {string} */ what, /** @type {unknown} */ seen) => {
  throw new Error(`${what}: ${JSON.stringify(seen)}`)
}
