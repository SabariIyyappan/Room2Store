# Room2Store shared-agent protocol

All agents working in this repository, including Codex and Claude, must coordinate through `status.md` and `tasks.md`.

## Required workflow

1. Read both files before starting work.
2. Immediately add a timestamped `STARTED` entry to `status.md` and mark the task `in progress` in `tasks.md`.
3. Append a `PROGRESS`, `BLOCKED`, or `DONE` entry after every material action, verification, external API call, or handoff.
4. Mark a task complete only after its stated verification has passed.
5. Do not delete, overwrite, or rewrite another agent's log entries; append updates instead.
6. Claim files in `tasks.md` before making overlapping edits.
7. Keep secrets out of source, task files, status files, command output, and commits.

## Status format

Use: `YYYY-MM-DD HH:MM PT | Agent | STATUS | concise result / next step`.
