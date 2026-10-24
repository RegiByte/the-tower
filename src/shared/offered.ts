/** What the board offers: whether a card, conversation or floor offers a verb now, and its call. */

/** Whether a card, conversation or floor offers a verb right now: the board decides, renderers only draw. */
export const can = <A extends { verb: string }>(thing: { actions: readonly A[] }, verb: A['verb']) => thing.actions.some((a) => a.verb === verb)

/** The call of a verb a card, conversation or floor offers right now, none while it isn't offered. */
export const callOf = <A extends { verb: string }, V extends Extract<A, { call: unknown }>['verb']>(thing: { actions: readonly A[] }, verb: V): Extract<A, { verb: V; call: unknown }>['call'] | undefined =>
  thing.actions.find((a): a is Extract<A, { verb: V; call: unknown }> => a.verb === verb)?.call

/** What a press tells when it lands after the board stopped offering its verb on `name`'s thing. */
export const noLongerOffered = (name: string, verb: string) => `${name} no longer offers ${verb}`

/** The call of a verb `thing`, called `name`, offers right now; throws `noLongerOffered` once it doesn't. */
export const offeredCall = <A extends { verb: string }, V extends Extract<A, { call: unknown }>['verb']>(thing: { actions: readonly A[] }, verb: V, name: string) => {
  const call = callOf(thing, verb)
  if (!call) throw new Error(noLongerOffered(name, verb))
  return call
}
