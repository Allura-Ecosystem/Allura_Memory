# Codex Local Environment

This repo is configured for the Codex app Local Environments feature.

Official reference: https://developers.openai.com/codex/app/local-environments

## Setup Script

Use this script in Codex app settings as the Linux/default setup script:

```bash
bash .codex/setup-local-environment.sh
```

It installs dependencies only when `node_modules` is missing, then runs:

```bash
bun run validate:codex-gate
bun run typecheck
```

The setup script does not copy or print `.env`, `.env.local`, API keys, database passwords, or other secrets.

## Actions

Add these as project actions in the Codex app settings.

| Action | Icon | Script |
| --- | --- | --- |
| Dashboard Dev | monitor | `bash .codex/actions/dev-dashboard.sh` |
| Typecheck | check-circle | `bash .codex/actions/typecheck.sh` |
| Mission Tests | test-tube | `bash .codex/actions/test-mission-control.sh` |
| Build | hammer | `bash .codex/actions/build.sh` |
| Health | activity | `bash .codex/actions/health.sh` |

`Dashboard Dev` defaults to `http://localhost:3334` so it does not collide with the Docker dashboard on `3100`.
