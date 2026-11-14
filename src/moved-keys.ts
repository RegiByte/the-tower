/**
 * The config keys 2.0 moved under `runtimes`, so a 1.x config is refused with its fix instead of read past: an old
 * `plugins` would start sessions without the user's plugins, an old `command` would start a floor under the default
 * command. Read by `configLack` and `tower config check`, and it does nothing else. Without it an old key is only an
 * unknown key's warning, so it stays until a later major drops it.
 */

/** Each moved key, from its old place to its new one beside it. */
const MOVED: Record<'top' | 'project', Record<string, string>> = {
  top: { argv: 'runtimes.claude.argv', plugins: 'runtimes.claude.plugins' },
  project: { plugins: 'runtimes.claude.plugins', command: 'runtimes.claude.command' },
}

/** A moved key the config still holds at its old path, with the path it moved to. */
export type MovedKey = { key: string; to: string }

const movedIn = (prefix: string, value: unknown, moved: Record<string, string>): MovedKey[] =>
  typeof value === 'object' && value !== null ? Object.keys(moved).filter((key) => key in value).map((key) => ({ key: `${prefix}${key}`, to: `${prefix}${moved[key]}` })) : []

/** Every moved key `config` holds at its old path, the top level's first, then each project's. */
export const movedKeys = (config: Record<string, unknown>): MovedKey[] => [
  ...movedIn('', config, MOVED.top),
  ...(typeof config.projects === 'object' && config.projects !== null ? Object.entries(config.projects).flatMap(([id, project]) => movedIn(`projects.${id}.`, project, MOVED.project)) : []),
]

/** What a moved key says: where it went, and the guide that shows the rewrite. */
export const movedLine = ({ key, to }: MovedKey): string => `${key} moved to ${to} in 2.0: move it there (docs/migrating-to-2.md)`
