# Epic 22 — Enterprise Readiness — Multi-Tenant Hardening

> [!NOTE]
> **AI-Assisted Documentation**
> This historical planning record was split from the prior combined epic rollup without changing its stated scope or acceptance content.
> Current delivery status is controlled by [`sprint-status.yaml`](../stories/sprint-status.yaml).
> When in doubt, defer to code, schemas, tests, and the authoritative sprint record.

**Lifecycle status:** Done — authoritative sprint status (retrospective complete)
**Owner:** Brooks (historical delivery record)
**group_id:** `allura-system`
**Migration note:** Source-preserving split from `epics.md` on 2026-08-28 to give every epic one planning file.

**Date:** 2026-07-26
**Status:** Approved
**Owner:** Brooks (orchestrator)
**group_id:** allura-system

**Goal:** The memory plane must be ready to deploy for multiple businesses (faithmeats, difference-driven, coding projects) with clean tenant onboarding, profile-based tool isolation, and export/import for sharing configs. The infrastructure is built — this epic hardens the edges so a new project can be onboarded in minutes, not hours.

**Why now:** Docker MCP profiles are created (faithmeats, difference-driven, coding) but the Allura Brain side doesn't know about them. The `group_id` CHECK constraint enforces `^allura-` but there's no registry of which tenants exist, who owns them, or what tools they're allowed to access. Onboarding a new project means manually editing env vars and hoping.

**Stories:**

- **22.1** Create tenant registry table — a new PostgreSQL table `tenants` with columns: `group_id` (PK, matches `^allura-`), `name`, `description`, `owner_agent_id`, `created_at`, `active`. Migration `33-tenant-registry.sql`. This is the source of truth for which tenants exist, not env vars.
- **22.2** Build tenant onboarding API — `POST /api/tenants` (admin-only) creates a new tenant: validates group_id format, inserts into `tenants` table, creates the default MCP profile association, and returns the tenant config. `GET /api/tenants` lists all active tenants. `GET /api/tenants/:group_id` returns tenant details.
- **22.3** Wire MCP profile ↔ tenant mapping — when an agent connects via `docker mcp gateway run --profile faithmeats`, the Allura Brain MCP server reads the `DEFAULT_GROUP_ID` env var and enforces it as the tenant. Add a startup check that validates the `DEFAULT_GROUP_ID` exists in the `tenants` table — fail closed if not.
- **22.4** Add tenant-scoped curator config — each tenant should be able to configure its own promotion threshold, auto-approval mode, and curator schedule. Store in `tenants` table as JSONB `config` column. The watchdog and content-aware curator read this config per-tenant instead of using global defaults.
- **22.5** Build profile export/import — document the workflow: `docker mcp profile export faithmeats ./faithmeats-profile.yaml` → commit to repo → new machine does `docker mcp profile import ./faithmeats-profile.yaml`. Add a README in `_bmad/bmm/planning/profiles/` documenting each profile, its tenant, and its tool restrictions.
- **22.6** Add cross-tenant audit — `GET /api/audit/cross-tenant` (admin-only) that verifies zero cross-tenant leakage: runs 100 random queries per tenant pair, confirms results are always empty for foreign tenants. This is the evidence gate for multi-tenant safety.

**Exit gate:**
- New project onboarding = `POST /api/tenants` + `docker mcp profile create` — under 5 minutes
- Every tenant has a registered `group_id`, owner, and config in the database
- MCP profiles enforce tool access per business context
- Cross-tenant audit proves zero leakage across all tenant pairs
- Profile export/import is documented and tested
- Evidence: a new tenant (`allura-test-enterprise`) is created, configured, and verified end-to-end
