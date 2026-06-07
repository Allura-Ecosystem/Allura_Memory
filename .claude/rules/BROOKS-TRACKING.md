# Brooks Tracking

This file defines the tracking intent for Brooks as the architecture lead.

## Purpose

Brooks work should be traceable across sessions and runtimes when tracking is enabled.

The point is simple:

- one architect role
- clear decision trail
- easy review of important architecture choices

## What Should Be Tracked

- architecture decisions
- interface decisions
- major tech stack calls
- blockers that affect system shape
- follow-up actions from architecture review

## Tracking Rules

1. Track the role `brooks` consistently.
2. Keep runtime metadata if the runtime matters.
3. Keep session identifiers if they help trace continuity.
4. Keep group or project scope explicit when memory or event storage requires it.
5. Do not hardcode one project namespace into generic harness policy unless that project is the active scope.

## Minimum Event Shape

Suggested fields:

- `agent_id`
- `event_type`
- `status`
- `metadata`
- `created_at`
- `runtime` when relevant
- `session_id` when relevant
- `group_id` or project scope when required by storage rules

## Why This Matters

Architecture without a decision trail turns into folklore.

Tracking helps the harness answer:

- what was decided
- why it was decided
- what runtime or session produced it
- what needs follow-up

## Scope Rule

This file is a harness-level tracking guide.

Project-specific tracking schemas, namespaces, or database rules may extend it, but should not silently replace the generic rule.
