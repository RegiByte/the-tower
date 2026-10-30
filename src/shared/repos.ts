/**
 * How the core names a repo and a file's code wherever lines of a worker's changes are named: the Changes, their
 * picks and marks, and review threads' anchors.
 */

/** A repo as the Changes pane and anchors name it: the folder of its main checkout, also for its worktrees. */
export const repoName = (dir: string): string => dir.split('/.worktrees/')[0].split('/').filter(Boolean).at(-1)!

const LANGS: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', json: 'json', md: 'md', html: 'html', css: 'css', py: 'py',
  sh: 'sh', clj: 'clojure', cljs: 'clojure', edn: 'clojure', go: 'go', rs: 'rust', rb: 'ruby', java: 'java', sql: 'sql', yml: 'yaml', yaml: 'yaml',
}

/** The fence language of a quote from `path`: its extension's, or none. */
export const langOf = (path: string): string => LANGS[path.split('.').at(-1)!.toLowerCase()] ?? ''
