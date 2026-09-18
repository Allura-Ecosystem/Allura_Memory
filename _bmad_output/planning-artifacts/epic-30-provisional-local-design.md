> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Epic 30 Provisional Local Design — My Work

**Status:** provisional local-test design now represented by candidate `e65598e9`; still awaiting explicit design/variance approval. See the [current approval packet](./epic-30-design-approval-packet.md) and [current readiness](./implementation-readiness-epic-30.md).
**Scope:** `/dashboard` only, synthetic fixture only, no production service or data.

## Design decision

The local test slice is a calm, Obsidian-style reading workspace:

1. A high-visibility **Synthetic local test data** banner establishes that no live Brain, model, or production database is attached.
2. A compact tool rail and left navigation area offer the current user's authorized private documents and approved-department documents. It has no organization or project browsing. Tab-like chrome is present, but a complete interactive memory-tab system is not implemented.
3. The center reading pane shows one selected synthetic database document. It does not claim a verified text relationship or backlink count.
4. A co-visible context pane is explicitly labelled as proximity-only. A single optional comparison pane opens another co-visible department document, explicitly disclosing that no document relationship has been verified.
5. The collapsed **Ask allura** rail is honest: unavailable until no-retention/no-training evidence is verified. It generates no answer and sends no content.

## Accessibility and test protocol

The local UI uses semantic `nav`, `article`, headings, labels, buttons and token-based colors. The earlier narrow-grid and close-focus defects were repaired and are covered by focused component tests. Current 1440 px and 320 px synthetic screenshots are hash-bound in the [approval packet](./epic-30-design-approval-packet.md). Real screen-reader, 200% browser zoom, role-journey, and live restricted-database evidence remain open. Browser simulations are preflight only. The human gate remains: five distinct people, uncoached task completion, at least four successes per task, no critical errors, and zero unauthorized disclosure. No design approval is recorded.

## Deliberate exclusions

No live search, production database connection, organization browsing, real AI, exports, messaging, writes, admin private-content access, graph canvas, autonomous actions, or user-controlled authorization selector are in this slice. The integrated local demo requires an explicitly configured disposable synthetic PostgreSQL database through the restricted application role. Its live availability is not asserted because credentials were intentionally not supplied.
