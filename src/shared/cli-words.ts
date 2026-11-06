/**
 * Extension words (decision `cli-words`): what `tower x <cap> <word>` types, derived from a manifest. Every verb is a
 * word by its name and a read is one when its `cli` names it; flags come from the input schema with no declaration, one
 * per top-level field. Everything here is pure: the `tower` command does the reading and the calling, so no extension
 * code runs in the command and each text an agent acts on can be held by a test.
 */
import { FACT_DOOR, matchRead, paramsOf, type Manifest, type Scope } from './extensions.ts'

/** How a flag's value is taken: a string as typed, a number or boolean converted, anything structured as JSON. */
export type Takes = 'string' | 'integer' | 'number' | 'boolean' | 'json'

/** A top-level field of a word's input: `many`, an array, whose flag is repeated. */
export type WordField = { name: string; takes: Takes; many: boolean; required: boolean; description?: string }

/**
 * One thing `tower x` calls: a verb, a writable fact's door, or a read, `name` being the verb's name, `facts/<fact>` or
 * the read's path. `word`: what it is typed as, none for a read that declares no word, which is reached by its path.
 * `fields`: a read's are its path's params, then its query's.
 */
export type Word = {
  kind: 'verb' | 'door' | 'read'
  name: string
  word?: string
  scope: Scope
  description?: string
  fields: WordField[]
  positional: string[]
  stdin?: string
  print?: string
  usage?: string
}

type JsonSchema = { type?: unknown; enum?: unknown[]; const?: unknown; items?: JsonSchema; properties?: Record<string, JsonSchema>; required?: string[]; description?: string }

const scalarOf = (schema: JsonSchema): Takes => {
  const types = [schema.type].flat().filter((t) => t !== 'null' && t !== undefined)
  const type = types.length === 1 ? types[0] : undefined
  if (type === 'string' || type === 'integer' || type === 'number' || type === 'boolean') return type
  const values = schema.enum ?? ('const' in schema ? [schema.const] : undefined)
  return values?.every((v) => typeof v === 'string') ? 'string' : 'json'
}

/** How a field's schema is typed: an array takes its flag repeated, each value as its items are. */
export const takesOf = (schema: JsonSchema): Pick<WordField, 'takes' | 'many'> => (schema.type === 'array' ? { takes: scalarOf(schema.items ?? {}), many: true } : { takes: scalarOf(schema), many: false })

/** An object schema's top-level fields, each as a flag takes it. */
export const fieldsOf = (schema: JsonSchema | undefined): WordField[] =>
  Object.entries(schema?.properties ?? {}).map(([name, field]) => ({
    name,
    ...takesOf(field),
    required: schema!.required?.includes(name) ?? false,
    ...(field.description !== undefined && { description: field.description }),
  }))

const readFields = (path: string, query: JsonSchema | undefined): WordField[] => {
  const params = paramsOf(path)
  return [...params.map((name) => ({ name, takes: 'string' as const, many: false, required: true })), ...fieldsOf(query).filter((f) => !params.includes(f.name))]
}

const cliParts = ({ positional, stdin, print, usage }: { positional?: string[]; stdin?: string; print?: string; usage?: string }) => ({
  positional: positional ?? [],
  ...(stdin !== undefined && { stdin }),
  ...(print !== undefined && { print }),
  ...(usage !== undefined && { usage }),
})

/** What `tower x` can call of a manifest: its verbs, its writable facts' doors, and its reads. */
export const wordsOf = (manifest: Manifest): Word[] => [
  ...Object.entries(manifest.facts ?? {})
    .filter(([, fact]) => fact.writable)
    .map(([name, fact]): Word => ({
      kind: 'door',
      name: `${FACT_DOOR}${name}`,
      word: `${FACT_DOOR}${name}`,
      scope: 'system',
      ...(fact.description !== undefined && { description: fact.description }),
      fields: [
        { name: 'value', ...takesOf(fact.schema), required: true },
        { name: 'session', takes: 'string', many: false, required: false, description: "The session it is about: the caller's own when left out." },
      ],
      positional: [],
    })),
  ...Object.entries(manifest.verbs ?? {}).map(([name, verb]): Word => ({
    kind: 'verb',
    name,
    word: verb.cli?.word ?? name,
    scope: verb.scope,
    ...(verb.description !== undefined && { description: verb.description }),
    fields: fieldsOf(verb.input),
    ...cliParts(verb.cli ?? {}),
  })),
  ...Object.entries(manifest.reads ?? {}).map(([path, read]): Word => ({
    kind: 'read',
    name: path,
    ...(read.cli?.word !== undefined && { word: read.cli.word }),
    scope: read.scope,
    ...(read.description !== undefined && { description: read.description }),
    fields: readFields(path, read.query),
    ...cliParts(read.cli ?? {}),
  })),
]

