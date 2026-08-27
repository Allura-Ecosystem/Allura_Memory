# Story 25.3b — Modular Dashboard Workflow Contract Registry

**Status:** Dependency-blocked — canonical planning restored 2026-08-27; implementation must not start until the prerequisite-verification gate is closed.
**Owner:** Brooks + Woz + Pike + Fowler + Bellard
**Depends on:** Story 25.2a — Workspace Scope and Evidence Lifecycle Foundation (**Done**, final approval 2026-08-26); Story 25.2b — Authenticated Session Entry Point (**Done**); Story 24.12 — Effective-Tenant Authority Seam (**Done** in authoritative sprint status).
**Blocks:** REQ-MOD-001, REQ-MOD-002, REQ-MOD-003; Story 26.7 AC-2 module registration.

## Reconciliation Boundary

This is the active canonical Story 25.3b. It replaces neither source code nor the archived/superseded planning artifact. The reconciliation restores only a truthful planning and status record.

There is **no server-issued module registry implementation**, registration path, or registry test suite in the repository. The existing Bumblebee descriptor and its local fail-closed compatibility checks are inputs a future registry may consume; they are not a registry and do not satisfy this story or Story 26.7 AC-2.

## Outcome

Define and then implement one server-owned, allow-listed module-registry boundary for the authenticated `/dashboard/curator` shell. A registered workflow module may supply typed presentation and workflow descriptors only. Tenant/workspace scope, principal authority, policy decisions, mutations, receipts, storage access, and standard UI truth states remain owned by canonical Allura services.

## Prerequisite-Verification Gate

Status remains `Dependency-blocked` until a designated readiness review verifies all of the following against current `origin/main` and records the evidence:

1. **25.2a workspace authority:** the frozen 25.2a completion claims still match the current scoped transaction, RLS, workspace, evidence-lifecycle, and receipt seams that the registry will invoke.
2. **25.2b authenticated entry:** the authenticated curator route still derives principal, tenant, workspace, and role server-side, with no browser-controlled scope authority.
3. **24.12 effective-tenant seam:** the authoritative effective-tenant boundary is present at every intended registry/read entrypoint and fails closed on mismatch.
4. **Architecture authority:** a recon names the current canonical shell, shared components, allowed action contract, feature-flag/rollback convention, and the only approved registration boundary. It must reject caller-supplied capability data, direct Bumblebee-route bypasses, and any separate module authority plane.
5. **Review and test plan:** Pike/Fowler/Knuth review scope and a red test plan exist before implementation begins, including cross-tenant, forged-principal, duplicate/unknown/incompatible/disabled module, rollback, accessibility, and no-direct-data-access cases.

Completion of earlier stories is not itself evidence that this new composition boundary is ready. Do not advance this story, change REQ-MOD status, or mark Story 26.7 complete until the gate and implementation acceptance criteria are independently evidenced.

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
