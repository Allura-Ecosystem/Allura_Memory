/**
 * P0 Indexes for Dashboard Performance
 *
 * Created: 2026-05-23
 * Purpose: Optimize governance log and curator queue queries
 *
 * Index 1: Policy enforcement checks on events table
 * - Used by: /api/audit/events when filtering by event_type and date range
 * - Query pattern: SELECT * FROM events WHERE group_id = ? AND event_type = ? AND created_at >= ?
 * - Eliminates N+1 queries and seq scans
 *
 * Index 2: Curator queue sorting on canonical_proposals table
 * - Used by: /api/curator/proposals for queue pagination and sorting
 * - Query pattern: SELECT * FROM canonical_proposals WHERE group_id = ? AND status = ? ORDER BY score DESC
 * - Covering index eliminates heap lookups
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- Index 1: Policy Enforcement Events
-- ─────────────────────────────────────────────────────────────────────────────
-- Composite index: (group_id, event_type, created_at DESC)
-- Used for policy event queries with date filtering
-- Estimated: 9ms → 1ms on filtered queries (group_id + event_type + date range)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_policy_enforcement
ON events (group_id, event_type, created_at DESC)
WHERE status IS NOT NULL
AND event_type IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Index 2: Curator Queue Optimization
-- ─────────────────────────────────────────────────────────────────────────────
-- Covering index: (group_id, status, score DESC) INCLUDE (...)
-- Used for curator proposal queue pagination
-- Estimated: 15ms → 2ms on large queue queries (with score-based sorting)

-- PostgreSQL 12+ allows INCLUDE clause for covering indexes
-- This index includes commonly accessed columns to avoid heap lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_canonical_proposals_queue
ON canonical_proposals (group_id, status, score DESC)
INCLUDE (id, created_at, decided_at, tier)
WHERE status IN ('pending', 'approved', 'rejected');

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────────────────────────
-- Run after migration to verify indexes are created:
-- SELECT schemaname, tablename, indexname FROM pg_indexes
-- WHERE tablename IN ('events', 'canonical_proposals')
-- AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
