# Epic 10 Context: Bumblebee and bounded capability modules

## Goal

Integrate the already-approved read-only upstream scanner as a bounded evidence producer. Allura remains the governed memory service: scanner findings are provisional package-presence assertions, not trusted exposure or enforcement. Build local behavior with real negative and integration evidence; do not inherit implementation claims from purged code.

## Stories

- Story10.1: Pinned upstream, provenance, source/lease and capability contracts.
- Story10.2: Authenticated receiver/runner, scoped exposure correlation, deduplicated alerts and simulated proposals.
- Story10.3: Module lifecycle/operator presentation, isolation and adversarial acceptance.

## Requirements & Constraints

The current user amendment permits local10 then11 while6/9 external release checks remain open. It does not authorize production, remote push, grants, deployment, optional projection, deferred run/work-plane/desktop, or another upstream. Separate trusted-source verification from freshness and failed/partial/unknown observations. Only current independently authorized humans can approve semantic promotion; simulated mitigation is not enforcement permission.

Source configuration is human-authorized with actor, rationale, validation, evidence and receipt. Runner credentials only request leases; short-lived ingest credentials only upload leased evidence. Both are separate from browser/MCP/memory credentials. Authenticate before parsing/decompression; bound bytes, lines, work and time. Only atomic sanitized persistence yields success. Scope all keys/FKs/queries by current authenticated tenant/workspace; no client scope or arbitrary module identity can mint authority.

Raw hostname/user/path/environment/catalog/free text never becomes unqualified persisted evidence or telemetry. Preserve canonical digests and redaction provenance. Routine current inventory updates only from complete, matching, server-bound populations; empty complete is meaningful. Partial/error/deep/findings-only/unbound scans cannot retire routine inventory. Server-issued generations, not client clocks, order snapshots; exact/conflicting replays differ. Findings must be recomputed against accepted packages and the exact approved immutable catalog revision.

## Technical Decisions

Approved scanner: perplexityai/bumblebee v0.1.2, commit cc57710eeaf685e7b89924a36c8583cad0a378fe, emitted schema0.1.0, Apache-2.0. Inspect and hash the exact upstream source/license/build inputs; no latest-version upgrade. Restrict unsupported schema/code enum drift rather than silently accepting extensions. Preserve baseline/project separation and source/population/catalog-bound leases. No package manager/package execution, policy activation, CI/package blocking, schedule change, revocation, lock or containment.

Modules are server-issued allowlisted versioned descriptors using shared UI components, not arbitrary loaded client code. They cannot select scope, resolve identity, read storage, authorize, mutate canonical state, issue receipts or redefine truth states. Unknown/duplicate/incompatible/untrusted/disabled/capability-missing modules fail closed independently. Demonstrate two fixture apps, compatible update, incompatible rejection, configuration/data preservation and failure recovery; installation never expands permissions.

## UX & Interaction Patterns

Keep retained Allura shell/branding and real interactive graph. Employees see task-oriented apps; administrators see owner/version/compatibility/update impact. Failure of one module must leave other permitted modules and shell usable. Actual responsive/keyboard/browser checks remain required for new UI, not count-card substitutes or inferred health.

## Cross-Story Dependencies

10.1 binds executable input boundaries and provenance before10.2 transport/storage.10.2 establishes actual evidence before10.3 presentation/acceptance. Existing locally tested authority, capture/proposals, current human review, operation budgets and operator/curator contracts supply dependencies; their external release acceptance is not fabricated. A concise actual retrospective precedes11. Legacy requirements specify intent, not proof restored implementations exist.
