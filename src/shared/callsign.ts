import { fnv1a, mix } from "./hash.ts"

/** The names workers are called by when the config names none (`callsigns`). */
export const CALLSIGNS = [
  "HOLMES", "WATSON", "SMITH", "ARTHUR", "GIDEON", "MARSHAL", "RANGER", 
  "NEMO", "HEPHAESTUS", "HERMES", "WOLF", "QUATERMAIN", "BISHOP", "LEON", 
  "FRIDAY", "ALFRED", "MERLIN", "ATLAS", "PROMETHEUS", "FOGG", "MORPHEUS", "KOWALSKI", "MIKE", "KRATOS",
  "PETER", "JOHN", "BIT", "AJAX", "HECTOR", "BEN", "JOHNNY", "CHARLES",
  "SADDIE", "LUCY", "ADA", "FORGER", "HANZ", "ORION", "MORGAN", "CAESAR",
  "ODIN", "TYR", "BROK", "FREYR", "RAGNAR", "PERCIVAL", "DANIEL", "TURING",
  "RICH", "KEPLER", "FRANKLIN", "WALT", "MARCO", "POLO", "COLOMBO", 
  "ATHOS", "DON", "ROBIN", "ALTAIR", "POLARIS", "DEIMOS", "HANDLER",
  "BROKER", "PATHFINDER", "SAILOR", "FRANK", "NOX", "ODYSSEUS",
  "ATHENA", "HUGIN", "MUNIN", "SIGURD", "BEOWULF", "ENKI", "WUKONG", "ROLAND",
  "HOPPER", "KOROLEV", "MORIARTY", "LESTRADE", "ENDURANCE",
]

/** A name a callsign can start with: it is matched in upper case, and lowercased it names a worktree. */
export const CALLSIGN_NAME = /^[A-Z][A-Z0-9]*$/

/**
 * Rendezvous hashing: a session takes the name that scores highest with its id, so a name added to the list
 * takes over only the sessions that score highest with it, and every other session keeps its name.
 */
const nameOf = (names: readonly string[], id: string): string => {
  let best = names[0]
  let bestScore = -1
  for (const name of names) {
    const score = mix(fnv1a(`${name}:${id}`))
    if (score > bestScore) [best, bestScore] = [name, score]
  }
  return best
}

/** Naming scores every name, and a board names every session on every build: each list names each id once. */
const namers = new Map<string, (id: string) => string>()

/** The worker's name in every renderer, from `names`: a callsign and a number, both hashed (FNV-1a) from the session id. */
export const callsigns = (names: readonly string[]): ((id: string) => string) => {
  const key = names.join(' ')
  const known = namers.get(key)
  if (known) return known
  const named = new Map<string, string>()
  const callsign = (id: string): string => {
    let name = named.get(id)
    if (!name) named.set(id, (name = `${nameOf(names, id)}-${String((fnv1a(id) >>> 8) % 100).padStart(2, "0")}`))
    return name
  }
  namers.set(key, callsign)
  return callsign
}
