/**
 * Where a checkout's repos are and how the core names them: a project's main checkouts and its worktrees' dirs, and a
 * repo and a file's code as the Changes, their picks and marks, and review threads' anchors name them. Served as
 * `/repos.js`, and lent to extensions' server code as `tower:repos.js`.
 */

/** The dirs a project is configured with: its hub and its repos, each a main checkout. */
type Dirs = { hub: string; repos: string[] }

/** The main checkouts of a project: the hub first, then its repos. */
export const projectDirs = (project: Dirs): string[] => [project.hub, ...project.repos]

/** Where the tower cuts a project dir's worktrees: inside the repo, which Claude's workspace trust covers. */
export const WORKTREES_DIR = '.worktrees'

export const worktreePath = (dir: string, name: string): string => `${dir}/${WORKTREES_DIR}/${name}`

/**
 * A checkout is a worktree name across every dir of a project, or `main` for the main checkouts, as `git worktree list`
 * names them: what review threads are kept for. A cut refuses the name `main`.
 */
export const MAIN_CHECKOUT = 'main'

/** The dirs of a checkout of a project, one per project dir: its main checkouts, or the worktree `checkout` of each. */
export const checkoutDirs = (project: Dirs, checkout: string): string[] =>
  checkout === MAIN_CHECKOUT ? projectDirs(project) : projectDirs(project).map((dir) => worktreePath(dir, checkout))

/** A repo as the Changes pane and anchors name it: the folder of its main checkout, also for its worktrees. */
export const repoName = (dir: string): string => dir.split('/.worktrees/')[0].split('/').filter(Boolean).at(-1)!

const LANGS: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', json: 'json', md: 'md', html: 'html', css: 'css', py: 'py',
  sh: 'sh', clj: 'clojure', cljs: 'clojure', edn: 'clojure', go: 'go', rs: 'rust', rb: 'ruby', java: 'java', sql: 'sql', yml: 'yaml', yaml: 'yaml',
}

/** The fence language of a quote from `path`: its extension's, or none. */
export const langOf = (path: string): string => LANGS[path.split('.').at(-1)!.toLowerCase()] ?? ''
