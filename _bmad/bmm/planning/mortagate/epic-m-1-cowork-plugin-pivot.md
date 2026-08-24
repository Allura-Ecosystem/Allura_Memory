# Epic M-1 — Mortagate Co-Work Plugin Pivot

**Status:** Planned
**Owner:** Brooks (architecture) + Jobs (scope) + Woz (implementation)
**Tenant:** allura-system
**Repo:** `plugins/mortagate/`

## Goal

Pivot Mortagate from a Salesforce Community Mortgage Approval Engine to a portable co-work plugin that runs the Mortgage Approval Gate workflow across Microsoft Copilot Cowork, Claude Code, and Codex — using Allura Brain for identity, evidence, and receipts.

## Product Boundary

Mortagate is becoming an Allura plugin, not a standalone Salesforce product. It implements the Mortgage Approval Gate workflow module from Epic 25: `intake → evidence/OCR → policy evaluation → human review → immutable receipt`. It calls Allura Brain MCP/API contracts for identity, scope, evidence, and receipts. It does not own its own database, auth, or policy engine.

## Explicit Exclusions

- Salesforce as a dependency, data source, CRM implementation, or product claim
- Direct database access — all data flows through Allura Brain MCP/API
- Self-asserted authority — tenant scope comes from the authenticated Allura principal
- Autonomous policy activation — all decisions require human approval
- Underwriting, lending, or regulatory-production suitability claims

## Current State

- Salesforce-era BMAD in `my-project/_bmad-output/` with `US-1.0` through `US-1.7` stories
- `force-app/` directory with Salesforce LWC components
- `manifest/` with Salesforce package metadata
- `data/` with Salesforce test data
- `apps/veridact-frontend/` — a frontend that may or may not survive the pivot
- `mortagate.gates.json` — gate definitions that may be reusable
- `specs/` — agent and auditor specs that may inform the co-work contract

## Story Map

| Story | Outcome | Dependency | Ship condition |
|---|---|---|---|
| M-1.1 | Archive Salesforce BMAD | — | US-1.0 through US-1.7 moved to archive, sprint-status updated |
| M-1.2 | Define co-work plugin contract | M-1.1 | Intake → evidence → policy → review → receipt contract documented and approved |
| M-1.3 | Strip Salesforce dependencies | M-1.1 | force-app, manifest, data removed or archived; no Salesforce imports remain |
| M-1.4 | Co-work adapter — Copilot Cowork, Claude Code, Codex | M-1.2, M-1.3 | One canonical skill source; three host adapters; same authority and traceability |
| M-1.5 | Allura Brain integration | M-1.2 | group_id, evidence, receipts flow through Allura Brain MCP/API |
| M-1.6 | Demo gate — portable mortgage approval gate across hosts | M-1.4, M-1.5 | Sanitized fixtures; intake → evidence → policy → review → receipt proven across all three hosts |

## Dependencies

- Epic 25 server-issued module registry and governed shell
- Allura Brain MCP server for identity, evidence, and receipts
- Epic 24 mutation-boundary remediation for decision/receipt path

## Rollback

Mortagate is a plugin module. Disabling it through the module registry leaves the dashboard shell and other modules operational. The Salesforce-era code remains in archive for reference.