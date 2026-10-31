# Morning triage

```json
{ "when": { "cron": ["0 0 * * *"], "tz": "UTC" }, "start": "ask", "hire": { "model": "sonnet" } }
```

Read the issues opened since yesterday's run. Label each one, close the duplicates with a link to the original, and
end with a short list of what needs a person: one line each, most urgent first.
