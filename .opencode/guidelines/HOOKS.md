# Hooks and Runtime Adapter Policy

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, runtime documentation, and team consensus.

## Purpose

Hooks, plugins, and runtime adapter settings enforce approved Allura rules. They do not create new rules.

The canonical rules live in:

- [AI-GUIDELINES.md](./AI-GUIDELINES.md)
- [Team RAM agents](../agent/)
- [OpenCode config](../config.json)
- [Allura canonical docs](../../docs/allura/)
- Planning artifacts under [`docs/archive/`](../../docs/archive/)

## Runtime Surface Model

| Surface | Role | Authority |
| --- | --- | --- |
| `.opencode/` | OpenCode harness, Team RAM agents, skills, commands, guidelines | Canonical for this repo |
| `.claude/` | Claude Code adapter | Adapter only |
| `.codex/` | Codex adapter | Adapter only |
| `.agents/` | Cross-runtime bridge and shared skill surface | Bridge only |
| `.github/scripts/` | Repository guard scripts | Enforcement only |

## Hook Rule

Hooks may block, warn, log, or add context only for an already-approved rule. A hook must not introduce a new source of truth, agent roster, permission model, route contract, memory policy, or documentation standard.

## Context7 / Fresh Docs Gate

Before proposing or editing runtime hook behavior, check current runtime documentation.

Current evidence gathered for this policy:

- OpenCode uses configured plugins through the `plugin` field and plugin hook handlers such as `tool.execute.before`, `shell.env`, `event`, and session compaction hooks.
- Claude Code uses `hooks` in `.claude/settings.json`, with events such as `PreToolUse`, `PostToolUse`, `ConfigChange`, `SessionStart`, `SubagentStart`, and `SubagentStop`.
- GitHub Actions can run repository guard scripts through `run` steps; a non-zero script exit fails the job.

## Preferred Enforcement Order

1. **Repository guard scripts** — deterministic, CI-friendly, harness-neutral.
2. **OpenCode plugins** — local OpenCode runtime enforcement for approved rules.
3. **Claude hooks** — Claude Code adapter enforcement for approved rules.
4. **Codex adapter hooks/settings** — only after current Codex semantics are documented or locally confirmed.

## Approved Initial Guards

- `docs-allura-canonical-guard.sh` — enforces the professor/Carlos `docs/allura/` canonical surface.
- `runtime-adapter-surface-guard.sh` — warns when runtime adapter surfaces introduce unapproved hook/config authority.

## Non-Negotiables

- No secrets in hook commands, hook logs, or HTTP hook headers.
- No hook may bypass HITL promotion, Allura Brain governance, or `group_id=allura-system` project scope.
- No runtime adapter may override `.opencode/` Team RAM source of truth.
- Hook failures must print actionable remediation, not vague denial.
