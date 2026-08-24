# Allura Ecosystem — Repository Topology and Index

This document is a repository-grounded navigation index for the Allura ecosystem. It describes what is present in the current workspace, what the owning repositories say about themselves, and where a relationship still needs confirmation.

It is not a deployment dashboard, client registry, ownership ledger, or substitute for runtime health checks. Repository code and schemas outrank status prose when they disagree.

## Evidence and boundary rules

- The workspace at `/mnt/projects/Allura-Ecosystem/` contains independent Git checkouts. They are not directories in this repository and are not Git submodules of `Allura-ecosystem`.
- A checkout beside this repository proves local availability only. It does not prove that the repository is an owned product, publicly visible, deployed, or supported.
- The current `Allura-ecosystem/README.md` defines the ecosystem navigation surface. Allura Memory code, schema, Compose configuration, and canonical ADRs define the Brain implementation.
- `allura-plugins` manifests define the installable plugin names, package paths, versions, and runtime manifests.
- Operational health, production readiness, quality scores, client status, ownership, and visibility are omitted unless the inspected repositories establish them. Unresolved relationships are marked `[DATA NEEDED]`.

## Canonical names

| Name | Meaning |
|---|---|
| **Allura Memory** | The governed memory product and the `Allura_Memory` repository. |
| **Allura Brain** | The governed MCP/API capability provided by Allura Memory. It is not a separate repository in this workspace. |
| **Allura Cowork** | The Claude/Codex coordination and validated-handoff plugin packaged as `allura-cowork`. |
| **Team Durham** | The brand-production plugin packaged as `team-durham`. A separate sibling checkout named `team-durham` is a delivery workspace, not evidence of a separate Allura product. |
| **Team RAM Coding** | The Brooks-led coding plugin packaged as `team-ram-coding`. |

Repository slugs and package IDs remain in code formatting when they differ from the canonical display name.

## Core topology

```text
Claude, Codex, and other MCP-capable callers
                       |
                       v
                Allura Brain
       governed MCP/API boundary in Allura Memory
                       |
             identity + tenant scope
             RuVix policy + audit
                       |
          +------------+-------------+
          |                          |
          v                          v
  episodic evidence          semantic knowledge
  PostgreSQL events          PostgreSQL graph tables
  append-oriented            approved + versioned
                              SUPERSEDES lineage
          ^                          ^
          |                          |
          +--- curator proposal -----+
                  + governance decision
```

### Allura Memory and Allura Brain

