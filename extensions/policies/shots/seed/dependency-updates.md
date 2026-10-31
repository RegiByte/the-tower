# Dependency updates

```json
{
  "when": { "cron": ["0 6 * * 1"], "tz": "UTC" },
  "check": "test -f package.json",
  "start": "auto",
  "live": 1,
  "hire": { "model": "opus", "effort": "high" }
}
```

Update the project's dependencies one at a time, running the tests after each. Open one pull request with every
update that passed, and list the ones that failed and why. Nobody watches this run: end with `tower home` once the
pull request is open.
