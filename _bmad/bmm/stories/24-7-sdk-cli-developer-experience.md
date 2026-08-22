# Story 24.7 — SDK, CLI, and Ten-Minute Developer Path

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** changes-requested
**Priority:** P1-High
**Complexity:** Large
**Owner:** unassigned
**Dependencies:** Stories 24.5 and 24.6

## User Story

As an application team adopting Allura, I need a coherent SDK, CLI, local stack, and quickstart, so that I can integrate governed memory and run the harness without learning internal repository structure.

## Context

`@allura/sdk` and multiple scripts exist, but the product path is fragmented. The public developer surface must expose stable contracts for health, memory, scenarios, replay, evaluations, and evidence while keeping internal modules private. Any placeholder package must be labeled as such or removed from the documented path.

## Scope

- Stabilize and version the TypeScript SDK around public API/MCP contracts.
- Add one `allura` CLI that composes existing scripts and services.
- Provide a safe local-development stack and a fresh-clone quickstart.
- Add compatibility, contract, exit-code, and packaging tests.
- Document deprecation and semantic-versioning rules.

## Out of Scope

- Publishing packages to a public registry.
- Adding SDKs for additional languages.
- Requiring a public domain, TLS certificate, or cloud account for the quickstart.

## Acceptance Criteria

- [ ] AC-1: `@allura/sdk` exports typed clients for health/readiness, governed memory, scenario execution, replay, evaluation, and evidence inspection without importing server internals.
- [ ] AC-2: Public request/response schemas are versioned and contract-tested against the canonical HTTP/MCP gateway.
- [ ] AC-3: The CLI supports `init`, `up`, `doctor`, `run`, `replay`, `eval`, `inspect`, and `down` with consistent help, structured errors, and non-zero failure codes.
- [ ] AC-4: `allura init` creates only non-secret example configuration; secrets are generated or requested through a safe path and never printed after creation.
- [ ] AC-5: `allura doctor` validates runtime versions, ports, database readiness, migrations, gateway auth, schema compatibility, and write/read round trip without mutating canonical memory.
- [ ] AC-6: A fresh clone can start the local stack, run one fixture-backed scenario, replay it, execute the portfolio eval suite, and inspect evidence by following `docs/quickstart.md`.
- [ ] AC-7: The quickstart has been executed on a clean environment and records actual elapsed time, machine profile, commands, and failures encountered; the ten-minute target is reported honestly.
- [ ] AC-8: CLI JSON output is stable and documented for automation; human output contains no secrets or raw sensitive memory payloads by default.
- [ ] AC-9: A compatibility matrix maps CLI, SDK, API schema, scenario schema, and evaluation schema versions.
- [ ] AC-10: Placeholder or stub packages are not described as production-ready and are excluded from the quickstart unless implemented and contract-tested.

## Implementation Files

- `packages/sdk/src/` — extend and stabilize public clients.
- `packages/sdk/test/` — gateway contract and compatibility tests.
- `packages/cli/` — new CLI package and command tests.
- `docker-compose.portfolio.yml` — safe local demonstration stack; no public exposure by default.
- `.env.portfolio.example` — non-secret defaults and required-variable documentation.
- `docs/quickstart.md` — canonical fresh-clone path.
- `docs/reference/compatibility.md` — version/deprecation matrix.
- `examples/quickstart/` — smallest supported integration.

## Tasks

- [ ] Inventory and classify current SDK exports, scripts, and placeholder packages.
- [ ] Define the supported public client and CLI contracts.
- [ ] Implement CLI commands as thin adapters over SDK and harness APIs.
- [ ] Add schema/compatibility negotiation and stable error codes.
- [ ] Add safe local compose and doctor checks.
- [ ] Build the quickstart example and run it on a clean environment.
- [ ] Add package, contract, and snapshot tests for CLI JSON output.
- [ ] Document semantic versioning and deprecation policy.

## Validation and Evidence

Evidence must include a terminal transcript or structured log from the clean-environment quickstart, with credentials redacted, plus the compatibility-test report.

## Definition of Done

- A developer uses documented public surfaces only.
- The quickstart completes from a fresh clone without undocumented setup.
- SDK and CLI failures are actionable, structured, and safe to log.

## Dev Agent Record

**Status:** changes-requested — see `docs/reviews/epic-24-post-merge-adversarial-review-2026-08-22.md`

### Completion Notes

(To be filled by the implementing BMAD dev agent.)

### File List

(To be filled by the implementing BMAD dev agent.)

### Status Evidence

(To be filled after gate review.)
