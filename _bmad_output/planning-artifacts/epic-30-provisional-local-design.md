> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

# Epic 30 Provisional Local Design — My Work

**Status:** provisional local-test artifact; not design approval.  
**Scope:** `/dashboard` only, synthetic fixture only, no production service or data.

## Design decision

The local test slice is a calm, Obsidian-style reading workspace:

1. A high-visibility **Synthetic local test data** banner establishes that no live Brain, model, or production database is attached.
2. A left navigation area offers the current user's authorized private documents and approved-department documents. It has no organization or project browsing. Memory tabs are not implemented.
3. The center reading pane shows one selected synthetic database document. It does not claim a verified text relationship or backlink count.
4. A single optional comparison pane opens another co-visible department document, explicitly disclosing that no document relationship has been verified.
5. The collapsed **Ask allura** rail is honest: unavailable until no-retention/no-training evidence is verified. It generates no answer and sends no content.

## Accessibility and test protocol

The local UI uses semantic `nav`, `article`, headings, labels, buttons and token-based colors. The 2026-09-17 browser review reproduced a broken narrow comparison grid and loss of focus on close; responsive and keyboard acceptance are not established. Browser role simulations are preflight only. The human gate remains: five distinct people, uncoached task completion, at least four successes per task, no critical errors, and zero unauthorized disclosure. Exact candidate hashes, scope variances and a proposed task protocol are in `/mnt/projects/git/Allura-Ecosystem/.dev-readiness/epic30-review-20260917/design-candidate.md`; no design approval is recorded.

## Deliberate exclusions

No live search, production database connection, organization browsing, real AI, exports, messaging, writes, admin private-content access, graph canvas, autonomous actions, or user-controlled authorization selector are in this slice. The retained local demo does read an explicitly configured disposable synthetic PostgreSQL database through the restricted application role.
