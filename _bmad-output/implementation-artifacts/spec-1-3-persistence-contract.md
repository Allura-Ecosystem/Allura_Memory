---
title: '1.3 Persistence and security contract'
type: feature
created: '2026-10-26'
status: done
route: dispatch
baseline_commit: 9e3df50891f99b4ed9e0f6e33f9082a68f2ef9ce
context: [guidelines/ALLURA-BMAD.md]
---

<frozen-after-approval>
## Intent
Define concrete fresh authority/event storage and restricted PostgreSQL isolation before Epic 2. User delegates local schema design and disposable synthetic test resources. Product human promotion and immutable history remain mandatory.

## Boundaries & Constraints
Never migrate production, read credentials, restore purged DDL or decide optional adoption. Explicit current authority and same-scope keys are required. No independent development reviewer.
</frozen-after-approval>

## Code Map
- Story 1.3: six contract acceptance clauses.
- `planning-artifacts/contracts/authority-v1.md`: accepted local identity/grant contract.
- `planning-artifacts/contracts/persistence-v1.md`: resulting fields/keys/trust model and disposable test acceptance.

## Tasks & Acceptance
- [x] Specify concrete Epic 2 authority/event fields and constraints.
- [x] Distinguish later immutable logical contracts from deferred physical migrations.
- [x] Define RLS, non-owner role, transaction locks, pool reuse and forward-only migration/recovery.
- [x] Define authorized isolated fixture target and security-negative matrix.
- Given Story 1.2 scope, when storage derives authority, then it checks explicit current grants rather than org role.
- Given a shared database login, when reporting isolation, then disclose that transaction settings are service assertions, not cryptographic database identity.

## Implementation Notes
Direct self-check found and documented the GUC trust boundary to avoid claiming arbitrary SQL cannot impersonate principals. Later replay/vector/correction/projection migrations remain gated in their owning stories. All six acceptance dispositions are in persistence-v1.md. No runtime migration or independent review occurred in this story.

## Verification
Inspected schema/authority cross-contract against Story 1.3 clauses and PRD FR-A2/B4/NFR-1/2/4. `git diff --check` passed. Documentation acceptance only. Runtime non-owner DB tests remain Epic 2.2 acceptance.
