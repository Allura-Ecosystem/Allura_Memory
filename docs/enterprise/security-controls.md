# Allura Security Control Matrix

## Control Catalog

| ID | Control | Enforcement Location | Test/Evidence | Owner | Failure Mode | Residual Risk | Status |
|----|---------|---------------------|---------------|-------|--------------|---------------|--------|
| SC-01 | Tenant isolation via group_id | PostgreSQL RLS + CHECK constraints | Story 24.3 E2E tests | Troy | RLS misconfiguration | Low | Implemented |
| SC-02 | Append-only audit trail | events table RLS denies UPDATE/DELETE | Story 24.3 immutability tests | Troy | Break-glass override | Low | Implemented |
| SC-03 | Principal identity verification | HMAC token auth, PrincipalContext | Story 24.2 auth tests | Troy | Token compromise | Medium | Implemented |
| SC-04 | HITL promotion gate | canonical_proposals, POL-004 | Story 24.4 atomic tests | Troy | Curator bypass | Low | Implemented |
| SC-05 | Atomic approval transaction | approveProposal service, single TX | Story 24.4 rollback tests | Troy | TX isolation failure | Low | Implemented |
| SC-06 | Idempotency on promotion | promotion_idempotency table | Story 24.4 replay tests | Troy | Key collision | Low | Implemented |
| SC-07 | Budget circuit breakers | canonical-tools.ts | Budget tests | Troy | Budget corruption | Medium | Implemented |
| SC-08 | Deterministic replay | Scenario harness, receipt comparison | Story 24.5 tests | Troy | Hash collision | Negligible | Implemented |
| SC-09 | Evaluation regression gates | Eval runner, thresholds | Story 24.6 tests | Troy | Threshold bypass | Low | Implemented |
| SC-10 | Branch protection | GitHub required status checks | Story 24.10 evidence | Troy | Admin override | Low | Implemented |