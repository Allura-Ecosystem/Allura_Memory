# Story 24.8 — Enterprise Documentation Truth Pack

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** ready-for-dev
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** unassigned
**Dependencies:** Stories 24.2 through 24.7

## User Story

As a principal engineer or risk reviewer, I need architecture, requirements, security, operations, and evidence documentation to agree with the implemented system, so that I can evaluate decisions without encountering historical or aspirational claims presented as current fact.

## Context

Allura has six canonical architecture documents and an enterprise hardening guide, but active documents still contain historical backend language and claims whose enforcement is not always distinguished from design intent. This story performs a truth pass after the implementation stories and adds automated documentation guards.

## Scope

- Update the canonical six-document set for Stories 24.2–24.7.
- Record architecture decisions for principal context, RLS/roles, atomic promotion, scenario determinism, evaluation governance, and SDK/CLI versioning.
- Produce a threat model, security control matrix, operational runbooks, and portfolio evidence index.
- Label claims and limitations consistently.
- Add automated guards for backend residue, broken links, required sections, and capability/evidence drift.

## Out of Scope

- Claiming certification or formal regulatory approval.
- Replacing a professional penetration test or external audit.
- Maintaining historical documents as active architecture.

## Acceptance Criteria

- [ ] AC-1: `BLUEPRINT.md`, `SOLUTION-ARCHITECTURE.md`, `DATA-DICTIONARY.md`, `REQUIREMENTS-MATRIX.md`, and `RISKS-AND-DECISIONS.md` describe the same current PostgreSQL/RuVector architecture and Story 24 controls.
- [ ] AC-2: `DESIGN-ALLURA.md` is changed only where developer/operator experience from Story 24.7 affects the product design contract.
- [ ] AC-3: Active canonical docs, public tool descriptions, health/readiness output, and current runbooks contain no references to retired graph implementations; historical records remain clearly archived.
- [ ] AC-4: Architecture decisions specify alternatives, rationale, consequences, rollback, and evidence for principal identity, database isolation, immutable ledger, atomic promotion, deterministic replay, evaluation baselines, and public versioning.
- [ ] AC-5: `docs/enterprise/threat-model.md` covers assets, trust boundaries, actors, attack trees, prompt/tool injection, memory poisoning, cross-tenant access, role forgery, evidence tampering, replay abuse, dependency compromise, and denial of service.
- [ ] AC-6: `docs/enterprise/security-controls.md` maps each control to enforcement location, test/evidence, owner, failure mode, residual risk, and current status.
- [ ] AC-7: Hardening, incident response, backup/restore, key rotation, retention/deletion, and break-glass procedures are executable and do not overstate availability.
- [ ] AC-8: Every portfolio claim is classified as implemented, measured, planned, or unsupported and links to code plus evidence where applicable.
- [ ] AC-9: CI fails on active backend residue, broken internal doc links, missing canonical sections, or a capability-matrix evidence link that does not resolve.
- [ ] AC-10: An independent adversarial documentation review finds no critical contradiction between code, schema, CI, and canonical docs.

## Implementation Files

- `docs/allura/BLUEPRINT.md`
- `docs/allura/SOLUTION-ARCHITECTURE.md`
- `docs/allura/DATA-DICTIONARY.md`
- `docs/allura/REQUIREMENTS-MATRIX.md`
- `docs/allura/RISKS-AND-DECISIONS.md`
- `docs/allura/DESIGN-ALLURA.md` — only if impacted.
- `docs/enterprise/hardening.md`
- `docs/enterprise/threat-model.md` — new.
- `docs/enterprise/security-controls.md` — new.
- `docs/enterprise/incident-response.md` — new or extracted from hardening.
- `docs/portfolio/evidence-index.md` — canonical evidence navigation.
- `.github/scripts/docs-allura-canonical-guard.sh` — extend current guard.
- `.github/scripts/docs-backend-residue-guard.sh` — new active-doc/runtime-description guard.

## Tasks

- [ ] Build a requirements-to-code-to-test traceability map for Stories 24.2–24.7.
- [ ] Update the canonical documents and record the required decisions/risks.
- [ ] Remove current-state residue from active docs and runtime descriptions while preserving archived history.
- [ ] Create threat model and security control matrix.
- [ ] Verify operational procedures against actual commands and roles.
- [ ] Create the evidence index and claim classification.
- [ ] Add documentation guards to CI.
- [ ] Run adversarial consistency review and resolve all critical/high findings.

## Validation and Evidence

Required evidence includes guard output, a link report, the traceability matrix, and the adversarial review findings with dispositions.

## Definition of Done

- A reviewer can move from requirement to decision to implementation to test to evidence without contradictions.
- Current documentation names only active architecture components.
- Limitations and residual risks are as visible as strengths.

## Dev Agent Record

**Status:** pending

### Completion Notes

(To be filled by the implementing BMAD dev agent.)

### File List

(To be filled by the implementing BMAD dev agent.)

### Status Evidence

(To be filled after gate review.)
