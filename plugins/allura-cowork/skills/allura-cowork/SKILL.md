---
name: allura-cowork
description: Use when the user says cowork, co-work, Claude and Codex, Codex and Claude, pair Claude with Codex, handoff between Claude/Codex, or asks how to make multiple AI runtimes follow Allura rules. Coordinates both runtimes through Allura Brain, runtime honesty, validation evidence, and governed handoff receipts.
---

# Allura Cowork

Use this skill to coordinate Claude Code and Codex without pretending they are
the same runtime.

## Core Contract

```text
Intent -> Project context -> Allura Brain -> Route -> Work -> Validate -> Receipt -> Handoff or close
```

Allura Brain is the shared memory layer. Claude and Codex are execution
surfaces. Project-local systems, such as Team RAM or Durham, apply only when
the repo declares them or Ronin explicitly routes through them.

## Required Cowork Header

Before planning or handoff, state:

```text
Cowork active.
Runtime: <Claude|Codex|OpenCode|OpenClaw|other>
Allura: <memory searched/not available + query or reason>
Project overlay: <Team RAM|Durham|TALON|IRIS|none|unknown>
Route: <who owns implementation + who reviews>
Validation: <commands, checks, screenshots, or evidence path>
Handoff target: <Claude|Codex|none>
```

## Runtime Honesty

- Say "Claude perspective" or "Codex perspective" only as a lens unless that
  runtime actually ran.
- Never claim a subagent, tool, MCP call, test, file edit, or handoff happened
  unless it actually happened.
- If a handoff is only written instructions, label it `Handoff packet`.
- If validation did not run, say exactly what is unvalidated.

## Allura Brain Rules

- Search before planning when prior work, people, dates, decisions, preferences,
  todos, or Allura governance are involved.
- Default scope: `group_id=allura-system`.
- Use the active actor as `user_id`, for example `troy-curator`, `team-ram`,
  or `codex-cowork`.
- Write after substantive work with files changed, validation, outcome, and
  remaining risk.
- Raw episodic memory is evidence. It is not canonical promotion.

## Approval Boundaries

Explicit approval is required before:

- runtime or database mutation
- MCP config mutation
- cron mutation
- live hook installation or enforcement
- RuVix runtime enforcement changes
- semantic memory promotion
- Notion sync
- Done/Approved status moves
- public or external sends

## Handoff Packet

Use `schemas/handoff.schema.json` for machine-shaped packets. For chat, use:

```markdown
## Allura Cowork Handoff

From: <runtime/persona>
To: <runtime/persona>
Goal: <one sentence>
Context searched: <queries + memory ids or unavailable reason>
Project overlay: <Team RAM|Durham|TALON|IRIS|none|unknown>
Files touched/read: <paths>
Decisions: <bullets>
Open risks: <bullets>
Validation run: <commands/results>
Next action: <single concrete step>
Memory status: <written/not written + id if available>
Approval needed: <yes/no + why>
```

## Routing Defaults

- Codex: repository edits, validation loops, code review, practical
  implementation, commits.
- Claude: synthesis, long-form docs, UX/design review, plugin packaging,
  critique, prose-heavy planning.
- Team RAM: project-local implementation when the repo declares RAM or Ronin
  routes there.
- Durham: brand, copy, product feel, design canon, and final brand-sensitive
  approval.
- TALON: deploy, runtime, API readiness, test gates, runbooks, and guardrails.

## User-Facing Promise

Say: "This plugin reduces hallucinated claims by requiring memory search,
evidence, validation, and receipts before work is called done."

Do not say: "This plugin prevents hallucinations."
