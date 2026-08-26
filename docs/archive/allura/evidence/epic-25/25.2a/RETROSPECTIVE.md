# Story 25.2a Retrospective — Workspace Scope and Evidence Lifecycle Foundation

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with AI assistance and checked against the scoped source, tests, and disposable-PostgreSQL evidence.

**Updated:** 2026-08-25
**Review outcome:** Knuth + Pike + Fowler **REQUEST CHANGES**; remediation is awaiting re-review.
**Story state:** **Changes Requested** — not Done; the review verdict is unchanged.

## What the remediation now implements

- A numbered Migration 40 forward path for databases where the originally shipped Migration 39 already ran; incomplete legacy receipts are preserved losslessly in a no-app-grant archive rather than remaining visible in the current table.
- Restrictive workspace policies that compose with, rather than rewrite, heterogeneous earlier policies.
- Canonical `approveProposal()` now owns graph memory, version-CAS proposal transition, promotion idempotency, workspace event/outbox, and governance receipt in one transaction; HTTP and CLI approval adapters delegate.
- Server-derived receipt scope, actor/role, proposal version, exact scoped source event, database time, canonical full evidence-set identity, and promotion outbox truth.
- Source-driven semantic projections that follow `canonical_proposals.trace_ref` to the linked event and persist redacted Markdown as `pending_embedding`; only an injected/real vector result persists its exact model/version and changes the row to `ready`.
- Migration 40 ownership for retained knowledge, promotion outbox, and promotion idempotency: new app writes are workspace-scoped and old NULL-workspace rows are explicitly `legacy_quarantined`.

## Current evidence truth

- RED: **11 failures observed and reconciled** — 6 focused receipt/projection/inventory regressions, 2 operative-route wiring regressions, 1 first-live-upgrade `pgcrypto` failure, and 2 live receipt-fixture failures missing the full evidence-set hash. Later TDD also exposed and fixed false-ready embedding provenance and real app-role promotion-outbox privilege/RLS wiring; those are remediation cycles, not retroactively substituted for the frozen eleven-review count.
- GREEN (2026-08-25 remediation rerun): focused retrieval/CLI/receipt/projection/route/Team-RAM coverage passes **41/41** across 8 collected files, the authoritative seven-file disposable live runner passes **43/43** (workspace authority **21/21**), and Story 24.4 receipt/outbox/idempotency compatibility passes **10/10**.
- Disposable PostgreSQL proves failure-atomic refusal with unchanged receipt schema/immutable trigger/version, fresh install through 40, and 40 apply → recovery rollback → reapply.
- This evidence does **not** constitute independent approval and does not change the story/review status.

## Lessons

1. Editing an already-numbered migration is not an upgrade strategy; deployed schemas require a later forward migration.
2. Idempotency must return the persisted receipt and include the complete relationally proven evidence set, not an opaque caller assertion.
3. A redaction policy label is not redaction, and a configured model name is not a produced embedding; ready requires a real vector with exact producer model/version.
4. Rollback evidence must cover schema and policy recovery and must refuse destructive rollback whenever proposal versions or any other new state cannot be reconstructed—not merely when receipts exist.
5. Retrospective truth must follow the latest review verdict rather than preserving obsolete green counts or approval claims.

## Remaining boundary

Independent Knuth/Pike/Fowler re-review is still required. Do not mark Story 25.2a Done or alter the review verdict in this remediation branch.
