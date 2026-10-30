---
{
  "type": "doc",
  "name": "PRINCIPLES.md",
  "summary": "The rules a change to the repository keeps, each with its reason and the decision behind it; loaded into every agent's context and taking precedence over a contributor's own or their agent's general instructions when working here.",
  "in": "tower",
  "reviewed": "2026-10-30",
  "refs": ["hub/PRINCIPLES.md", "hub/CLAUDE.md", "hub/AGENTS.md"]
}
---
`PRINCIPLES.md` at the repository root states the values the architecture rests on as rules a diff can be checked
against: the system (Unix, Emacs, open systems, processes of data), state ([[logs-are-facts]], [[fold-checkpoints]]),
code ([[functional-core]], [[composition-over-optionality]], [[machines]], [[fail-clearly]]) and boundaries
([[renderer-is-disposable]], [[extensions]], [[agents-have-every-capability]], [[host-owns-ptys]], [[env-scrub]],
[[renderer-api-contract]]). Each rule names its decision; the decision holds the reasoning.

Claude loads it through `CLAUDE.md`, which imports it before `AGENTS.md`; other agents read only `AGENTS.md`, whose
first line sends them to it. The `tower:review` skill has a reviewer check a diff against the project's stated rules
([[tower-mod]]).

A change that has to break a rule changes the rule and its decision in the same pull request. A decision that
changes what a rule says updates the rule.
