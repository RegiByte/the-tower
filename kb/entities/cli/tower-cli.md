---
{
  "type": "container",
  "name": "tower",
  "summary": "tower init | doctor | config check | up | down | update | spawn | resume | submit | kill | live | ls | ps | reap | screen | attach, beside the workers' verbs of the same command.",
  "in": "cli",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/cli.ts", "hub/src/mod/bin/tower", "hub/package.json", "hub/src/checkpoints.ts#foldLog", "hub/src/attach.ts#attach", "hub/src/machine.ts#bringUp", "hub/src/machine.ts#bringDown", "hub/src/init.ts#init", "hub/src/doctor.ts#doctor", "hub/src/update.ts#update", "hub/src/config-check.ts#configProblems", "hub/src/cli-error.ts#reported", "hub/docs/config.md"],
  "links": [
    { "to": "host-daemon", "verb": "calls", "carries": "spawn, write, resize, kill, live over control.sock" },
    { "to": "host-daemon", "verb": "triggers", "carries": "tower up: starts it detached, unless its socket already answers" },
    { "to": "terms-daemon", "verb": "triggers", "carries": "tower up: starts it detached, unless its socket already answers" },
    { "to": "tower-server", "verb": "triggers", "carries": "tower up: starts it detached, unless this system's tower already listens on its port" },
    { "to": "system-root", "verb": "writes", "carries": "host.pid, terms.pid and tower.pid on tower up; removes them on tower down; config.json once, on tower init, when none exists" },
    { "to": "system-root", "verb": "reads", "carries": "every session log from its checkpoint on for ls and resume, a whole log for screen and resume's conversation; tails one for attach (ps and reap read the process table only)" },
    { "to": "system-root", "verb": "writes", "carries": "cache/facts/<id>.v8, the checkpoints of the logs ls and resume fold" },
    { "to": "tower-server", "verb": "calls", "carries": "tower resume: POST /resume while it runs, so the resume joins the tower's queue" },
    { "to": "tower-server", "verb": "triggers", "carries": "tower update: stops it, moves the checkout to the newest release, starts it again" },
    { "to": "log-reductions", "verb": "uses", "carries": "foldLog, withLiveness, screenAt, snapshot, conversationsOf" }
  ]
}
---
One command for the user and the workers: the verbs above are the user's, and any other verb is a worker's,
handed to the tower's directory (`src/directory.ts`, [[agent-directory]]), which reads the running tower. The
tower mod puts the command on every session's PATH; `npm link` puts it on the user's (`bin` in `package.json`).

Unlike the tower it does not use [[live-system]]: each command reads the logs it needs and exits. `ls` and
`resume` fold every log from its checkpoint on, as the tower does ([[fold-checkpoints]]); `resume` asks the
running tower first and folds only when none answers ([[resume]]).
`tower submit` types its prompt with [`submitText`](ref:hub/src/machine.ts#submitText), the tower's `submit`.
`tower attach` puts the terminal at a session (its live screen, your keyboard); Ctrl-] detaches. `tower down`
stops the daemons `tower up` started ([[bring-up]]); both take daemons by name. `tower init` writes a first config
and `tower doctor` checks what the tower needs, one fix for each failure ([[setup]]). `tower update` moves the
checkout to the newest release and restarts the tower, never the host ([[releases]]).

`tower config check` reads the config as the tower does
([`configProblems`](ref:hub/src/config-check.ts#configProblems)): the tower's own validators, the shape of each
project, each shelf entry, collection and worktrees setting, and the keys it doesn't know, each problem at its key path, exiting 1 on any `fail` (an
unknown key is a `warn`). The known keys (`CONFIG_KEYS`, `PROJECT_KEYS` in `src/shared/model.ts`) are held to the
`Config` and `Project` types by the typecheck. `tower doctor` sums up the same check. Every key is documented in
`docs/config.md`, whose path the check prints.

Every verb, the workers' too, fails in one of two ways ([`reported`](ref:hub/src/cli-error.ts#reported)): an
expected failure (a usage slip, a name nothing has, a refusal by the host or the tower, a config the tower can't
take) is a `CliError` or a `ConfigError`, printed as one line `tower: <message>` with a `→ <fix>` line when there is
one, exiting 1; anything else is a bug and keeps its stack.
