# Workspace Hygiene Map

This repo keeps product code visible and local artifacts contained.

## Official Product Areas

- `client/` - React frontend
- `server/` - Express backend
- `shared/` - shared schema, permissions, and types
- `docs/` - current project documentation
- `scripts/` - reusable project scripts
- `tests/` and `e2e/` - test assets intended to stay in the repo
- `migrations/` - database migration assets

## Local Artifact Areas

- `.qa/logs/` - local dev server logs and QA logs
- `.qa/screenshots/` - QA screenshots
- `.qa/reports/` - generated QA reports
- `.qa/scratchpad/` - one-off local scripts and temporary experiments
- `.qa/archive/` - old plans, temporary notes, and no-longer-current QA material

## Rules

1. Do not place logs, cookies, screenshots, or temporary scripts in the repo root.
2. Do not delete unknown artifacts during cleanup; move them into `.qa/archive/` first.
3. Do not move tracked product files during hygiene work unless the Inspector explicitly approves a reorganization.
4. Keep `.env`, service-account files, and local AI config files ignored and out of reports.
5. Keep active feature fixes separate from hygiene commits.

## Current Notes

- `coverage/` is tracked in this repo, so do not move it in a casual cleanup phase.
- `skills` is a tracked gitlink/submodule-style entry, so do not move it casually.
- `node_modules/`, `dist/`, `playwright-report/`, and `test-results/` are ignored generated folders; they may be removed or regenerated only when explicitly requested.
