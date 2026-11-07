/**
 * What a throw says, always as a string. Code the tower doesn't own can throw anything: `undefined`, as
 * `Promise.reject()` does, or an object with no way to be read at all. These run in catch handlers, where a failure of
 * their own would be a new, unhandled one.
 */
export const thrownWords = (err: unknown): string => {
  try {
    return String((err as Error)?.message ?? err)
  } catch {
    return "a throw that can't be read"
  }
}

/** `err` as an `Error`, for code past this point that reads one. */
export const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(thrownWords(err)))
