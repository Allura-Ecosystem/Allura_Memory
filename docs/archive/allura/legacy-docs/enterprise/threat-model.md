# Allura Threat Model

## Assets

1. **Episodic memories** — append-only event log in PostgreSQL
2. **Canonical memories** — promoted knowledge nodes in `graph_memories`
3. **Governance policies** — 25 policies across 5 families
4. **MCP tokens** — HMAC-signed per-caller credentials
5. **Audit trail** — immutable events table

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Internet → Cloudflare Tunnel | CF Access (service token or OAuth) |
| Tunnel → MCP Gateway | Bearer token authentication |
| MCP Gateway → Application | Principal context authorization |
| Application → PostgreSQL | RLS-enforced tenant isolation |
| PostgreSQL → Data | Row-level security policies |

## Actors

| Actor | Role | Access |
|-------|------|--------|
| Curator | Human reviewer | approve/reject proposals, read memories |
| Admin | Platform owner | all operations, policy management |
| Viewer | Read-only consumer | search, read memories |
| Agent (MCP token) | Service identity | scoped by token permissions |
| Dev local | Development | wildcard tenant, dev mode only |

## Attack Trees

### 1. Prompt/Tool Injection
- **Vector**: Malicious content in memory_add or external tool results
- **Mitigation**: Tool arguments are selectors, never authority. Content is data, not code.
- **Status**: Implemented — `PrincipalContext` is frozen and tool args cannot mutate it.

### 2. Memory Poisoning
- **Vector**: High-confidence but false memories promoted to canonical store
- **Mitigation**: HITL promotion gate (POL-004), atomic approval with segregation of duties
- **Status**: Implemented — Story 24.4 atomic promotion

### 3. Cross-Tenant Access
- **Vector**: Agent queries wrong `group_id` or bypasses tenant filter
- **Mitigation**: RLS on 37 tables, `group_id` CHECK constraint, server-enforced isolation
- **Status**: Implemented — Story 24.3

### 4. Role Forgery
- **Vector**: Caller supplies `curator_id` or `role` in tool arguments
- **Mitigation**: Roles come from verified `PrincipalContext` only; tool args are selectors
- **Status**: Implemented — Story 24.2

### 5. Evidence Tampering
- **Vector**: Modify or delete audit events
- **Mitigation**: Append-only events table, RLS denies UPDATE/DELETE for app role
- **Status**: Implemented — Story 24.3, break-glass role for documented emergencies only

### 6. Replay Abuse
- **Vector**: Replay a valid MCP request to duplicate side effects
- **Mitigation**: Idempotency keys on promotion, deterministic replay comparison
- **Status**: Implemented — Story 24.4 idempotency, Story 24.5 receipt comparison

### 7. Dependency Compromise
- **Vector**: Supply chain attack on npm packages
- **Mitigation**: `bun.lockb` pinning, audit dependencies
- **Status**: Partial — lockfile pinning in place, no automated SBOM yet

### 8. Denial of Service
- **Vector**: Flood MCP gateway with requests
- **Mitigation**: Budget circuit breakers, rate limiting
- **Status**: Implemented — budget enforcement in canonical-tools.ts