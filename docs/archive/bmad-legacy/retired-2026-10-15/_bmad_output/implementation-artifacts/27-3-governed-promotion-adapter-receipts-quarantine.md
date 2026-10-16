# Story 27.3 — Governed Promotion Adapter, Receipts, and Quarantine

**Status:** implemented — unit-verified RED→GREEN, not committed; evidence note at `docs/archive/allura/evidence/epic-27/story-27.3-governed-promotion-adapter.md`
**Owner:** Woz + Knuth + Pike
**Depends on:** 27.2
**Blocks:** 27.5, 27.6

## Outcome

Convert a selected branch diff into an Allura curator proposal while preserving additions,
overrides, tombstones, base revision, evidence references, and actor; accepted promotions
receive an immutable server-issued receipt; canonical memory is never written directly and
no browser-synthesized success is possible; rejected or poisoned branches remain quarantined
and rollback stays reproducible.

## User Story

As a curator, I need branch diffs to arrive as reviewable proposals — never as direct
canonical mutations — so that promotion stays human-governed and every accepted promotion
carries an immutable receipt.

## Acceptance Criteria

- [x] A selected branch diff is convertible into an Allura curator proposal
      (`promotion_proposals` + `approval_transitions`), preserving additions, overrides,
      tombstones, base revision, evidence references, and actor. — `createPromotionProposal`
      in `src/lib/branch/promotion-adapter.ts`; unit test asserts proposal + transition
      rows carry every field (evidence note §AC-1).
- [x] Proven: no direct canonical mutation (`allura_memories` / semantic write paths) on the
      promotion path; promotion means creating a curator proposal, never writing semantic
      memory directly. — import-scan + write-surface tests (evidence note §AC-2).
- [x] No self-approval and no browser-synthesized success: an approved diff becomes a
      proposal only through the curator flow. — proposal starts `pending`; adapter source
      contains no `'approved'`/`'rejected'` literals (evidence note §AC-3).
- [x] Every accepted promotion receives an immutable server-issued receipt (server-side
      receipt, trace ID, or equivalent per invariant 7). — `promotion_receipts` (migration
      53, append-only trigger) with deterministic `trace_id`; `issuePromotionReceipt`
      (evidence note §AC-4).
- [x] Rejected or poisoned branches remain quarantined and rollback remains reproducible. —
      `branch_registry` status enum incl. `quarantined`/`rejected`/`rolled_back` with
      preserved `diff_snapshot`; `buildRollbackPlan` ordered replay steps (evidence note §AC-5).
- [x] Rewards/trace cites of promoted work cite governed tests, reviews, or trace IDs —
      self-reported success is insufficient. — every proposal carries `evidence_refs` and a
      deterministic trace id; the receipt binds the accepted diff to that trace id
      (evidence note §AC-6).

## Dependencies

- 27.2 (branch mechanics to diff from).
- 27.1 (authorized base contract; diff validity rests on base authorization).

## Rollback

The adapter writes only proposals and receipts — no canonical mutation — so rollback is
reverting the adapter code and the receipt/proposal rows, and the branch quarantine stands.
