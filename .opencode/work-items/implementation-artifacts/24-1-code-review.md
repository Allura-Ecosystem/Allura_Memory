# Story 24.1 — Adversarial Code Review

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

**Reviewers:** Pike and Fowler
**Final Gate:** PASS
**Story Status:** In Review pending external acceptance evidence

## Initial Findings

1. **P1 — Incomplete benchmark inventory could pass.** The collector accepted any non-empty benchmark result set.
2. **P1 — An all-skipped live-database test report could pass.** Validation checked total tests but not executed/passed counts.
3. **P2 — Missing artifacts could be advertised.** Receipts recorded declared paths without proving the files existed.
4. **P1/P2 — PostgreSQL evidence identified the client binary rather than the tested server.**
5. **P1 — Capability evidence was marked validated before live execution.**
6. **P2 — Trust-boundary and positive lint-ratchet paths lacked regression tests.**

## Remediation

- Require the exact five unique benchmark IDs and reject malformed, missing, duplicate, unexpected, skipped, or errored results.
- Require consistent Vitest counters, at least one passed test, and zero failed tests.
- Record only artifacts that exist; make missing artifacts fail an otherwise successful lane while preserving original non-zero command exits.
- Capture `SHOW server_version` from the live PostgreSQL connection and select it only from SHA-matched live-database evidence, with the benchmark lane as fallback.
- Keep live persistence evidence `unverified` until a real run is indexed.
- Add collector trust-boundary tests and a temporary-repository test proving the changed-file lint ratchet blocks a new error.

## Verification

- Focused evidence and benchmark tests: 18 passed.
- Full unit suite: 1,626 passed; 171 skipped; 0 failed.
- Typecheck: passed.
- Production build: passed.
- Shell syntax, workflow YAML structure, schema aggregation, and whitespace checks: passed.
- Pike re-review: PASS; Allura Brain receipt `625c0297-2ef5-4851-9f91-f2b808bd758f`.
- Fowler re-review: PASS; Allura Brain receipt `8434242e-78cd-448d-a5c5-e0cc0278172d`.
- Implementation outcome: Allura Brain receipt `6b5b8a2b-e981-4394-be3e-edc5369d2b52` (episodic, pending curator review).

## Remaining Acceptance Evidence

- Run live PostgreSQL integration and the black-box benchmark on the laptop-authoritative runtime or GitHub CI.
- Index a green GitHub Actions run.
- Index a controlled-red temporary-branch run proving the required gate blocks failure.
- Keep Story 24.1 out of `done` until those receipts satisfy AC-4, AC-6, and AC-10 end to end.