/**
 * What `name` reaches of an extension's words: a word, else a door or verb by its name, else the read whose path it
 * matches, whose params are then settled by the path and leave the flags.
 */
export const wordNamed = (words: Word[], name: string): Word | undefined => {
  const named = words.find((w) => w.word === name) ?? words.find((w) => w.kind !== 'read' && w.name === name)
  if (named) return named
  for (const word of words) {
    const params = word.kind === 'read' ? matchRead(word.name, name) : undefined
    if (params) return { ...word, name, word: undefined, fields: word.fields.filter((f) => !(f.name in params)), positional: word.positional.filter((p) => !(p in params)) }
  }
  return undefined
}

/** How far apart two names are, by single-letter edits. */
const distance = (a: string, b: string): number => {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}

/** The name closest to `name`, when one is close enough to be what was meant. */
export const nearest = (name: string, names: string[]): string | undefined => {
  const [best] = names.map((n) => ({ n, d: n.startsWith(name) || name.startsWith(n) ? 1 : distance(name, n) })).sort((a, b) => a.d - b.d)
  return best && best.d <= Math.max(2, Math.floor(name.length / 2)) ? best.n : undefined
}

const nearestSaid = (near: string | undefined, listing: string) => `${near ? `Did you mean ${near}? ` : ''}${listing}`

/** What to say of a word the capability doesn't offer: the nearest it does, and the listing command. */
export const unknownWordLines = (cap: string, words: Word[], name: string): { message: string; fix: string } => {
  const typed = words.flatMap((w) => w.word ?? (w.name.includes('<') ? [] : w.name))
  return { message: `${cap} has no word "${name}"`, fix: nearestSaid(nearest(name, typed), `\`tower x ${cap}\` lists its words`) }
}

