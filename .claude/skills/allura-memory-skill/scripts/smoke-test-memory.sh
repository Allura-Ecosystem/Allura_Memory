#!/bin/bash
# smoke-test-memory.sh — Quick smoke test for Allura Brain memory operations
# Uses direct Docker access for health checks; for memory operations, use MCP tools: allura-brain_memory_*

set -e

echo "=== Allura Brain Smoke Test ==="

# Test PostgreSQL
echo "Testing PostgreSQL..."
PG_COUNT=$(docker exec knowledge-postgres psql -U ronin4life -d memory -t -c "SELECT count(*) FROM allura_memories;" 2>/dev/null | tr -d ' ')
echo "  PG memories: $PG_COUNT"

# Test semantic layer (PostgreSQL graph_memories / graph_supersedes)
echo "Testing semantic layer..."
GM_COUNT=$(docker exec knowledge-postgres psql -U ronin4life -d memory -t -c "SELECT count(*) FROM graph_memories;" 2>/dev/null | tr -d ' ')
echo "  graph_memories rows: $GM_COUNT"
GS_COUNT=$(docker exec knowledge-postgres psql -U ronin4life -d memory -t -c "SELECT count(*) FROM graph_supersedes;" 2>/dev/null | tr -d ' ')
echo "  graph_supersedes edges: $GS_COUNT"

# Test RuVector (pgvector in the same PostgreSQL instance)
echo "Testing RuVector..."
VEC_EXT=$(docker exec knowledge-postgres psql -U ronin4life -d memory -t -c "SELECT count(*) FROM pg_extension WHERE extname IN ('vector','ruvector');" 2>/dev/null | tr -d ' ')
echo "  vector extensions installed: $VEC_EXT"

# Test Ollama
echo "Testing Ollama..."
if curl -s http://localhost:11434/api/tags | grep -q qwen3; then
  echo "  ✅ qwen3-embedding:8b available"
else
  echo "  ❌ qwen3-embedding:8b not found in Ollama"
fi

# Test MCP server (if accessible)
echo "Testing MCP HTTP gateway..."
if curl -s http://localhost:3201/ready 2>/dev/null | grep -q "ok\|ready\|healthy"; then
  echo "  ✅ HTTP gateway responding"
else
  echo "  ⚠️  HTTP gateway not responding (may not be mapped to host)"
fi

echo ""
echo "=== Done ==="