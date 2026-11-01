/**
 * What a session leaves running on the machine. Claude runs each Bash command in a session of its own with no
 * controlling terminal, and a command's `&` children are orphaned as soon as its shell exits, so neither the PTY
 * nor the process tree bounds a session's processes. The environment does: every descendant inherits
 * `TOWER_SESSION_ID`, even after it is re-parented out of the host's tree. Apple platform binaries hide their
 * environment and are never listed.
 */

export type Process = { pid: number; ppid: number; command: string; session: string | undefined }

/** `orphan`: re-parented out of the host's tree, so nothing will end it with its session. */
export type Resource = { pid: number; session: string; command: string; ports: number[]; orphan: boolean }

const SESSION_MARKER = / TOWER_SESSION_ID=([\w-]+)/

const COMMAND_LINE = /^\s*(\d+)\s+(\d+)\s+(.*)$/
const ENVIRONMENT_LINE = /^\s*(\d+)\s+(.*)$/

const matches = (text: string, line: RegExp): RegExpExecArray[] =>
  text.split('\n').flatMap((row) => {
    const match = line.exec(row)
    return match ? [match] : []
  })

/**
 * `commands` is `ps -A -ww -o pid=,ppid=,command=`; `environments` is `ps -A -ww -E -o pid=,command=` (`e` for `-E` under WSL), whose
 * command runs into the environment with nothing to tell them apart, so it is read only for the session marker.
 */
export const parseProcesses = (commands: string, environments: string): Process[] => {
  const sessions = new Map(matches(environments, ENVIRONMENT_LINE).map(([, pid, rest]) => [Number(pid), SESSION_MARKER.exec(rest)?.[1]]))
  return matches(commands, COMMAND_LINE).map(([, pid, ppid, command]) => ({
    pid: Number(pid),
    ppid: Number(ppid),
    command,
    session: sessions.get(Number(pid)),
  }))
}

/** `lsof -nP -iTCP -sTCP:LISTEN -F pn`: a `p<pid>` line, then an `n<address>:<port>` line per socket. */
export const parseListening = (lsof: string): Map<number, number[]> => {
  const ports = new Map<number, Set<number>>()
  let pid = 0
  for (const line of lsof.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    if (line.startsWith('n')) ports.set(pid, (ports.get(pid) ?? new Set()).add(Number(line.slice(line.lastIndexOf(':') + 1))))
  }
  return new Map([...ports].map(([pid, set]) => [pid, [...set].sort((a, b) => a - b)]))
}

/**
 * The hosts and every process under them. An orphan's parent is outside: whatever adopted it, launchd on macOS, WSL's
 * init relay, or a subreaper, is no descendant of a host. Read from the tree, not the environment, which Apple
 * platform binaries such as a session's shell hide.
 */
const underHosts = (procs: Process[], hosts: Set<number>): Set<number> => {
  const children = Map.groupBy(procs, (proc) => proc.ppid)
  const under = new Set<number>()
  const visit = (pid: number): void => {
    if (under.has(pid)) return
    under.add(pid)
    for (const child of children.get(pid) ?? []) visit(child.pid)
  }
  hosts.forEach(visit)
  return under
}

/** `hosts` are the pids of running hosts: a session's own Claude is the host's child, not one of its resources. */
export const resources = (procs: Process[], listening: Map<number, number[]>, hosts: Set<number>): Resource[] => {
  const under = underHosts(procs, hosts)
  return procs.flatMap((proc) =>
    proc.session === undefined || hosts.has(proc.ppid)
      ? []
      : [{ pid: proc.pid, session: proc.session, command: proc.command, ports: listening.get(proc.pid) ?? [], orphan: !under.has(proc.ppid) }],
  )
}

/** What Claude Code registers for each running Claude in `~/.claude/sessions/<pid>.json`, read for its name. */
export type ClaudeRegistration = { pid: number; name: string }

/** `name`: the session name Claude Code's other sessions message this session's Claude by. */
export type Peer = { session: string; name: string }

/** A session's own Claude is the host's child that carries the session's marker. */
export const peers = (procs: Process[], registrations: ClaudeRegistration[], hosts: Set<number>): Peer[] => {
  const byPid = new Map(procs.map((proc) => [proc.pid, proc]))
  return registrations.flatMap(({ pid, name }) => {
    const proc = byPid.get(pid)
    return proc?.session !== undefined && hosts.has(proc.ppid) ? [{ session: proc.session, name }] : []
  })
}
