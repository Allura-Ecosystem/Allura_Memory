# Docker MCP Profiles — Allura Memory Tenant Configuration

This directory contains exported Docker MCP profiles for each Allura Memory tenant.
Each profile defines the MCP servers, tools, and secrets available to agents in that tenant.

## Profiles

### `openclaw.yaml` — OpenClaw (System Tenant)

- **Tenant:** `allura-system`
- **Purpose:** General-purpose system tenant for OpenClaw operations, infrastructure, and platform development.
- **Servers:**
  - `tavily` — Web search and content extraction (tavily_search, tavily_extract, tavily_crawl, tavily_map, tavily_research)
  - `exa` — Web search and page fetching (web_search_exa, web_fetch_exa)
  - `context7` — Library documentation lookup (resolve-library-id, get-library-docs)
  - `notion-remote` — Notion workspace management (remote, OAuth)
- **Secrets:** `TAVILY_API_KEY`, `EXA_API_KEY`, `NOTION_REMOTE_PERSONAL_ACCESS_TOKEN`
- **Restrictions:** Full tool access — this is the system tenant with no restrictions beyond standard group_id enforcement.

### `faithmeats.yaml` — Faith Meats

- **Tenant:** `allura-faithmeats`
- **Purpose:** Halal meat processing business tenant. Agents handle business operations, compliance, and supply chain.
- **Servers:**
  - `tavily` — Web search for compliance, supplier research, and market data
  - `exa` — Web search and content extraction
  - `context7` — Documentation lookup (remote, streamable-http)
  - `github-official` — GitHub repository management (issues, PRs, branches, files)
- **Secrets:** `TAVILY_API_KEY`, `EXA_API_KEY`, `CONTEXT7_API_KEY`, `GITHUB_PERSONAL_ACCESS_TOKEN`
- **Restrictions:** Scoped to `allura-faithmeats` group_id. Cannot access `allura-system` or other tenant memories.

### `difference-driven.yaml` — Difference Driven (Nonprofit)

- **Tenant:** `allura-difference-driven`
- **Purpose:** Nonprofit organization tenant for community organizing, grant management, and social impact work.
- **Servers:**
  - `tavily` — Web search for grant research, community resources, and policy information
  - `notion-remote` — Notion workspace for project management and documentation
- **Secrets:** `TAVILY_API_KEY`, `NOTION_REMOTE_PERSONAL_ACCESS_TOKEN`
- **Restrictions:** Scoped to `allura-difference-driven` group_id. Conservative curator settings (higher promotion threshold). No GitHub access — nonprofit agents don't write code.

### `coding.yaml` — Coding Profile

- **Tenant:** `allura-coding`
- **Purpose:** Software development tenant for code generation, review, and technical documentation.
- **Servers:**
  - `context7` — Library documentation (remote, streamable-http)
  - `github-official` — GitHub repository management (issues, PRs, branches, files, code review)
  - `filesystem` — Local filesystem access for code reading and writing
- **Secrets:** `CONTEXT7_API_KEY`, `GITHUB_PERSONAL_ACCESS_TOKEN`
- **Restrictions:** Scoped to `allura-coding` group_id. Aggressive auto-approval mode (lower promotion threshold) since code artifacts are high-volume.

## Export Commands

To re-export profiles (e.g., after adding a new MCP server):

```bash
docker mcp profile export openclaw ./_bmad/bmm/planning/profiles/openclaw.yaml
docker mcp profile export faithmeats ./_bmad/bmm/planning/profiles/faithmeats.yaml
docker mcp profile export difference-driven ./_bmad/bmm/planning/profiles/difference-driven.yaml
docker mcp profile export coding ./_bmad/bmm/planning/profiles/coding.yaml
```

## Import Commands

To import a profile on a new machine:

```bash
docker mcp profile import ./_bmad/bmm/planning/profiles/openclaw.yaml
docker mcp profile import ./_bmad/bmm/planning/profiles/faithmeats.yaml
docker mcp profile import ./_bmad/bmm/planning/profiles/difference-driven.yaml
docker mcp profile import ./_bmad/bmm/planning/profiles/coding.yaml
```

## New Machine Onboarding

To onboard a new machine to Allura Memory:

1. **Install Docker Desktop** (includes Docker MCP support)
2. **Import the required profile(s):**
   ```bash
   # For a system/ops machine:
   docker mcp profile import ./_bmad/bmm/planning/profiles/openclaw.yaml

   # For a Faith Meats machine:
   docker mcp profile import ./_bmad/bmm/planning/profiles/faithmeats.yaml
   ```
3. **Set the `DEFAULT_GROUP_ID` environment variable** to match the tenant:
   ```bash
   export DEFAULT_GROUP_ID=allura-system  # or allura-faithmeats, etc.
   ```
4. **Start the Allura Memory gateway:**
   ```bash
   bun run dev  # or: bun run start
   ```
5. **Verify tenant registration** (the server validates `DEFAULT_GROUP_ID` against the `tenants` table at startup — see Story 22.3):
   ```bash
   # If the tenant isn't registered, the server will fail closed with:
   # "DEFAULT_GROUP_ID 'allura-xxx' is not a registered tenant. Run POST /api/tenants to register."
   ```
6. **Register the tenant if needed** (Story 22.2):
   ```bash
   curl -X POST http://localhost:5888/api/tenants \
     -H "Content-Type: application/json" \
     -d '{"group_id":"allura-newtenant","name":"New Tenant","owner_agent_id":"admin"}'
   ```

## Cross-References

- **Tenant Registry (Story 22.1):** The `tenants` table in PostgreSQL is the source of truth for registered tenants. See `src/lib/config/tenant-existence.ts`.
- **Tenant Onboarding API (Story 22.2):** `POST /api/tenants` creates new tenants. See `src/app/api/tenants/route.ts`.
- **Startup Validation (Story 22.3):** The MCP server validates `DEFAULT_GROUP_ID` at startup. See `src/lib/config/tenant-validator.ts`.
- **Tenant-Scoped Curator Config (Story 22.4):** Per-tenant curator settings. See `src/lib/config/tenant-config.ts`.
- **Cross-Tenant Audit (Story 22.6):** `GET /api/audit/cross-tenant` verifies zero leakage. See `src/app/api/audit/cross-tenant/route.ts`.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-27 | Initial profile exports + README | Gilliam |