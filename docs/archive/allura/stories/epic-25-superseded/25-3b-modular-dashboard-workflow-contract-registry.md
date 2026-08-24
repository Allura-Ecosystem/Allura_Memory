# Story 25.3b — Modular Dashboard Workflow Contract and Registry

**Status:** Planned / dependency-blocked
**Owner:** Brooks + Woz + Pike + Fowler + Bellard
**Depends on:** 25.2 authenticated read contract; 25.3 real curator shell
**Blocks:** 25.5a Mortgage Approval Gate dashboard demonstration

## Outcome

Make `/dashboard/curator` a stable governed shell that hosts allow-listed workflow modules without adding separate authority paths or restoring a broad route collection. Mortgage Approval Gate is the first module, not hardcoded dashboard logic.

## Architecture

```text
/dashboard/curator
  → DashboardShell
  → server-issued ModuleRegistry
  → selected WorkflowModuleManifest
  → shared components
      ├─ IntakeForm
      ├─ EvidenceInspector
      ├─ KnowledgeMap
      ├─ PolicyResult
      ├─ HumanReview
      └─ ReceiptView
  → shared Allura services and PostgreSQL authority plane
```

A module is a declarative, versioned product adapter over standard governed contracts. It may define labels, intake-field descriptors, evidence kinds, relationship vocabulary, policy references, stage presentation, skill bindings, and required capabilities. It may not contain arbitrary browser code, SQL, credentials, tenant/workspace selectors, authorization logic, direct connector clients, policy decisions, mutations, or receipt issuance.

## Initial Module

```text
module_id: mortgage-approval-gate
workflow: intake → evidence/OCR → policy → human review → receipt
hosts: dashboard, copilot-cowork, claude-code, codex
```

The same canonical workflow/skill source serves all hosts. The dashboard manifest is a presentation adapter; Cowork/Claude/Codex packages are client adapters. All call the same Allura tools and services.

## Acceptance Criteria

- [ ] Define typed `WorkflowModuleManifest`, `WorkflowStageDescriptor`, `IntakeFieldDescriptor`, `EvidenceKindDescriptor`, `RelationshipDescriptor`, and `HostSkillBinding` contracts.
- [ ] The server supplies the enabled module registry after authenticating the principal and deriving tenant/workspace/role/policy context. The browser cannot add, enable, or alter modules through URL/query/header/local storage.
- [ ] Each manifest has stable module ID, semantic version, compatible contract version, display labels, stages, intake schema reference, evidence/relationship grammar, required capabilities, host skill bindings, feature flag, and rollback identifier.
- [ ] Manifests are schema-validated, allow-listed, and integrity-checked at startup. Unknown, duplicate, incompatible, unsigned/untrusted, or capability-missing modules fail closed and do not partially render.
- [ ] Modules compose only approved shared components. No module-specific direct database query, raw fetch, arbitrary script injection, iframe, custom policy evaluator, or separate mutation route is permitted.
- [ ] Server-derived `allowed_actions` remain the only action source. Standard decision endpoints reauthorize identity, duty separation, evidence sufficiency, policy, rationale, concurrency, and receipt behavior regardless of module.
- [ ] Loading, empty, denied, stale, partial/degraded, conflict, error, and complete remain shell-level standard states; modules cannot redefine them.
- [ ] The module registry and active module are visible through plain-language orientation and optional technical details without exposing hidden modules or cross-scope counts.
- [ ] Module disable/rollback returns the shell to a truthful module-unavailable state and does not affect Allura engine, dashboard shell, other modules, SDK, API, MCP, CLI, Cowork, Claude Code, or Codex.
- [ ] Mortgage Approval Gate proves the module contract with sanitized deterministic fixtures and no Salesforce or underwriting dependency.

## Explicit Exclusions

- No plugin marketplace, arbitrary third-party JavaScript, npm package loading, remote UI injection, or browser-side module installation.
- No per-module database schema ownership in this story; domain records use approved typed service contracts and separately reviewed migrations.
- No separate route tree per module; the initial shell remains `/dashboard/curator`.
- No module-defined authorization, Entra mapping, RLS, retrieval planner, policy engine, decision transaction, or receipt generator.
- No claim that a declarative manifest alone makes the platform production-ready or safe for third-party modules.

## Evidence

```text
docs/archive/allura/evidence/epic-25/25.3b/
```

Include schema/contract snapshots, invalid-manifest cases, capability-denial cases, shell state tests, module disable/rollback, no-direct-fetch static checks, route smoke, ARIA/keyboard evidence, and Mortgage Approval Gate fixture proof.
