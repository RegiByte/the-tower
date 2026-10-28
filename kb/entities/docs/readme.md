---
{
  "type": "doc",
  "name": "README",
  "summary": "The repository's front page: what the tower is, the renderers that ship, requirements, setup, the user's tower verbs, a config example and where the rest is documented; it restates the code below, so a change there re-checks it.",
  "in": "tower",
  "reviewed": "2026-10-27",
  "refs": ["hub/src/renderers.ts#BUILT_INS", "hub/src/shared/claude.ts#CLAUDE_TESTED", "hub/src/doctor.ts#readiness", "hub/scripts/setup.ts", "hub/src/cli.ts#main", "hub/src/app.ts#openApp", "hub/src/init.ts#initialConfig", "hub/src/shared/model.ts#PROJECT_KEYS", "hub/src/shared/launch.ts#settingsArgs"]
}
---
`README.md` at the repository root is the first thing a person who forks the tower reads. It names claims that live
in code: the renderers that ship ([`BUILT_INS`](ref:hub/src/renderers.ts#BUILT_INS): the tower page, The Week and
Tower 3D, [[renderers-in-config]]), the Claude Code range
([`CLAUDE_TESTED`](ref:hub/src/shared/claude.ts#CLAUDE_TESTED)) and the rest of what [[setup]] checks, the user's
verbs of the `tower` command ([[tower-cli]]), `tower app` ([[macos-app]]), and a config whose keys are documented in
full by [[docs-config]].

What it leaves to others: the architecture and rules to `AGENTS.md`, extending to [[docs-extending]], daily use to
[[docs-usage]], licences to [[third-party]].

When one of the refs changes, re-read the README against it: a list there (renderers, verbs, requirements) is a copy
of the code's.