| Item | Repository-grounded description |
|---|---|
| Repository | [`Allura_Memory`](https://github.com/Allura-Ecosystem/Allura_Memory) |
| Product | Allura Memory |
| Service capability | Allura Brain, exposed through the governed MCP/API boundary |
| Episodic layer | PostgreSQL 16 with pgvector; append-oriented events and traces |
| Semantic layer | PostgreSQL tables including `graph_memories` and `graph_supersedes`, accessed through the `ruvector` graph adapter |
| Promotion | Candidate proposal followed by a governance decision; approval authorizes or queues canonical materialization, while automated curator behavior remains under review |
| Versioning | New canonical versions preserve lineage through `SUPERSEDES`; prior evidence remains inspectable |
| Containerized gateway | Compose publishes host port `6477` to the gateway's container port `3201`; this is configuration, not a health claim |
| Direct development gateway | Defaults to port `3201` |
| Visibility | `[DATA NEEDED]` — a local checkout and GitHub origin do not establish current repository visibility |

Neo4j is not an active store or fallback in the current architecture. AD-49 records the PostgreSQL-table graph cutover, and AD-50 formalizes the PostgreSQL-only sunset. The active Compose file contains no Neo4j service and sets `GRAPH_BACKEND=ruvector`. Compatibility code, archived migration material, and stale policy prose may still contain Neo4j terminology; those references do not define the current topology.

The `ruvector` backend name refers to the repository's PostgreSQL-table graph adapter. Canonical documentation should not imply that the native RuVector extension is active without separate runtime evidence.

### Governance invariants

The inspected code, schema, README, and ADRs support these invariant names:

| Invariant | Current contract |
|---|---|
| Tenant scope | Memory operations carry a valid `group_id`; production tenant names follow the `allura-*` namespace. |
| Episodic evidence | Raw event and trace history is append-oriented and is not rewritten into knowledge. |
| Knowledge lineage | Canonical changes create a new version and retain `SUPERSEDES` lineage. |
| Accountable approval | Curator output is a proposal. Human approval is the accountable boundary; the current automated-curator path remains an explicit policy-resolution item. |
| Governed access | Agent-facing reads and writes pass through the MCP/API and policy boundary rather than direct storage access. |
| Auditability | Identity, scope, provenance, approval, and failure information remain available as evidence or receipts. |

No inspected canonical registry establishes the former six `POL-001` through `POL-006` mappings. Those numeric IDs are intentionally not reassigned here. A canonical policy-ID registry and owner are `[DATA NEEDED]`.

## Plugin catalog

The independent sibling repository [`allura-plugins`](https://github.com/Allura-Ecosystem/allura-plugins) is the checked-out catalog source. Its current Claude marketplace manifest lists three packages at version `0.2.0`; each package also contains Claude and Codex manifests.

| Canonical name | Package ID | Catalog path | Repository-grounded role |
|---|---|---|---|
| **Allura Cowork** | `allura-cowork` | `allura-plugins/allura-cowork/` | Coordinates Claude and Codex with runtime honesty, governed handoffs, validation, and outcome logging. |
| **Team Durham** | `team-durham` | `allura-plugins/team-durham/` | Brand strategy and production team with agents, skills, commands, governance, and optional design integrations. |
| **Team RAM Coding** | `team-ram-coding` | `allura-plugins/team-ram-coding/` | Brooks-led software delivery team for architecture, reconnaissance, implementation, review, validation, memory, and task workflows. |

The catalog does not make plugin execution equivalent to Allura Memory. Plugins consume the Allura Brain contract for governed hydration and outcome logging; they do not own or bypass memory governance.

The sibling `allura-team-ram` checkout describes the fuller Team RAM harness. The exact source, release, and synchronization relationship between that repository and the packaged **Team RAM Coding** directory is `[DATA NEEDED]`; they must not be treated as the same checkout merely because they share Team RAM concepts.

The sibling `team-durham` checkout identifies itself as a delivery workspace and explicitly says it is not the Allura product repository. The synchronization and release-authority relationship between that workspace and the packaged **Team Durham** plugin is `[DATA NEEDED]`.

## Repository index

### Documented ecosystem repositories

| Repository | Role supported by inspected files | Relationship boundary | Visibility |
|---|---|---|---|
| [`Allura-ecosystem`](https://github.com/Allura-Ecosystem/Allura-ecosystem) | Organization map, shared doctrine, navigation, and governance documentation | This repository; it does not contain the sibling products as submodules | `[DATA NEEDED]` |
| [`Allura_Memory`](https://github.com/Allura-Ecosystem/Allura_Memory) | Allura Memory product and Allura Brain implementation | Independent sibling checkout | `[DATA NEEDED]` |
| [`allura-plugins`](https://github.com/Allura-Ecosystem/allura-plugins) | Plugin catalog and packages for Allura Cowork, Team Durham, and Team RAM Coding | Independent sibling checkout | `[DATA NEEDED]` |
| [`allura-team-ram`](https://github.com/Allura-Ecosystem/allura-team-ram) | Full Team RAM multi-agent engineering harness | Independent sibling checkout; package synchronization is `[DATA NEEDED]` | `[DATA NEEDED]` |
| [`.github`](https://github.com/Allura-Ecosystem/.github) | Organization profile and shared community-health files | Independent sibling checkout; its README says it is not a product module | `[DATA NEEDED]` |

### Other checked-out sibling repositories

These rows describe local workspace topology only. They do not establish Allura ownership or product status.

| Checkout | What the inspected repository says | Ecosystem/product relationship | Visibility |
|---|---|---|---|
| `mortagate` | Its README identifies the product as Veridact, a mortgage audit replay and quality-control platform built on Salesforce | Listed by the current ecosystem README in a product context; ownership and first-party status are `[DATA NEEDED]` | `[DATA NEEDED]` |
| `open-design` | Its README identifies Open Design as a local-first, open-source design workspace and links release assets to `nexu-io/open-design` | Listed by the current ecosystem README in a product context; ownership and first-party status are `[DATA NEEDED]` | The checkout contains an Apache-2.0 license, but current repository visibility is `[DATA NEEDED]` |
| `team-durham` | Delivery workspace; explicitly outside the Allura product inventory | Relationship to the packaged Team Durham plugin is `[DATA NEEDED]` | `[DATA NEEDED]` |
| `allura` | No top-level README or manifest was found in the inspected checkout | `[DATA NEEDED]` | `[DATA NEEDED]` |
| `agent-backups` | Operational backup checkout | No product relationship established; ownership and retention policy are `[DATA NEEDED]` | `[DATA NEEDED]` |

No `products/` directory exists in this repository. Product-like sibling repositories must therefore be linked as independent repositories, not documented as `products/*` children.

## Client boundary

The only checked-in path under `clients/` is `clients/faith-meats/MIGRATION-PLAN.md`. It is a dated migration plan, not a client application checkout, deployment manifest, ownership record, or current health source. It also contains historical endpoint and Neo4j health language that is superseded by the current Allura Memory topology.

| Client reference | Evidence present | Relationship and current state |
|---|---|---|
| Faith Meats | One migration-plan document | Client authorization, ownership, system location, deployment state, endpoint, and current integration status are `[DATA NEEDED]` |

No checked-in Patriot Awning or Auntie NY client directories were found. They are not part of the current repository topology.

## Source index and precedence

Use the following order when correcting this index:

1. **Implementation and schema:** `Allura_Memory/src/`, `Allura_Memory/packages/`, PostgreSQL schema files, and active Compose configuration.
2. **Canonical Memory decisions:** `Allura_Memory/docs/allura/RISKS-AND-DECISIONS.md`, especially AD-49 and AD-50, plus the current Allura Memory README.
3. **Plugin package truth:** `allura-plugins/.claude-plugin/marketplace.json` and each package's `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`.
4. **Ecosystem navigation:** this repository's `README.md` and this file.
5. **Planning, archived, client, and operational notes:** useful as historical evidence, but not authoritative for current architecture or health.

## Status and unresolved data

This index makes no claim that any component is healthy, deployed, Production, release-ready, or at a numeric quality level. Establishing those states requires dated validation evidence from the owning repository or runtime.

The following registry data still needs an authoritative owner and source:

- repository ownership and current public/private visibility;
- which sibling repositories are first-party Allura products;
- release/synchronization relationships for the Team Durham and Team RAM Coding packages;
- authorized client relationships and current integration/deployment state;
- a canonical policy-ID registry, if numeric `POL-*` identifiers are still required.

---

*Repository audit date: 2026-08-15.*
