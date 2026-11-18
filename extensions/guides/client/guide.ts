/**
 * A guide as its file holds it: a `# Title` line, then a fenced json header, then the body. The title is the first
 * line because every listing of a collection derives an item's title from it (`titleIn`); the header says where the
 * guide sits in the learning center and what finds it.
 */

/** The collection the guides live in, tower-wide. */
export const GUIDES = 'guides'

/** The floor id that names the tower-wide collections in the API's paths. */
export const TOWER_WIDE = '_tower'

/** A guide's header: `keywords` a search matches besides the title, `category` the group it is listed under, `order` its place there. */
export type Header = { keywords: string[]; category: string; order: number }

export type Guide = { id: string; title: string; header: Header; body: string }

/** A guide whose file doesn't read as one, with why, so the center lists it as broken and the rest still show. */
export type Broken = { id: string; why: string }

const HEADER = /^```json\n([\s\S]*?)\n```\n?/

const headerOf = (json: unknown): Header | string => {
  if (typeof json !== 'object' || json === null) return 'its header is not a json object'
  const { keywords, category, order } = json as Record<string, unknown>
  if (!Array.isArray(keywords) || !keywords.every((k) => typeof k === 'string')) return 'its header has no `keywords`, a list of words'
  if (typeof category !== 'string' || !category) return 'its header has no `category`'
  if (typeof order !== 'number') return 'its header has no `order`, a number'
  return { keywords, category, order }
}

/** The guide `text` holds, or why it doesn't hold one. */
export const guideOf = (id: string, text: string): Guide | Broken => {
  const [first, ...rest] = text.replace(/\r\n/g, '\n').split('\n')
  if (!first?.startsWith('# ')) return { id, why: 'its first line is not a `# Title`' }
  const after = rest.join('\n').replace(/^\n+/, '')
  const fence = after.match(HEADER)
  if (!fence) return { id, why: 'no ```json header follows its title' }
  let json: unknown
  try {
    json = JSON.parse(fence[1]!)
  } catch (err) {
    return { id, why: `its header is not json: ${(err as Error).message}` }
  }
  const header = headerOf(json)
  if (typeof header === 'string') return { id, why: header }
  return { id, title: first.slice(2).trim(), header, body: after.slice(fence[0].length).replace(/^\n+/, '') }
}

export const isGuide = (g: Guide | Broken): g is Guide => 'header' in g

/** The guides by category, categories by their lowest order, each one's guides by order, then title. */
export const byCategory = (guides: Guide[]): { category: string; guides: Guide[] }[] => {
  const sorted = [...guides].sort((a, b) => a.header.order - b.header.order || a.title.localeCompare(b.title))
  return [...new Set(sorted.map((g) => g.header.category))].map((category) => ({ category, guides: sorted.filter((g) => g.header.category === category) }))
}

/** Whether every word of `query` is in the guide's title, its keywords or its body, ignoring case. */
export const matches = (g: Guide, query: string): boolean => {
  const hay = [g.title, ...g.header.keywords, g.body].join(' ').toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word))
}
