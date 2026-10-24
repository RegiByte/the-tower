/** A value made read-only all the way down: shared by every reader, as a stream's fold state and the board extensions fold are. */
export const frozen = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const inner of Object.values(value)) frozen(inner)
  }
  return value
}
