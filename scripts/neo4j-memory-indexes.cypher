// Neo4j Indexes for Allura Memory v1
// Canonical memory search optimization
// Reference: docs/allura/BLUEPRINT.md

// ============================================================================
// MEMORY NODE INDEXES
// ============================================================================

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

// ============================================================================
// FULL-TEXT SEARCH INDEX
// ============================================================================

// Full-text search on memory content
// Usage: CALL db.index.fulltext.queryNodes('memory_search_index', 'query')
CREATE FULLTEXT INDEX memory_search_index IF NOT EXISTS
FOR (m:Memory) ON EACH [m.content, m.summary, m.title];

// Full-text search on promoted Insight nodes (content and name)
// Required by Neo4jGraphAdapter.searchMemories() — without this index a fresh
// deploy throws "Index not found" and searchApprovedOnly returns empty results.
// Property list matches the live instance (SHOW INDEXES WHERE name='insight_search_index').
// Usage: CALL db.index.fulltext.queryNodes('insight_search_index', 'query')
CREATE FULLTEXT INDEX insight_search_index IF NOT EXISTS
FOR (i:Insight) ON EACH [i.content, i.name];

// ============================================================================
// SUPERSEDES RELATIONSHIP INDEXES
// ============================================================================

// NOTE: memory_deprecated_idx (above) already indexes :Memory.deprecated.
// A separate memory_superseded_idx would be a duplicate — removed 2026-04-18.

// Index for SUPERSEDES relationships
CREATE INDEX relationship_supersedes_idx IF NOT EXISTS
FOR ()-[r:SUPERSEDES]-()
ON (r.created_at);

// ============================================================================
// USAGE TRACKING INDEXES
// ============================================================================

// Index for usage_count queries (popular memories)
CREATE INDEX memory_usage_count_idx IF NOT EXISTS
FOR (m:Memory)
ON (m.usage_count);

// ============================================================================
// PROPERTY INDEXES FOR MEMORY FILTER/SORT PATHS
// ============================================================================

// Index for version-filtered queries
// Query: memory_get with version parameter — get.ts:26 "AND m.version = $version"
// Also benefits ORDER BY m.version DESC in history queries (get.ts:112,203)
// Note: version filter is optional (rare), but the index is low-cost since
// version cardinality equals memory count per topic_key (typically 1-5).
CREATE INDEX memory_version_idx IF NOT EXISTS
FOR (m:Memory)
ON (m.version);

// NOTE: m.tags does NOT get an index. Analysis shows tags appears only in
// RETURN clauses (canonical-tools.ts:618,779,1300,1653; search.ts:81,172,227;
// get.ts:49,111,202) — never in a WHERE filter. A property index accelerates
// predicates, not projections. Adding an index on tags would consume write
// overhead on every INSERT/UPDATE with zero read-path benefit.

// ============================================================================
// VERIFICATION QUERIES
// ============================================================================

// Verify all indexes exist
// Run this after creating indexes:
//
// SHOW INDEXES
// WHERE name IN [
//   'memory_id_unique',
//   'memory_group_id_idx',
//   'memory_user_id_idx',
//   'memory_created_at_idx',
//   'memory_deprecated_idx',
//   'memory_group_user_idx',
//   'memory_search_index',
//   'insight_search_index',
//   'relationship_supersedes_idx',
//   'memory_usage_count_idx',
//   'memory_version_idx'
// ];

// ============================================================================
// SAMPLE QUERIES
// ============================================================================

// Search memories by content
// CALL db.index.fulltext.queryNodes('memory_search_index', 'dark mode')
// YIELD node AS m, score
// WHERE m.group_id = 'allura-myproject' AND NOT (m)<-[:SUPERSEDES]-()
// RETURN m.id, m.content, m.score, score AS relevance
// ORDER BY relevance DESC, m.score DESC
// LIMIT 10;

// Get all memories for a user
// MATCH (m:Memory)
// WHERE m.group_id = 'allura-myproject'
//   AND m.user_id = 'user-1'
//   AND NOT (m)<-[:SUPERSEDES]-()
// RETURN m.id, m.content, m.created_at
// ORDER BY m.created_at DESC
// LIMIT 50;

// Get memory by ID
// MATCH (m:Memory)
// WHERE m.id = 'memory-uuid'
//   AND m.group_id = 'allura-myproject'
//   AND NOT (m)<-[:SUPERSEDES]-()
// RETURN m;

// Soft delete (mark as deprecated)
// MATCH (m:Memory)
// WHERE m.id = 'memory-uuid'
//   AND m.group_id = 'allura-myproject'
// SET m.deprecated = true,
//     m.deleted_at = datetime()
// RETURN m;

// Create new version with SUPERSEDES
// MATCH (old:Memory {id: 'old-memory-id'})
// CREATE (new:Memory {
//   id: 'new-memory-id',
//   group_id: old.group_id,
//   user_id: old.user_id,
//   content: 'updated content',
//   score: 0.95,
//   created_at: datetime(),
//   deprecated: false
// })
// CREATE (new)-[:SUPERSEDES]->(old)
// SET old.deprecated = true
// RETURN new;