# Allura Hosted Platform — Deployment

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

Anchor: [BLUEPRINT.md](./BLUEPRINT.md) (F28–F30). Related: [BACKUP-RESTORE.md](./BACKUP-RESTORE.md).

## Topology

Docker Compose stack:

| Service | Role | Port |
|---------|------|------|
| PostgreSQL 16 | Episodic memory + vector (RuVector) | 5432 / 5433 |
| Neo4j 5.26 | Semantic knowledge | 7687 |
| Allura Brain (MCP) | Streamable HTTP gateway | 5888 |
| Command Center (Next.js) | Control plane UI | 4000+ (3000–3999 band banned) |
| API | REST + OpenAPI | 6000+ |

Runtime/package manager: **Bun only** (npm/npx banned per repo policy).

## First-Run

```bash
bun install
bun run brain:up          # start PG + Neo4j + MCP
bun run brain:status      # health check
bun run dev               # Command Center (ALLURA_DASHBOARD_PORT, default 3100 — to be moved to 4000+ band)
```

> Known gap (tracked): a one-line first-run script must auto-create the shared Docker network + volumes so a fresh machine succeeds on first `up`. Until then, networks/volumes marked `external:true` must be pre-created.

## `allura doctor` (F28)

Validates a local agent's MCP connection: token validity, `/mcp` reachability, required `Accept` header, scope sanity, and a round-trip `memory_search`.

## Observability (F30)

- Sentry for error tracking; OpenTelemetry traces across Gateway → Bumblebee → Engine.
- Quotas per workspace; billing deferred.

## Environment & Secrets

- All credentials via environment variables; never hardcoded.
- Different configs for dev/staging/prod; validate required config on startup.

## Ports (AD-45)

3000–3999 band is banned. UI 4000+, API 6000+, tools 7000+. Infra exempt (PG 5432, Neo4j 7687, Brain 5888).

## References

- [BACKUP-RESTORE.md](./BACKUP-RESTORE.md) · [SECURITY.md](./SECURITY.md)
