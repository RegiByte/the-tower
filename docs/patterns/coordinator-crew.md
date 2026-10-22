# A coordinator that hires its crew

One worker holds the plan and hires a worker per piece, across several repos, then reviews and lands what comes back.

Maya had a change that touched the API, the web app and the mobile client. She started one worker on the plan and
told it to coordinate: split the work, hire a worker for each repo with `tower hire`, and have each one report back
when its review notes were answered.

The coordinator wrote each hire a brief that named the repo, the contract between the pieces and what done meant.
The hires worked in worktrees of their own, got themselves reviewed with `tower review`, and messaged the
coordinator when they were ready. Maya talked to one worker all afternoon; the crew showed up under it in the
sidebar, and she only stepped in when one of them waited on her.
