# A hub that maps the other repos

Make the floor's hub a small repo of notes that describes every other repo, so each worker starts with the map.

Tomás worked across a dozen services. Instead of making one of them the hub, he made a notes repo: a `CLAUDE.md`
that says what each service does, how they talk to each other, where the shared types live and which commands
check each one, with the services as the floor's repos.

Every worker on the floor starts in the hub, so every worker starts knowing the system. When a worker learns
something worth keeping (a flaky test's cause, a deploy step), he asks it to write it into the hub's notes, and the
next worker starts from there.
