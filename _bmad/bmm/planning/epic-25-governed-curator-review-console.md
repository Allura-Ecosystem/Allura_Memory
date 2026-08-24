# Epic 25 — Governed Curator Review Console

**Status:** Planned; read-only work may begin after scope approval. Mutation work is blocked by Story 24.4 remediation.
**Owner:** Brooks (architecture) + Troy (implementation), with Jobs, Knuth, Pike, Fowler, Bellard, and Hightower gates.
**Tenant:** `allura-system`

**Execution identity:** Gilliam prepares and orchestrates documentation/tooling work for this session; Gilliam is not the project architecture or implementation owner.

## Goal

An authenticated reviewer sees only their tenant/workspace proposals, inspects evidence and provenance, takes only server-permitted actions, and can inspect a truthful immutable decision receipt. The same governed contracts serve a portable **Mortgage Approval Gate** workflow across Microsoft Copilot Cowork, Claude Code, and Codex without giving any client authority over tenant scope, policy, promotion, or receipts.

## Product Boundary

This epic implements the first **Workspace Memory Map** vertical slice:

```text
Mine (future read-only) → Review Queue → Evidence/Provenance → Decision Receipt → Shared Knowledge (future read-only)
```

Initial operator route: `/dashboard/curator`.

The route is a modular governed shell, not a Mortgage-specific page:

```text
DashboardShell
  → server-issued ModuleRegistry
  → shared intake/evidence/map/policy/review/receipt components
  → installed allow-listed WorkflowModuleManifest
      └─ mortgage-approval-gate (first module)
```

Modules are declarative presentation/workflow adapters. They cannot supply authority scope, SQL, credentials, policy decisions, mutations, or receipts.

Optional interoperability surfaces after the secure read contract:

```text
Portable Mortgage Approval Gate skill source
  ├─ Microsoft Copilot Cowork M365 package + remote MCP connector
  ├─ Claude Code plugin/Agent Skills adapter
  └─ Codex skill/plugin adapter
       → authenticated Allura adapter
       → Microsoft Entra identity mapping where applicable
       → server-derived Allura scope and policy
       → the same RetrievalPlan / evidence / decision / receipt contracts
```

The workflow is `intake → evidence/OCR → policy evaluation → human review → immutable receipt`. Cowork policy setup uses native MCP elicitation forms first. Rich MCP App widgets are optional presentation adapters later; forms, widgets, skills, and host plugins never become authority or storage surfaces.

## Explicit Exclusions

- Restore of the nine retired sidebar destinations.
- Generic chat/workbench.
- Browser-to-PostgreSQL access.
- New memory database or Meko terminology.
- Auto-sharing, document-ingestion portal, and run-control UI.
- Python SDK and MCP v2 migration.
- Microsoft, Anthropic, or OpenAI branding, copied host skill content, or a claim that Allura is their product.
- Salesforce as a demo dependency, data source, CRM implementation, or product claim; the active demo is the vendor-neutral Mortgage Approval Gate.
- Direct Cowork/Claude Code/Codex-to-database, direct client-to-Exa credentials, ungated external writes, or automatic promotion of connector/research content.
- Any external host as a launch dependency for the local curator console; host adapters follow 25.2/25.4a contract proof.
- External product claims before a privately tested package, Entra/connector authorization proof, and cross-surface harness evidence exist.

## Story Map

| Story | Outcome | Dependency | Ship condition |
|---|---|---|---|
| 25.1 | Scope/Product Truth and development loop | explicit scope approval | docs, AD-57, route inventory, readiness checklist complete |
| 25.2a | Workspace Scope and Evidence Lifecycle Foundation | 24.2, 24.3, 25.1 | durable workspace/evidence/receipt contracts and live-DB scope plan complete |
| 25.2 | Curator Read Contract and tenant hardening | 25.2a | server derives tenant/workspace scope; 401/403/validation tests pass |
| 25.3 | Focused 2D Knowledge Map shell | 25.1, 25.2, 25.2a | `/dashboard/curator` real route; server-authorized bounded 2D map; route/state/a11y smoke passes |
| 25.3b | Modular Dashboard Workflow Contract and Registry | 25.2, 25.3 | stable shell; server-issued allow-listed module registry; shared governed components; disable/rollback proof; Mortgage Gate as first module |
| 25.3a | Optional 3D Knowledge Explorer | 25.3, 25.4, measured device/browser proof | same bounded contract as 2D; opt-in/flagged/a11y fallback/rollback proof |
| 25.4 | Evidence-first proposal queue | 25.2, 25.3 | real queue/detail/provenance and truthful state matrix pass |
| 25.4a | Governed Assistant API, SDK, and Connector Harness | 25.2a, 25.2, 25.4, 24.5 | typed read-only assistant; parity/harness proof; one narrow connector contract |
| 25.4b | Portable Agent-Skill Interoperability and Entra Policy Intake | 25.2, 25.4a | one canonical Mortgage Approval Gate skill source; Cowork/Claude Code/Codex adapters; remote MCP read tools; Entra mapping; native policy elicitation; auth, denial, parity, and disable proof |
| 25.5 | Governed decisions and receipts | 24.4 remediated, 25.4 | atomic decision/receipt path; conflict and duty separation pass |
| 25.5a | Mortgage Approval Gate Cross-Host Demonstration | 25.3b, 25.4b, 25.5 | installed dashboard module plus Cowork/Claude/Codex adapters prove intake → evidence/OCR → policy → human review → receipt with identical authority and traceability; no Salesforce dependency |
| 25.6 | Security, accessibility, and demo gate | 24.5, 24.6, 24.8, 25.5 | live-DB, route, a11y, evidence bundle, demo rehearsal pass |

## Acceptance Evidence

Each story uses `docs/allura/DEVELOPMENT-LOOP.md` and writes its evidence bundle under `docs/archive/allura/evidence/epic-25/`. The cross-role frozen delivery plan is in [`docs/archive/allura/EPIC-25-TEAM-RAM-HANDOFF.md`](../../../docs/archive/allura/EPIC-25-TEAM-RAM-HANDOFF.md). Microsoft Copilot Cowork reference implementations remain outside the product repository under `/mnt/projects/git/references/microsoft-copilot/`; they are source/standards references, not vendored Allura dependencies.

## Demo Definition

1. A mortgage-review item enters through a governed intake surface with source identity, workspace, classification, and document/OCR state.
2. The same canonical Mortgage Approval Gate skill guides Copilot Cowork, Claude Code, and Codex; each host calls the same Allura MCP/API contracts rather than implementing policy locally.
3. Allura maps Microsoft Entra tenant/user/group/app-role claims to an internal principal, memberships, and allowed roles; the client cannot self-assert approver authority.
4. The reviewer inspects evidence and policy results, sees missing/stale/degraded conditions, and supplies required human rationale.
5. Allura commits the permitted transition through the normal atomic decision path and returns an immutable receipt with actor, action, rationale, policy, evidence, timestamp, and sync state.
6. A forged role, cross-workspace request, unsupported host action, or insufficient-evidence case is denied without data leakage and produces deterministic harness evidence.
7. The demonstration has no Salesforce dependency and makes no claim of underwriting, lending, or regulatory-production suitability.

## Rollback

The operator UI is optional. If an Epic 25 route is disabled or rolled back, the supported fallback is the governed MCP/API/CLI path. No migration makes the engine depend on the browser.
