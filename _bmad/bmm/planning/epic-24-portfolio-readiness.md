# Epic 24: Agentic AI Framework and Harness Portfolio Readiness

**Date:** 2026-08-15
**Status:** Ready for development
**Owner:** Sabir
**group_id:** allura-system

## Goal

Turn Allura Memory into a defensible principal-engineer portfolio case study by proving that it is a reusable, governed memory and deterministic execution harness for enterprise AI agents.

The finished portfolio must demonstrate working controls and reproducible evidence, not only architecture claims. A reviewer must be able to install the project, run an agent scenario, observe policy enforcement, attempt an unauthorized operation, replay the run, execute evaluations, and inspect an audit receipt.

## Product Position

> Allura Memory is an MCP-native governed memory and deterministic execution harness for enterprise AI agents. It separates raw episodic evidence from human-approved canonical knowledge, enforces policy at runtime boundaries, and produces replayable evaluation evidence.

## Why This Epic Changed

The previous plan prioritized a benchmark dashboard, public deployment, and portfolio copy. Those are useful presentation layers, but they cannot compensate for unverified identity, tenant isolation, governance atomicity, reproducibility, or CI evidence. This revision puts the trust boundary and harness proof first. Presentation is the final gate.

## Scope

### In scope

- A reproducible CI baseline and machine-readable evidence manifest.
- Authenticated principals with server-derived tenant, user, and role authority.
- Database-enforced tenant isolation and an immutable event ledger.
- Atomic, concurrency-safe human-governed promotion.
- A declarative scenario harness with deterministic replay and fault injection.
- Offline evaluations, adversarial cases, performance thresholds, and regression gates.
- A coherent SDK/CLI path and a ten-minute quickstart.
- Canonical documentation synchronized with the implemented PostgreSQL/RuVector architecture.
- Three reference integrations and a concise portfolio demonstration.

### Out of scope

- Claims of bank production approval, certification, penetration testing, SLA, or real enterprise adoption.
- A general-purpose autonomous-agent runtime or model-hosting platform.
- A public multi-tenant SaaS launch.
- A dashboard as a release blocker. A dashboard may be added after the evidence API and artifact format are stable.
- Fabricated benchmark results, usage metrics, customer outcomes, or compliance status.

## Delivery Gates

| Gate | Stories | Question answered | Exit evidence |
|---|---|---|---|
| A — Truthful baseline | 24.1 | Can a reviewer reproduce the current state? | Green CI lanes, evidence manifest, no unverified README claims |
| B — Trust boundary | 24.2–24.4 | Does authority come from trusted identity and remain enforced through persistence? | Auth adversarial suite, RLS isolation matrix, immutable-ledger proof, atomic promotion concurrency test |
| C — Framework and harness | 24.5–24.7 | Can another team define, run, replay, evaluate, and integrate an agent workflow? | Scenario schema, deterministic replay receipt, evaluation report, SDK/CLI quickstart |
| D — Enterprise portfolio | 24.8–24.9 | Can a principal-engineer reviewer understand the standards, tradeoffs, evidence, and limitations? | Canonical doc guard, threat model, reference integrations, recorded demo script, evidence-indexed README |

No later gate may be represented as complete until all earlier gates have passed.

## Stories

| Story | Title | Priority | Depends on | Principal-engineer signal |
|---|---|---|---|---|
| 24.1 | CI and Evidence Baseline | P0 | None | Measurable platform quality and honest claims |
| 24.2 | Authenticated Principal Context | P0 | 24.1 | Runtime policy hooks and regulated identity controls |
| 24.3 | Database-Enforced Tenant Isolation and Immutable Ledger | P0 | 24.2 | Defense in depth and audit integrity |
| 24.4 | Atomic Human-Governed Promotion | P0 | 24.3 | Safe memory lifecycle and concurrency correctness |
| 24.5 | Deterministic Scenario Harness | P0 | 24.2; integrates 24.4 fixtures | Reusable orchestration, simulation, replay, fault injection |
| 24.6 | Evaluation and Regression Gates | P0 | 24.4, 24.5 | Offline evaluation, benchmarks, continuous measurement |
| 24.7 | SDK, CLI, and Ten-Minute Developer Path | P1 | 24.5, 24.6 | Platform adoption and developer ergonomics |
| 24.8 | Enterprise Documentation Truth Pack | P0 | 24.2–24.7 | Standards, threat modeling, audit and risk communication |
| 24.9 | Reference Integrations and Portfolio Demonstration | P1 | 24.8 | Reuse, architectural leadership, adoption evidence |

## Cross-Epic Acceptance Criteria

- [ ] A fresh clone follows documented commands without undocumented local state.
- [ ] CI publishes a versioned evidence manifest containing commit SHA, tool versions, test results, benchmark results, and scenario results.
- [ ] Production HTTP requests without a verified principal fail closed.
- [ ] Tenant, user, and role authority are derived from the verified principal; request parameters cannot elevate them.
- [ ] Database policy blocks cross-tenant reads and writes even if application filtering is omitted.
- [ ] The event ledger rejects update and delete operations at the database boundary.
- [ ] Promotion, proposal transition, version linkage, and audit receipt commit or roll back together.
- [ ] The same scenario can be replayed from its recorded definition revision with identical control-flow and policy outcomes.
- [ ] Security, retrieval, governance, replay, and performance regressions fail CI at documented thresholds.
- [ ] A new developer can run a reference scenario, replay it, and inspect its evidence within the documented ten-minute path.
- [ ] Active canonical documentation describes PostgreSQL/RuVector only and passes a backend-residue documentation guard.
- [ ] The portfolio clearly distinguishes implemented, measured, planned, and explicitly unsupported capabilities.

## Evidence Contract

Every completed story must produce:

1. The exact command used for validation.
2. A machine-readable artifact where applicable.
3. Commit SHA and environment/tool versions.
4. Pass/fail thresholds declared before the run.
5. A link from `docs/portfolio/evidence-index.md`.
6. A completed Dev Agent Record and File List in the story.

Screenshots, prose claims, and manually edited result tables are supporting material, not acceptance evidence.

## Definition of Portfolio-Ready

The epic is complete when a reviewer can perform this sequence from documented commands:

1. Start the supported local stack.
2. Authenticate as a scoped principal.
3. Execute a multi-step reference agent scenario.
4. Observe episodic evidence and a human-governed promotion.
5. Attempt and observe rejection of a forged cross-tenant or elevated-role request.
6. Inject a deterministic tool failure and resume from a checkpoint.
7. Replay the recorded run and compare it with the original receipt.
8. Run the evaluation suite against a committed baseline.
9. Inspect the audit and architecture evidence linked from the portfolio README.

## Risks and Guardrails

| Risk | Guardrail |
|---|---|
| Existing tests validate application checks but not database enforcement | Require live-database adversarial tests for RLS and ledger immutability |
| CI passes while evidence is stale | Generate artifacts during the run and bind them to commit SHA |
| Replay is described as deterministic without controlling nondeterminism | Record definition revision, tool fixtures, clock, seed, model/config fingerprint, and side-effect keys |
| Documentation overstates compliance or adoption | Add claim classification and unsupported-capabilities sections |
| Scope drifts toward dashboard work | Dashboard remains optional until Gates A–C pass |
| One oversized story becomes impossible to review | Each story owns one architectural boundary and has explicit out-of-scope items |

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-08-03 | Original presentation-oriented epic created | Gilliam |
| 2026-08-15 | Reframed around agent-framework trust, deterministic harness, evaluation evidence, and principal-engineer portfolio requirements | Codex using BMAD conventions |