const shellWord = (text: string) => (/^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`)

const typedName = (word: Word) => word.word ?? word.name

const valueWords = (field: WordField, value: unknown): string[] => (field.many ? (value as unknown[]) : [value]).map((v) => shellWord(typeof v === 'string' ? v : JSON.stringify(v)))

const STDIN_WORDS = "<<'EOF' … EOF"

const isDoorValue = (word: Word, field: WordField) => word.kind === 'door' && field.name === 'value'

/** Whether the caller's floor fills this field when nobody names it. */
const fillsProject = (word: Word, field: WordField) => word.scope === 'project' && field.name === 'project'

const holeOf = (field: WordField) => (field.takes === 'boolean' ? `--${field.name}` : `--${field.name} ${field.takes === 'json' ? "'{…}'" : `<${field.name}>`}`)

/**
 * The command that types `word` with `input`, in the order its usage reads, each required field nothing gave as a
 * hole to fill: a missing flag's example, and what a deprecated JSON argument should have been.
 */
export const typedLine = (cap: string, word: Word, input: Record<string, unknown>): string => {
  const given = (f: WordField) => input[f.name] !== undefined
  const positional = word.positional.flatMap((name) => {
    const field = word.fields.find((f) => f.name === name)!
    return given(field) ? valueWords(field, input[name]) : field.required ? [`<${name}>`] : []
  })
  const flags = word.fields
    .filter((f) => !word.positional.includes(f.name) && f.name !== word.stdin)
    .flatMap((f) => {
      if (isDoorValue(word, f) && input[f.name] === null && f.takes === 'string') return ['--value ""']
      if (!given(f)) return f.required && !fillsProject(word, f) ? [holeOf(f)] : []
      if (f.takes === 'boolean' && !f.many) return [input[f.name] ? `--${f.name}` : `--${f.name}=false`]
      return valueWords(f, input[f.name]).map((value) => `--${f.name} ${value}`)
    })
  const stdin = word.fields.find((f) => f.name === word.stdin)
  return ['tower x', cap, typedName(word), ...positional, ...flags, ...(stdin && (stdin.required || given(stdin)) ? [STDIN_WORDS] : [])].join(' ')
}

const optional = (text: string, required: boolean) => (required ? text : `[${text}]`)

/** A word's one line of usage, after `tower x <cap>`: its `cli.usage`, else made from its fields. */
export const usageOf = (word: Word): string => {
  if (word.usage) return word.usage
  const positional = word.positional.map((name) => {
    const field = word.fields.find((f) => f.name === name)!
    return optional(`<${name}>${field.many ? ' …' : ''}`, field.required)
  })
  const flags = word.fields
    .filter((f) => !word.positional.includes(f.name) && f.name !== word.stdin)
    .map((f) => optional(`${holeOf(f)}${f.many ? ' …' : ''}`, f.required && !fillsProject(word, f)))
  const stdin = word.fields.find((f) => f.name === word.stdin)
  return [typedName(word), ...positional, ...flags, ...(stdin ? [optional(STDIN_WORDS, stdin.required)] : [])].join(' ')
}

const TAKES_WORDS: Record<Takes, string> = { string: 'a string', integer: 'an integer', number: 'a number', boolean: 'true or false', json: 'JSON' }

/** What `tower x <cap> <word> --help` prints: its usage, what it does, and each flag. */
export const helpLines = (cap: string, word: Word): string[] => [
  `tower x ${cap} ${usageOf(word)}`,
  ...(word.description ? [word.description] : []),
  ...word.fields.map((f) => `  --${f.name}  ${TAKES_WORDS[f.takes]}${f.many ? ', repeated' : ''}${f.name === word.stdin ? ', or text on stdin' : ''}${fillsProject(word, f) ? ", your floor's when left out" : f.required ? ', required' : ''}${f.description ? `: ${f.description}` : ''}`),
]

/** A word's arguments as read: its input, a call for its help, or what was wrong, with what to do about it. */
export type Parsed = { t: 'input'; input: Record<string, unknown> } | { t: 'help' } | { t: 'bad'; message: string; fix: string }

const converted = (field: WordField, text: string): { value: unknown } | undefined => {
  if (field.takes === 'string') return { value: text }
  if (field.takes === 'integer') return /^-?\d+$/.test(text) ? { value: Number(text) } : undefined
  if (field.takes === 'number') return text.trim() && Number.isFinite(Number(text)) ? { value: Number(text) } : undefined
  if (field.takes === 'boolean') return text === 'true' || text === 'false' ? { value: text === 'true' } : undefined
  try {
    return { value: JSON.parse(text) }
  } catch {
    return undefined
  }
}

/** The arguments after a word: flags by its fields, what is left its positional fields, nothing filled in. */
export const parseWord = (cap: string, word: Word, args: string[]): Parsed => {
  const help = `\`tower x ${cap} ${typedName(word)} --help\` says what it takes`
  const bad = (message: string, fix = help): Parsed => ({ t: 'bad', message, fix })
  const input: Record<string, unknown> = {}
  const put = (field: WordField, text: string, typed: string): Parsed | undefined => {
    const value = converted(field, text)
    if (!value) return bad(`${typed} wants ${TAKES_WORDS[field.takes]}, not ${JSON.stringify(text)}`)
    if (field.many) {
      input[field.name] = [...((input[field.name] as unknown[]) ?? []), ...(field.takes === 'json' && Array.isArray(value.value) ? value.value : [value.value])]
      return undefined
    }
    if (input[field.name] !== undefined) return bad(`--${field.name} was given twice: it takes one value`)
    input[field.name] = value.value
    return undefined
  }
  const free: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--') {
      free.push(...args.slice(i + 1))
      break
    }
    if (!arg.startsWith('--')) {
      if (arg === '-h') return { t: 'help' }
      free.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq < 0 ? arg.slice(2) : arg.slice(2, eq)
    const inline = eq < 0 ? undefined : arg.slice(eq + 1)
    const field = word.fields.find((f) => f.name === name)
    if (!field) {
      if (name === 'help') return { t: 'help' }
      const near = nearest(name, word.fields.map((f) => f.name))
      return bad(`${typedName(word)} has no --${name}`, nearestSaid(near && `--${near}`, help))
    }
    if (field.takes === 'boolean' && inline === undefined) {
      const wrong = put(field, 'true', `--${name}`)
      if (wrong) return wrong
      continue
    }
    const text = inline ?? args[++i]
    if (text === undefined) return bad(`--${name} needs a value`)
    const wrong = put(field, text, `--${name}`)
    if (wrong) return wrong
  }
  for (const name of word.positional) {
    const field = word.fields.find((f) => f.name === name)!
    if (input[name] !== undefined || !free.length) continue
    for (const text of field.many ? free.splice(0) : free.splice(0, 1)) {
      const wrong = put(field, text, `<${name}>`)
      if (wrong) return wrong
    }
  }
  if (free.length) return bad(`${typedName(word)} takes no argument ${JSON.stringify(free[0])}`)
  return { t: 'input', input }
}

