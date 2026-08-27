# Story 25.3b — Modular Dashboard Workflow Contract Registry

**Status:** In Progress — source-controlled server registry implemented locally 2026-08-27; independent review and required evidence remain pending.
**Owner:** Brooks + Woz + Pike + Fowler + Bellard
**Depends on:** Story 25.2a — Workspace Scope and Evidence Lifecycle Foundation (**Done**, final approval 2026-08-26); Story 25.2b — Authenticated Session Entry Point (**Done**); Story 24.12 — Effective-Tenant Authority Seam (**Done** in authoritative sprint status).
**Blocks:** REQ-MOD-001, REQ-MOD-002, REQ-MOD-003; Story 26.7 AC-2 module registration.

## Reconciliation Boundary

This is the active canonical Story 25.3b. It replaces neither source code nor the archived/superseded planning artifact. The reconciliation restores only a truthful planning and status record.

A local, source-controlled registry implementation is present in this branch, but it is **pending remediation verification and independent review**. It does not yet satisfy this story, REQ-MOD-001..003, or Story 26.7 AC-2. The Bumblebee descriptor remains only declarative input; the host-owned adapter is not a separate route or authority boundary.

## Outcome

Define and then implement one server-owned, allow-listed module-registry boundary for the authenticated `/dashboard/curator` shell. A registered workflow module may supply typed presentation and workflow descriptors only. Tenant/workspace scope, principal authority, policy decisions, mutations, receipts, storage access, and standard UI truth states remain owned by canonical Allura services.

## Prerequisite-Verification Record

The designated 2026-08-27 Scout/Knuth/Pike/Fowler readiness review verified the workspace authority, authenticated entry, effective-tenant seam, curator read-boundary remediation, and required red-test plan against current `origin/main`. This story may now begin its **source-controlled, server-only** registry implementation. The review explicitly rejected caller-supplied capability data, direct Bumblebee-route bypasses, dynamic/admin-managed registration, and any separate module authority plane.

The implementation still must meet every acceptance criterion and pass independent review before REQ-MOD status or Story 26.7 can advance.

## Local Implementation Record (2026-08-27)

Implemented locally, pending independent review and evidence archival:

- `src/lib/curator/module-contract.ts` and `module-registry.ts` define the versioned, source-controlled allowlist and server issuer. It derives the authenticated principal/workspace/role and evaluates module capabilities through the canonical permission-action binding, validates the complete set before rendering, reads the curator-owned summary, and appends a scoped issuance/denial decision through `withWorkspaceTransaction`.
- `/dashboard/curator` composes the host-owned accessible shell. Disabled modules render truthful unavailable state; no direct `/dashboard/bumblebee` route exists.
- Local remediation verification (2026-08-27): focused Vitest 35 tests, `bun run typecheck`, and `bun run test:unit` (2,170 passed; 160 skipped); fresh live PostgreSQL CI-app-role lane (24 suites / 72 tests passed). The live test does not mutate shared `allura_app` grants. The complete truthful evidence map, exact commands, and candidate-tree recipe are in `docs/archive/allura/evidence/epic-25/25.3b/EVIDENCE-INDEX.md` and `remediation-verification-2026-08-27.md`. Independent review remains pending; this local verification does not satisfy the story, REQ-MOD-001..003, or Story 26.7 AC-2.

## Acceptance Criteria

- [ ] A typed, versioned server contract defines module identity, compatible contract version, display/stage descriptors, required capabilities, host bindings, feature flag, and rollback identifier.
- [ ] The registry is issued only after server authentication and server-derived principal, tenant, workspace, role, policy, and capability evaluation. Browser URL, query, header, local storage, and caller-supplied capability data cannot add, enable, scope, or alter modules.
- [ ] Registry inputs are allow-listed and schema/integrity validated. Unknown, duplicate, incompatible, untrusted, capability-missing, disabled, or failed modules fail closed without partial rendering.
- [ ] Modules use only approved shared presentation and workflow contracts. They cannot query storage, select identity or scope, authorize, evaluate policy, call a connector, mutate state, issue receipts, inject arbitrary script, load remote code, or introduce a direct route bypass.
- [ ] Shell-level loading, empty, denied, stale, partial/degraded, conflict, error, and complete states remain canonical and cannot be redefined by a module.
- [ ] Disabling or rejecting one module returns a truthful unavailable state and does not affect the shell, other modules, engine, SDK, API, MCP, CLI, or host adapters.
- [ ] Tests prove server-derived authority, tenant/workspace isolation, forged-principal rejection, invalid manifest rejection, no direct data/connector access, independent rollback, and accessible shell states.
- [ ] Story 26.7 is wired through this registry only after its module descriptor passes the same server-issued registry checks; its AC-2 remains unchecked until that evidence exists.

## Explicit Non-Goals

- No third-party marketplace, arbitrary JavaScript, remote UI injection, npm/module installation, iframe, or browser-side registration.
- No reuse of the rejected partial registry prototype, caller-supplied capability data, or direct Bumblebee route registration path.
- No new authorization, Entra mapping, RLS, policy engine, mutation path, connector client, or receipt issuer owned by a module.
- No claim that a descriptor, compatibility helper, planning file, or this story document constitutes a registry implementation.

## Evidence Required Before Done

Store readiness review, architecture decision, schema/contract snapshots, adversarial test output, accessibility evidence, rollback proof, and independent review evidence under:

```text
docs/archive/allura/evidence/epic-25/25.3b/
```

A `done` status requires implemented code, passing targeted tests, independent review evidence, and source reconciliation. Until then this story remains dependency-blocked.
