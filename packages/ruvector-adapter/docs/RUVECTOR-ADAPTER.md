# RuVector Adapter

> [!NOTE]
> **AI-Assisted Documentation** — drafted with AI assistance; not yet fully reviewed.

## Purpose

Give Allura faster/smarter retrieval without surrendering governance. RuVector
owns vector storage/retrieval/ranking; Allura owns tenancy (`group_id` =
organization, `workspace_id` = sub-scope, ADR-001), HITL promotion, `SUPERSEDES`
versioning, and audit (governed canon ADR-003; AD-09 in the hosted Risks doc).

## Request flow

```
User/Agent question
  → Bumblebee checks permission + injects org group_id + workspace_id
  → Memory Kernel plans search
  → RuVector adapter accelerates ranking
  → results returned WITH provenance IDs
  → audit receipt written
```

## Invariants (enforced in `policy.ts`)

- `group_id` present and matches `^allura-[a-z0-9-]+$` (organization scope).
- `workspace_id`, `actor_id`, `request_id` present (audit context).
- Search requires `memory:read`; every hit carries provenance.
- Feedback emits a proposal — it never promotes or mutates approved knowledge.
- Snapshot/restore produce receipts (BACKUP-RESTORE, RK-07).

## Safe-reuse level

Currently **Level 1–2** (idea / dependency). No vendored RuVector source. If that
changes, retain MIT notices and update `THIRD_PARTY_NOTICES.md`.

## CI gates

`.github/workflows/allura-hosted-ci.yml` runs (report-only): license-check
(notices present), security-gate (scope/audit references present),
ruvector-adapter-tests (this package), and search-benchmark (vs pgvector baseline,
once `scripts/bench/search-benchmark.ts` exists).
