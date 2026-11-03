# Epic 11 Context: Governed branchable-memory experiments

## Goal / stories
11.1 specifies authorized snapshots, identity/state/quotas/expiry/threats;11.2 proves disposable fork/checkpoint/diff/tombstone/rollback/quarantine and identical-fixture comparison;11.3 submits selected diffs only as pending independently reviewed curator proposals and exercises bounded RAM/Durham workflows. Upstream/production adoption remains unapproved.

## Requirements and authority
PostgreSQL is the sole durable authority. No automatic promotion, cross-scope inheritance or unbounded retention. Only current authenticated explicit scope/action grants authorize an experiment; role names, installed modules and digests confer nothing. Canonical versions/evidence never change through branch commands. No Git branches/worktrees, real-data transfer, production access, deployment, deferred12–14 or new upstream. Local disposable DB tests are authorized; candidate lane's old no-DB limit is not a canonical integration restriction.

## Technical decisions / sources
Use parent-created epic11 candidate after byte/baseline verification and direct tests. Its memory-experiment-contract.ts contains immutable BaseSnapshot/ExperimentRecord parsing and engineering ceilings. MemoryExperimentEngine is process-local and owner-bound, with trusted adapters, finite retention and no canonical write/import/approve API. Not a hostile-code sandbox. Keep authority.ts/authentication.ts and transactional correction/decision services as sole authorization/semantic authorities. Stable historical snapshot identity and current-head submission checks are different gates. Ephemeral replay denial never replaces canonical exact receipt replay.

Sources: planning-artifacts/epics.md:154–162; current architecture immutable/scoped/capability ceilings; contracts/authority-v1.md; verified candidate integration/branchable-memory-v1.md and integration-requirements.md. Candidate base8bc33180b2afb3a122e7ff72482eab3273418f39; prior runtime0eb9607aa2a56bec08eee5e0704bd89f9e813ecc, local10 acceptance/retro d0156ec53267a76225618f5174baf76d74428c2c. Candidate READY is not acceptance. Brain unavailable; local evidence only.

## Dependencies
Named parallel candidates only; this worker alone writes beta. Epic10 local retro complete.11.1 contract acceptance precedes11.2 engine acceptance, then11.3 restricted SQL/pending proposal/curator/browser tests. Preserve6/7/9 external release gates. No developer reviewers; independent human product approval remains mandatory.