/**
 * The input of a deprecated JSON argument, as `tower x <cap> <verb> '<json>'` gave it: one argument that parses, and
 * for a word that takes positional arguments only an object, which no name it could be given looks like.
 */
export const jsonArgument = (word: Word, args: string[]): { body: unknown } | undefined => {
  if (args.length !== 1 || args[0].startsWith('--') || (word.positional.length && !args[0].startsWith('{'))) return undefined
  try {
    return { body: JSON.parse(args[0]) }
  } catch {
    return undefined
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const typesAs = (takes: Takes, value: unknown): boolean => {
  if (takes === 'json') return true
  return takes === 'integer' ? Number.isInteger(value) : typeof value === (takes === 'number' ? 'number' : takes)
}

/** Whether flags can say `body`: an object of known fields, each of the type its flag takes. A null has no flag. */
const isTypable = (word: Word, body: unknown): body is Record<string, unknown> =>
  isRecord(body) &&
  Object.entries(body).every(([name, value]) => {
    const field = word.fields.find((f) => f.name === name)
    if (!field) return false
    if (isDoorValue(word, field) && value === null && field.takes === 'string') return true
    return field.many ? Array.isArray(value) && value.every((v) => typesAs(field.takes, v)) : typesAs(field.takes, value)
  })

const JSON_GOES = 'A JSON argument to tower x is deprecated and goes at 2.0.'

/**
 * What a deprecated JSON argument says on stderr: that it goes, and what to type instead, or where to read how when
 * flags can't say that input. A null on a string door is typed as the blank value that clears it on purpose, on a door
 * that takes JSON as `null`, and on any other door it has no typed form.
 */
export const jsonDeprecatedLine = (cap: string, word: Word, body: unknown): string => {
  if (word.kind === 'door' && isRecord(body) && body.value === null && !['string', 'json'].includes(word.fields[0].takes)) return `${JSON_GOES} A null has no typed form on ${typedName(word)}: a door that needs one should offer a verb.`
  return `${JSON_GOES} Type instead: ${isTypable(word, body) ? typedLine(cap, word, body) : `tower x ${cap} ${typedName(word)} --help`}`
}

/** The first required field nothing gave, as what to say and an example, which leaves out the floor a worker's word fills; none when the input is whole. */
export const missingLine = (cap: string, word: Word, input: Record<string, unknown>): string | undefined => {
  const field = word.fields.find((f) => f.required && input[f.name] === undefined)
  if (!field) return undefined
  const { project: _, ...typed } = input
  const example = typedLine(cap, field.name === 'project' ? { ...word, scope: 'system' } : word, word.scope === 'project' ? typed : input)
  if (field.name === word.stdin) return `${typedName(word)} needs its ${field.name} on stdin: ${example}`
  return `${typedName(word)} needs ${word.positional.includes(field.name) ? `<${field.name}>` : `--${field.name}`}: ${example}`
}

/** The path and query of a read's word for `input`: params into the path, the other fields its query. */
export const readUrl = (cap: string, word: Word, input: Record<string, unknown>): string => {
  const params = paramsOf(word.name)
  const path = word.name.replace(/<([a-z]+)(\.\.\.)?>/g, (_, name: string, rest?: string) => (rest ? String(input[name]).split('/').map(encodeURIComponent).join('/') : encodeURIComponent(String(input[name]))))
  const query = new URLSearchParams(Object.entries(input).filter(([name, v]) => !params.includes(name) && v !== undefined).map(([name, v]) => [name, typeof v === 'string' ? v : JSON.stringify(v)])).toString()
  return `/${cap}/${path}${query ? `?${query}` : ''}`
}

/** A reply as `cli.print` says it: a string as it is, lines one per line, a field the reply left out nothing. */
export const printedOf = (reply: unknown, field: string): string | undefined => {
  const value = (reply as Record<string, string | string[] | undefined>)[field]
  return Array.isArray(value) ? value.join('\n') : value
}
