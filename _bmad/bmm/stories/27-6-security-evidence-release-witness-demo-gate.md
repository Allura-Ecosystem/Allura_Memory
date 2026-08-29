# Story 27.6 — Security, Evidence, Release-Witness, and Demo Gate

**Status:** draft/planned
**Owner:** Hightower + Pike + Fowler + Brooks
**Depends on:** 27.3, 27.4, 27.5
**Blocks:** Epic closure (exit gate)

## Outcome

Close the epic: tenant/workspace isolation, poisoning, replay, tamper, quota, expiry, and
rollback tests pass; one machine-readable release manifest (revision, tests, benchmark,
SBOM/license evidence, browser evidence when applicable, review verdict, Allura receipt) is
produced; an independent Pike/Fowler/Knuth/Hightower review approves the frozen green diff;
and the BMad retrospective records adopt/adapt/reject decisions and remaining hazards.

## User Story

As a governed memory operator, I need the epic to close only on verified security,
evidence, and review gates so that branchable memory is provably safe before any production
adoption.

## Acceptance Criteria

- [x] Tenant/workspace isolation tests pass, including cross-tenant inheritance failing
      closed (live-database evidence, per the epic exit gate).
- [x] Poisoning, replay, tamper, quota, expiry, and rollback tests pass.
- [x] One machine-readable release manifest is produced containing revision, tests,
      benchmark, SBOM/license evidence, browser evidence when applicable, review verdict,
      and the Allura receipt.
- [ ] Independent Pike/Fowler/Knuth/Hightower review approves the frozen green diff.
- [ ] BMad retrospective records adopt/adapt/reject decisions and remaining hazards.
- [x] Production adoption remains gated on license, provenance, security, and benchmark
      gates passing (out-of-scope constraint honored).
- [x] Canonical memory cannot be changed through a branch without curator approval
      (final invariant confirmation).

## Dependencies

- 27.3, 27.4, 27.5 (all feature/evidence threads converge here).

## Rollback

Gate story: revert the enforcement checks and the release manifest; no runtime behavior is
shipped by this story itself beyond gates.
