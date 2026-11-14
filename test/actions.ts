/** The board's `actions` as tests read them: the verbs offered, in order, and each offered verb's call by verb. */
type Offering = { actions: readonly { verb: string; call?: unknown }[] }

export const verbsOf = (thing: Offering): string[] => thing.actions.map((a) => a.verb)

export const callsOf = (thing: Offering): Record<string, unknown> => Object.fromEntries(thing.actions.flatMap((a) => ('call' in a ? [[a.verb, a.call]] : [])))
