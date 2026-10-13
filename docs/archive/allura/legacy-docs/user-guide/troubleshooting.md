# Troubleshooting

> Common issues and diagnostics for Allura Memory.

## Quick Diagnostics

Run these checks in order:

```bash
# 1. Docker services running?
docker compose ps

# 2. MCP gateway healthy?
curl http://localhost:3201/health

# 3. PostgreSQL ready?
docker exec knowledge-postgres pg_isready -U $POSTGRES_USER -d memory

# 4. Neo4j responding?
curl -s http://localhost:7474 | jq .neo4j_version

# 5. Ollama running?
curl http://localhost:11434/api/tags

# 6. Allura tests pass?
bun test
```

## Connection Issues

### `Connection refused` on port 3201

**Cause:** MCP HTTP gateway not started or crashed.

**Fix:**
```bash
docker compose up -d mcp
docker logs allura-mcp-gateway
curl http://localhost:3201/health
```

### `tools/list` returns empty

**Cause:** MCP server not registered or failed to initialize.

**Fix:**
```bash
# Check server file exists
ls src/mcp/memory-server-canonical.ts

# Check Bun can run it
bun src/mcp/memory-server-canonical.ts --help

# Check Docker logs
docker logs allura-mcp-gateway
```

### PostgreSQL auth fails

**Cause:** Credentials in `.env` don't match `docker-compose.yml`.

**Fix:**
```bash
# Check .env values
cat .env | grep POSTGRES

# Check docker-compose values
cat docker-compose.yml | grep POSTGRES

# Reset PostgreSQL container (WARNING: destroys data)
docker compose down postgres
docker volume rm allura-memory_postgres_data
docker compose up -d postgres
```

### Neo4j connection fails

**Cause:** Neo4j still initializing or wrong credentials.

**Fix:**
```bash
# Wait 30s after docker compose up
sleep 30

# Check Neo4j logs
docker logs knowledge-neo4j

# Test with cypher-shell
docker exec knowledge-neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "RETURN 1 AS test"
```

## Memory Issues

### `group_id` errors

**Cause:** Missing or invalid `group_id` parameter.

**Fix:**
- Every memory operation requires `group_id`
- Pattern must match: `^allura-[a-z0-9-]+$`
- Examples: `allura-myteam`, `allura-project-x`, `allura-system`

### Memories not appearing in search

**Cause:**
1. Memory still in episodic layer (not yet promoted)
2. Wrong `group_id` or `user_id`
3. Embedding not yet generated

**Fix:**
```bash
# Check if memory exists in PostgreSQL
bun run mcp:http  # or query directly via MCP_DOCKER tools

# Run embedding backfill
bun run backfill:embeddings

# Check promotion queue
bun run curator:run
```

### Curator queue is empty

**Cause:** No memories scored above threshold, or curator already processed.

**Fix:**
```bash
# Run curator to score new memories
bun run curator:run

# Check pending proposals
# (use MCP memory_list with appropriate filters)
```

## Performance Issues

### Slow memory search

**Cause:** Missing indexes, large unembedded corpus, or Neo4j overload.

**Fix:**
```bash
# Check pgvector indexes
# (verify HNSW index exists on embedding column)

# Run embedding backfill
bun run backfill:embeddings

# Check Neo4j memory usage
docker stats knowledge-neo4j
```

### High memory usage

**Cause:** Neo4j graph bloat from duplicate promotions (RK-01).

**Fix:**
- Review curator settings to reduce duplicate promotions
- Monitor `RK-01` in risk register
- Consider periodic graph maintenance

## Plugin Issues

### Plugin install fails

**Cause:** Wrong directory structure or missing manifest.

**Fix:**
```bash
# Validate plugin structure
python3 plugins/allura-cowork/scripts/validate_plugin.py plugins/allura-cowork

# Check manifest exists
ls plugins/<name>/.codex-plugin/plugin.json
ls plugins/<name>/.claude-plugin/plugin.json
```

### Governance plugin not blocking violations

**Cause:** Hooks not wired correctly.

**Fix:**
```bash
# Check hooks.json exists and is valid
ls plugins/allura-governance/hooks/hooks.json

# Reinstall plugin
claude plugin install ./plugins/allura-governance
codex plugin install ./plugins/allura-governance
```

## Getting Help

1. **Check this guide** — most issues are covered above
2. **Check [`catalog/examples.md`](../../catalog/examples.md)** — verification snippets
3. **Check [`docs/allura/RISKS-AND-DECISIONS.md`](../allura/RISKS-AND-DECISIONS.md)** — known risks and mitigations
4. **Run diagnostics:** `bun run test:all`
5. **Review logs:** `docker logs <container_name>`

## Reporting Issues

When reporting an issue, include:

1. Output of the 6 quick diagnostics commands above
2. Your `.env` file (redact passwords)
3. Docker Compose logs: `docker compose logs > logs.txt`
4. Steps to reproduce
5. Expected vs actual behavior

---

*For the full API reference, see [`docs/reference/mcp-tools.md`](../reference/mcp-tools.md). For examples, see [`catalog/examples.md`](../../catalog/examples.md).*
