---
name: allura-first-use-validation
description: Evaluate Allura first-use claims against setup, exact-record retrieval, review-state and actual human-study evidence. Use when verifying onboarding or auditing a claimed first-memory success; ordinary copy editing alone does not require this workflow.
---

# Allura first-use validation

Produce an evidence verdict for the requested journey. Read the applicable project scope and acceptance criteria; do not expand a README task into infrastructure deployment or a rebrand. This is an agent validation workflow, not extra work the product user must perform.

## Separate the claims

Record each requested claim as verified, failed, untested or blocked, with its source revision and direct evidence. For an unreported metadata field, use unknown rather than inventing a value:

- Documentation correctness: commands/types match current source and external tool documentation; a stale backend recipe is not usable setup.
- Provisioned-endpoint evaluation versus fresh installation: name which environment was actually exercised.
- Capture, exact-ID read and search: these are separate operations. Search must return the exact saved ID and content; similar or historical hits cannot close the task. A later-session claim also requires observed separate initialized client sessions.
- Review: report source/provenance and current review state when available. The save-time pending flag is a separate observation. Missing state stays unknown; a score, graph storage label, or agent approval cannot establish a human decision.
- Human comprehension and task success: only actual consented participant observations count. Agent reviews and synthetic fixtures have their own evidence category.
- Publication: local files and passing checks do not establish what an unauthenticated reader can access publicly.

A current health response establishes only its checked subsystems. Inspect failure and degraded metadata rather than deriving retrieval quality from coverage or process liveness.

## Execution

Use the configured authorized connection and supplied principal. In this repo use `allura-system` unless the authenticated project explicitly declares another authorized scope. A host name or valid group string grants no tenant access. Do not seek credentials in a new source without explicit authority, change scope after denial, use direct database access, or approve/promote the example to force success.

For an authorized HTTP evaluation, the maintained runner is `scripts/first-use-memory.ts` at repository root. Read its current guide before executing; it appends a record and needs an existing endpoint/token/group plus explicit write acknowledgment. Do not retry an uncertain save. Retain its run marker, failure stage and any known saved ID for reconciliation. Never print tokens, session credentials, raw backend errors or unrelated retrieved content.

If only configured connector tools are available, evaluate their actual save/get/search behavior and label the scope as connector evidence. Do not infer separate HTTP sessions or clean installation. Prepare safe local corrections while only dependent live actions wait for missing access.

For participant studies, use the project's current protocol and record actual counts, help and interventions. Do not complete a study row with a plan, agent simulation or participant availability. The present Reddit targets are project-specific proposals; do not universalize the five-person count or time budget to unrelated projects.

## Report

Return claim → evidence → verdict → remaining dependency. Include commands/results and artifact links, actual session/environment scope, source/review-state limitations, and which changes were made. A partial result stays partial. Reuse a fresh scoped Brain receipt and log one meaningful outcome under current governance; never infer promotion from a storage response.

For representative failure cases and current repository paths, read [evaluation cases](references/evaluation-cases.md) only when evaluating or changing this skill.
