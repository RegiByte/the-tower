/**
 * The New floor form as plain data: where a floor's hub comes from, the fields as typed, what each derives while the
 * user hasn't typed it (an id from the name, a name from the folder or the URL, a clone's or a new project's folder from
 * the parent folder picked and the id), the repos picked, and the call the form makes. Pure: the view draws it and does the calls.
 */

/** Where the hub comes from: a folder already there, a repository cloned by URL, or a new project. */
export type Source = 'add' | 'clone' | 'new'

export const SOURCES: { id: Source; label: string; hint: string; submit: string }[] = [
  { id: 'add', label: 'Existing folder', hint: 'a project already on this machine', submit: 'Add floor' },
  { id: 'clone', label: 'Clone a repository', hint: 'git clone from a URL, then a floor for it', submit: 'Clone and add floor' },
  { id: 'new', label: 'New project', hint: 'a new folder with git and a first commit', submit: 'Create project and floor' },
]

/**
 * The fields as typed; a field left `undefined` is derived (`derived`). `repos`: the other folders a floor for an
 * existing folder works in, none for a project with one repository.
 */
export type Fields = { source: Source; name?: string; id?: string; url?: string; into?: string; hub?: string; repos: string[] }

/** A floor id from words: lower case letters, digits, `-` and `_`, the rest as single dashes. */
export const slugOf = (words: string): string =>
  words
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** A repository's name from its URL: the last path part, without `.git`. */
export const repoNameOf = (url: string): string =>
  url
    .trim()
    .replace(/[/]+$/, '')
    .replace(/\.git$/, '')
    .split(/[/:]/)
    .pop() ?? ''

const baseOf = (dir: string) => dir.replace(/[/]+$/, '').split('/').pop() ?? ''

/**
 * Every field as the form submits it: what was typed, or else what it derives from the rest. `parent`: the folder a
 * clone or a new project goes under, as picked.
 */
export const derived = (f: Fields, parent: string): Required<Omit<Fields, 'source'>> & { source: Source } => {
  const name = f.name ?? (f.source === 'add' ? baseOf(f.hub ?? '') : f.source === 'clone' ? repoNameOf(f.url ?? '') : '')
  const id = f.id ?? slugOf(name)
  return { source: f.source, name, id, url: f.url ?? '', hub: f.hub ?? '', repos: f.repos, into: f.into ?? (id ? `${parent.replace(/[/]+$/, '')}/${id}` : '') }
}

/** Why the form can't be sent yet, in words; none when it can. */
export const missing = (d: ReturnType<typeof derived>): string | undefined => {
  if (d.source === 'add' && !d.hub.startsWith('/')) return 'pick a folder'
  if (d.source === 'add' && d.repos.includes(d.hub)) return 'the hub is no repo of its own: remove it from the repos'
  if (d.source === 'clone' && !d.url.trim()) return "type the repository's URL"
  if (!d.name.trim()) return 'name the floor'
  if (!/^[A-Za-z0-9_-]+$/.test(d.id)) return 'an id takes letters, digits, - and _'
  if (d.source !== 'add' && !d.into.startsWith('/')) return 'the folder must be an absolute path'
  return undefined
}

/** The verb and input the form sends. */
export const callOf = (d: ReturnType<typeof derived>): [string, Record<string, unknown>] => {
  const floor = { id: d.id, name: d.name.trim() }
  if (d.source === 'add') return ['floors/add', { ...floor, hub: d.hub, ...(d.repos.length ? { repos: d.repos } : {}) }]
  if (d.source === 'clone') return ['floors/clone', { ...floor, url: d.url.trim(), into: d.into }]
  return ['floors/start', { ...floor, into: d.into }]
}
