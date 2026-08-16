# Story 24.9 — Reference Integrations and Portfolio Demonstration

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** ready-for-dev
**Priority:** P1-High
**Complexity:** Large
**Owner:** unassigned
**Dependencies:** Story 24.8 and all earlier Epic 24 gates

## User Story

As a hiring reviewer or adopting engineering team, I need concise reference integrations and an evidence-backed demonstration, so that I can see how Allura applies across agent workflows and understand the engineering decisions, limitations, and measured outcomes.

## Context

A portfolio must prove reuse without pretending that sample integrations are production adoption. The examples should use the supported SDK/CLI and scenario contracts, synthetic data, and the same evidence gates as the core platform.

## Reference Integrations

1. **Engineering review agent** — retrieves approved standards, records tool evidence, and requires a quality gate before completion.
2. **Controlled research agent** — uses multiple mocked tools, blocks untrusted instructions from becoming authority, and demonstrates fault injection/replay.
3. **Regulated document-quality workflow** — uses synthetic documents, tenant isolation, human approval, canonical promotion, audit export, and final human authority.

These are reference implementations, not customer deployments or claims of bank approval.

## Scope

- Build three small integrations using only supported public surfaces.
- Measure onboarding steps, commands, configuration, failures, and evaluation results.
- Create an evidence-indexed README, architecture case study, demo script, and interview talking points.
- Provide a safe local demonstration path.

## Out of Scope

- Real customer or bank data.
- Production integrations with proprietary enterprise systems.
- Claims of organizational adoption, productivity improvement, or compliance without evidence.
- A visual dashboard unless separately approved after the core portfolio is complete.

## Acceptance Criteria

- [ ] AC-1: Each reference integration lives under `examples/`, declares its scenario, principal/tenant fixture, tools, policies, expected evidence, and cleanup behavior.
- [ ] AC-2: Each integration runs from a clean local stack with synthetic data and no paid provider credentials in simulation mode.
- [ ] AC-3: Each integration has at least one success case, one policy/security failure case, and one recovery/replay case.
- [ ] AC-4: Each integration passes the common evaluation result schema and publishes evidence linked from the evidence index.
- [ ] AC-5: The regulated workflow explicitly preserves human final authority and does not present generated output as an autonomous decision.
- [ ] AC-6: Integration effort is reported as observed setup steps, commands, configuration, and elapsed time from a clean environment; no fictional team-adoption metrics are used.
- [ ] AC-7: `README.md` states the product position, architecture, verified capabilities, quickstart, evidence, limitations, and reference integrations in a scannable format.
- [ ] AC-8: `docs/portfolio/principal-engineer-case-study.md` explains problem framing, standards, rejected alternatives, tradeoffs, failure modes, migration strategy, developer experience, and measured evidence.
- [ ] AC-9: `docs/portfolio/demo-script.md` demonstrates run, policy denial, human-governed promotion, injected failure, checkpoint resume, deterministic replay, evaluation comparison, and audit inspection using exact commands.
- [ ] AC-10: Every numerical or maturity claim in the README and case study resolves to a current evidence artifact; unsupported capabilities are stated explicitly.

## Implementation Files

- `examples/engineering-review-agent/`
- `examples/controlled-research-agent/`
- `examples/regulated-document-quality/`
- `README.md`
- `docs/portfolio/principal-engineer-case-study.md`
- `docs/portfolio/demo-script.md`
- `docs/portfolio/evidence-index.md`
- `docs/portfolio/interview-notes.md`
- `docker-compose.portfolio.yml` — reuse the safe local stack from Story 24.7.

## Tasks

- [ ] Implement the three integrations without private/internal imports.
- [ ] Add success, attack, and recovery scenarios for each.
- [ ] Run evaluations and index the resulting evidence.
- [ ] Record actual clean-environment integration effort.
- [ ] Rewrite the README around verified capabilities and limitations.
- [ ] Write the architecture case study and exact-command demo script.
- [ ] Rehearse the demo from a clean checkout and record all failures or manual steps.
- [ ] Run final adversarial review against the Epic 24 exit criteria.

## Validation and Evidence

The final portfolio evidence bundle must contain:

- CI evidence manifest and evaluation reports
- three reference-integration receipts
- security denial and audit receipts
- deterministic replay comparisons
- clean-environment quickstart record
- documentation guard results
- final adversarial review disposition

## Definition of Done

- The complete demonstration works from documented commands.
- The portfolio shows architecture, implementation, governance, evaluation, and developer adoption as one coherent platform story.
- No public claim exceeds the evidence.

## Dev Agent Record

**Status:** pending

### Completion Notes

(To be filled by the implementing BMAD dev agent.)

### File List

(To be filled by the implementing BMAD dev agent.)

### Status Evidence

(To be filled after gate review.)
