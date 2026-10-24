---
{
  "type": "container",
  "name": "tower",
  "summary": "tower init | doctor | config check | up | down | update | spawn | resume | submit | kill | live | ls | ps | reap | screen | attach | app, beside the workers' verbs of the same command.",
  "in": "cli",
  "reviewed": "2026-10-24",
  "refs": ["hub/src/cli.ts", "hub/src/cli-verbs.ts#CLI_VERBS", "hub/src/cli.ts#USER_RUNS", "hub/src/directory.ts#WORKER_RUNS", "hub/src/cli.ts#towerCommand", "hub/src/cli.ts#readSessions", "hub/src/mod/bin/tower", "hub/package.json", "hub/src/checkpoints.ts#foldLog", "hub/src/attach.ts#attach", "hub/src/machine.ts#bringUp", "hub/src/machine.ts#bringDown", "hub/src/init.ts#init", "hub/src/doctor.ts#doctor", "hub/src/update.ts#update", "hub/src/config-check.ts#configProblems", "hub/src/cli-error.ts#reported", "hub/src/app.ts#openApp", "hub/docs/config.md"],
  "links": [
    { "to": "host-daemon", "verb": "calls", "carries": "write, resize, kill, live and fact (a worker's submit or kill named in the target's log) over control.sock" },
    { "to": "host-daemon", "verb": "triggers", "carries": "tower up: starts it detached, unless its socket already answers" },
    { "to": "terms-daemon", "verb": "triggers", "carries": "tower up: starts it detached, unless its socket already answers" },
    { "to": "tower-server", "verb": "triggers", "carries": "tower up: starts it detached, unless this system's tower already listens on its port" },
    { "to": "system-root", "verb": "writes", "carries": "host.pid, terms.pid and tower.pid on tower up; removes them on tower down; config.json once, on tower init, when none exists" },
    { "to": "system-root", "verb": "reads", "carries": "every session log from its checkpoint on for ls and kill, a whole log for screen and resume's conversation; tails one for attach (ps reads the process table only; reap reads it and checks each session's log in the root)" },
    { "to": "system-root", "verb": "writes", "carries": "cache/facts/<id>.v8, the checkpoints of the logs ls and kill fold" },
    { "to": "tower-server", "verb": "calls", "carries": "tower spawn and tower resume: POST /spawn and POST /resume, so every session is started by the tower; refused with the fix `tower up` when it is not running" },
    { "to": "tower-server", "verb": "triggers", "carries": "tower update: stops it, moves the checkout to the newest release, starts it again" },
    { "to": "log-reductions", "verb": "uses", "carries": "foldLog, withLiveness, screenAt, snapshot, conversationsOf" }
  ]
}
---
One command for the user and the workers: the verbs above are the user's, the rest the workers', run by the tower's
directory (`src/directory.ts`, [[agent-directory]]). The tower mod puts the command on every session's PATH; `npm link`
puts it on the user's (`bin` in `package.json`).

The verbs are data: one table, [`CLI_VERBS`](ref:hub/src/cli-verbs.ts#CLI_VERBS), each entry's name, whose it is
(`of`: `user` or `worker`), what it takes (`usage`) and what it does (`help`). `tower --help` prints it, the user's then
the workers'; `tower <verb> --help` prints one's usage; an unknown verb lists every name. The handlers stay beside their
logic, keyed by the table's names: the user's in [`USER_RUNS`](ref:hub/src/cli.ts#USER_RUNS), the workers' in
[`WORKER_RUNS`](ref:hub/src/directory.ts#WORKER_RUNS), each typed to hold exactly the verbs of its `of`, so a verb without
a handler, a handler without a verb or two verbs of one name fail the typecheck. `src/cli.ts` dispatches; importing
the table or the directory runs nothing.

It does not use [[live-system]]: each command reads the logs it needs and exits. `ls` and `kill` fold every log from
its checkpoint on ([`readSessions`](ref:hub/src/cli.ts#readSessions), [[fold-checkpoints]]). `spawn` and `resume`
start no session themselves: they ask the running tower (`POST /spawn`, `POST /resume`, with the tower's origin),
which composes the launch, holds callsigns and conversations and queues resumes ([[resume]]); with no tower running
they fail with the fix `tower up` ([`towerCommand`](ref:hub/src/cli.ts#towerCommand)). `resume` reads the source's
log only for its latest saved conversation.

`submit` types its prompt with [`submitText`](ref:hub/src/machine.ts#submitText), the tower's `submit`. `kill` takes
a session id or a running worker's callsign. Run by a worker (`TOWER_SESSION_ID` set), each first has the host append
a fact naming that worker to the target's log (`tower.prompt`, `tower.kill`, [[worker-prompts]]). `attach` puts the
terminal at a session (its live screen, your keyboard); Ctrl-] detaches. `up` and `down` take daemons by name
([[bring-up]]). `init` and `doctor`: [[setup]]. `update` moves the checkout to the newest release and restarts the
tower, never the host ([[releases]]). `app` builds the Mac app from this checkout when its source changed and opens it
([[macos-app]]).

`tower config check` reads the config as the tower does
([`configProblems`](ref:hub/src/config-check.ts#configProblems)): the tower's own validators, then the shape of each
project, shelf entry, collection and worktrees setting, each problem at its key path. A value the tower can't take is a
`fail` (exit 1); a key it doesn't know, at any depth, is a `warn`. The known keys (`CONFIG_KEYS`, `PROJECT_KEYS` and
each nested object's, in `src/shared/model.ts`) are held to their types by the typecheck. `tower doctor` sums up the
same check. Every key is documented in `docs/config.md`, whose path the check prints.

Every verb, the workers' too, fails one of two ways ([`reported`](ref:hub/src/cli-error.ts#reported)): an expected
failure (a usage slip, a name nothing has, a refusal by the host or the tower, a config the tower can't take) is a
`CliError` or `ConfigError`, printed as `tower: <message>` with a `→ <fix>` line when there is one, exiting 1;
anything else is a bug and keeps its stack.
