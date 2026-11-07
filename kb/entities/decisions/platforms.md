---
{
  "type": "decision",
  "name": "macOS and WSL 2",
  "summary": "The tower runs on macOS and on Linux under WSL 2. What differs between them is one record per platform in platform.ts: the ps flag that prints a process's environment, how a process's working directory is read, what installs a missing tool, and how a URL or a file is shown on the desktop. Leftovers are orphaned when their parent is outside the host's process tree, whatever adopted them. Any other platform fails tower doctor.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-31",
  "reviewed": "2026-11-07",
  "refs": ["hub/src/platform.ts#Platform", "hub/src/platform.ts#detected", "hub/src/platform.ts#platform", "hub/src/platform.ts#startWindows", "hub/src/platform.ts#lsofCwd", "hub/src/doctor.ts#supported", "hub/src/doctor.ts#readiness", "hub/src/machine.ts#scanProcesses", "hub/src/machine.ts#servesConfig", "hub/src/machine.ts#reveal", "hub/src/bridge/resources.ts#underHosts", "hub/src/bridge/resources.ts#resources", "hub/scripts/setup.ts"]
}
---
**Problem.** The tower was written on a Mac and read the machine the Mac's way: `ps -E` for a process's environment,
`open` for the browser and Finder, and a leftover counted as orphaned when its parent was launchd, pid 1. Under WSL 2
everything else already works (PTYs, Unix sockets, `lsof`, file watches), but procps refuses `-E`, there is no
`open`, and an orphan is adopted by WSL's init relay, not pid 1, so none was ever marked.

**Why.** WSL 2 is how a Windows user runs Claude Code, and its Linux is close enough to the Mac's Unix that the
difference fits in a few fields.

**How.**

- **One record per platform** ([`Platform`](ref:hub/src/platform.ts#Platform)), chosen once
  ([`detected`](ref:hub/src/platform.ts#detected)): macOS by `process.platform`, WSL by its kernel's release, which
  names Microsoft. Its fields are the `ps` environment flag (`-E` on macOS, `e` on procps), a process's working
  directory (`lsof` on macOS, [`lsofCwd`](ref:hub/src/platform.ts#lsofCwd), the `/proc/<pid>/cwd` link under WSL, which
  needs no tool), the doctor's install fix
  for a missing tool (`xcode-select --install`, `sudo apt install <tool>`) and for an old git, and two desktop
  actions: opening a URL and revealing a file, `open` and `open -R` on macOS, Windows' `explorer.exe` under WSL with the
  path through `wslpath -w`. Explorer exits 1 even when it did what it was asked, so under WSL only a failure to start
  it is an error ([`startWindows`](ref:hub/src/platform.ts#startWindows)).
- **Orphans from the tree** ([`underHosts`](ref:hub/src/bridge/resources.ts#underHosts)): a leftover is orphaned when
  its parent is not a host or a process under one. That holds whatever adopted it: launchd, systemd, WSL's init relay,
  or a subreaper. The environment can't tell this, because Apple platform binaries such as a session's shell hide it.
- **The doctor** ([`supported`](ref:hub/src/doctor.ts#supported)) names the platform, fails any other, and checks
  `lsof`, which a Mac always has and a Linux may not.
- **Not covered:** `tower app` is a Mac app ([[macos-app]]). The panels still say Finder where a file is revealed.

**Alternatives considered.**

- *`if (process.platform === 'darwin')` at each call.* The differences end up spread over the machine's edge, and
  the next platform adds a branch to each.
- *Native Linux too.* It would differ only in its desktop actions (`xdg-open`), but nobody has run the tower on it.
  Claiming it is a separate change, made by someone who runs it.
- *`wslview` for the desktop actions.* It comes from a package a fresh distribution may not have. `explorer.exe` is
  always there when interop is on, and interop is what lets WSL start a Windows program at all.

**Impact.** On WSL, keep the checkout in the Linux filesystem (`~/…`), not under `/mnt/c`. The tower runs from
`/mnt/c`, but every file read crosses into Windows: the server's boot there takes longer than `test/server.test.ts`
waits for.
