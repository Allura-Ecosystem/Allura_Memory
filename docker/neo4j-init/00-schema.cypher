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

// Full-text search on promoted Insight nodes (content and name)
// Required by Neo4jGraphAdapter.searchMemories() — without this index a fresh
// deploy throws "Index not found" and searchApprovedOnly returns empty results.
// Property list matches the live instance (SHOW INDEXES WHERE name='insight_search_index').
// Usage: CALL db.index.fulltext.queryNodes('insight_search_index', 'query')
CREATE FULLTEXT INDEX insight_search_index IF NOT EXISTS
FOR (i:Insight) ON EACH [i.content, i.name];

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