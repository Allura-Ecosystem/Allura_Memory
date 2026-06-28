// Neo4j Schema Initialization for Allura Memory
// Applied on first startup via neo4j-init container
// Source: scripts/neo4j-memory-indexes.cypher

// Unique constraint on memory ID
CREATE CONSTRAINT memory_id_unique IF NOT EXISTS
FOR (m:Memory)
REQUIRE m.id IS UNIQUE;

// Index for group_id queries (tenant isolation)
CREATE INDEX memory_group_id_idx IF NOT EXISTS
FOR (m:Memory)
ON (m.group_id);

// Index for user_id queries
CREATE INDEX memory_user_id_idx IF NOT EXISTS
FOR (m:Memory)
ON (m.user_id);

// Index for created_at queries (sorting)
CREATE INDEX memory_created_at_idx IF NOT EXISTS
FOR (m:Memory)
ON (m.created_at);

// Index for deprecated queries (filter active memories)
CREATE INDEX memory_deprecated_idx IF NOT EXISTS
FOR (m:Memory)
ON (m.deprecated);

// Composite index for common queries
CREATE INDEX memory_group_user_idx IF NOT EXISTS
FOR (m:Memory)
ON (m.group_id, m.user_id, m.deprecated);

// Full-text search on memory content, summary, and title
CREATE FULLTEXT INDEX memory_search_index IF NOT EXISTS
FOR (m:Memory) ON EACH [m.content, m.summary, m.title];

// Index for SUPERSEDES relationships
CREATE INDEX relationship_supersedes_idx IF NOT EXISTS
FOR ()-[r:SUPERSEDES]-()
ON (r.created_at);

// Index for usage_count queries (popular memories)
CREATE INDEX memory_usage_count_idx IF NOT EXISTS
FOR (m:Memory)
ON (m.usage_count);

// Index for version-filtered queries
CREATE INDEX memory_version_idx IF NOT EXISTS
FOR (m:Memory)
ON (m.version);

// ── AC6: Tenant isolation constraints for Insight nodes ──────────────────────
// Added on feat/faithmeats-onboarding (Knuth, 2026-06-28).
//
// NOTE: This file is applied by the neo4j-init container on FIRST startup only.
// It does NOT apply to an already-running Neo4j instance automatically. To apply
// this constraint on a live database, run the Cypher statement manually via
// Neo4j Browser or cypher-shell:
//
//   CREATE CONSTRAINT unique_insight_per_tenant IF NOT EXISTS
//   FOR (n:Insight) REQUIRE (n.group_id, n.insight_id) IS UNIQUE;
//
// Also enforce that group_id is always present on Insight nodes (no orphan nodes):
//
//   CREATE CONSTRAINT insight_group_id_exists IF NOT EXISTS
//   FOR (n:Insight) REQUIRE n.group_id IS NOT NULL;
//
// Matching ADR §7.4 — every node must carry group_id; SUPERSEDES relationships
// must not cross tenants (both old and new node must share the same group_id).

CREATE CONSTRAINT unique_insight_per_tenant IF NOT EXISTS
FOR (n:Insight) REQUIRE (n.group_id, n.insight_id) IS UNIQUE;

CREATE CONSTRAINT insight_group_id_exists IF NOT EXISTS
FOR (n:Insight) REQUIRE n.group_id IS NOT NULL;