> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.9 — Read-Only Ask Allura

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Woz / Brooks  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R09  
**Dependencies:** 30.6, 30.7, 30.8

## User Story
As a reader, I want cited answers within my authority so that I can understand permitted knowledge without granting an agent new powers.

## Acceptance Criteria
- Collapsed read-only rail gives grounded answers, openable authorized citations, scope/freshness, uncertainty and degraded states.
- No tools, mutation, protected-action drafting/submission, autonomous actions or authority widening; copyable ordinary text only.
- Context/citations/caches/derivatives are reauthorized after revocation and never reveal hidden evidence.
- No external model retention or training on governed content; verify the chosen provider contract before sending protected content. Do not change model configuration autonomously.

## Required Evidence / Definition of Done
Prompt-injection/confused-deputy/retrieval/citation/revocation tests, provider evidence, design/accessibility proof, review and epic CI/publication/receipt gates. Synthetic content only in local tests.

## Current Preparation State

2026-09-25: commits `1ce422c7` and `42c4f78a` add an unactivated production Ask coordinator over the receipt-gated production reader and remove request-local maps under the Epic no-process-cache rule. The reader returns a server-derived tenant/workspace/principal/session/role/policy-epoch authority tuple and an acknowledged receipt witness; the post-provider authorization read must continue that receipt chain and reproduce the exact authorized source snapshot before any answer is returned. Duplicate/malformed IDs, scope confusion, source mutation/removal, oversized aggregate context, invalid questions, provider failures and fabricated citations fail closed. Excerpts, titles and total provider context are bounded, and provider policy must still declare zero retention and zero training. Independent review found no remaining BLOCK/HIGH/MEDIUM issue. The exact no-cache Epic lane passes 375 tests with 3 intentional skips across 38 files; the full unit lane passes 2,937 tests with 165 skips across 198 files. No route, UI, concrete provider, model configuration or external transmission was added. Provider-contract approval, prompt-injection controls for the selected provider, cited-answer UI, accessibility/live proof and human acceptance remain open, so the story remains partial and backlog.

2026-09-25: commit `38f58e8a` makes provider runtime failure content-free. The provider-neutral boundary still rejects noncompliant retention/training policy before invocation, but a provider exception containing protected context, credentials or backend detail now returns only `null`; no answer or citation survives. Five focused adversarial tests and the 364-test exact hermetic lane pass. No provider, route, UI, model configuration or external transmission was added. Provider contract approval, production wiring, cited-answer UI, accessibility/live proof and human review remain open.

2026-09-25: commit `43601110` adds a provider-neutral grounded answer boundary over the receipt-gated Ask context. It accepts only bounded control-free questions and non-empty authorized context; refuses any provider not declaring both zero retention and zero training; sends only the authorized source packet; rejects empty/oversized answers, fabricated citations, duplicate citations and citation overflow; and returns only ordinary answer text plus canonical `{documentId,title}` citations. It adds no route, UI, provider implementation, persistence, model configuration or external transmission. Four adversarial tests are pinned in the exact Epic 30 inventory. The exact lane passes typecheck with 343 tests and 3 intentional skips across 36 files; the full unit lane passes 2,905 tests with 165 skips across 196 files. Provider-specific contract evidence, production authority/provider wiring, UI/accessibility, live proof and human review remain open, so the story remains partial and backlog.

2026-09-25: a provider-neutral synthetic Ask-context resolver now builds an all-or-nothing packet only from the shared receipt-gated authorized document reader. It accepts bounded canonical source IDs, deduplicates in first-seen order, requires every source to remain authorized, and returns only `{documentId,title,excerpt}` with deterministic Unicode-safe excerpts capped at 512 UTF-16 units. Missing and unauthorized sources are identical `null` results; successive calls re-read for revocation; receipt failures propagate without substitution; prompt-like source text remains inert data. A source-inventory guard verifies no production API route imports the resolver. No model, provider, route, cache, persistence, answer, citation UI or governed content transmission was added, and the existing UI continues to state that Ask is unavailable. The exact Epic 30 gate passes typecheck with 288 tests and 3 intentional skips across 30 files; the full unit lane passes 2,854 tests with 165 skips across 191 files. Provider no-retention/no-training evidence, approved production policy, grounded answer/citation behavior, live proof, human review and Story 30.9 acceptance remain open.

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
Not implemented; no provider or retention proof claimed.
