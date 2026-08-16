-- ============================================================================
-- Migration: 768d → 4096d embedding upgrade (nomic-embed-text → qwen3-embedding:8b)
-- ============================================================================
--
-- GUARD: This migration only applies when allura_memories exists (RuVector-enabled).
-- On standard PostgreSQL CI, allura_memories is not created because the ruvector
-- type is unavailable. Skip gracefully with a notice.
--
-- Uses pgvector (vector type).
-- pgvector 0.8.2 has a 2000-dimension limit for HNSW/IVFFlat indexes.
-- For 4096d vectors, we skip vector indexes and rely on brute-force scan
-- (acceptable for <1000 rows). Upgrade to pgvector 0.8.4+ to enable
-- HNSW indexing for dimensions > 2000.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'allura_memories') THEN

    -- 1. Drop existing HNSW index on the `embedding` column so the column type
    --    can be widened past pgvector's 2000d HNSW limit. Migration 16 names
    --    this index `allura_mem_hnsw` (not `allura_mem_embedding_hnsw` — this
    --    migration never actually dropped it before, since the DROP INDEX name
    --    didn't match and allura_memories was never created for this branch to
    --    run against until the migration 16 guard was fixed to check for the
    --    pgvector `vector` type instead of a nonexistent `ruvector` type).
    DROP INDEX IF EXISTS allura_mem_hnsw;

    -- 2. Alter the embedding column from vector(768) to vector(4096)
    --    Existing embeddings are incompatible (wrong dimension) → NULL them out.
    --    They will be re-embedded by the embedding-backfill-worker.
    ALTER TABLE allura_memories
      ALTER COLUMN embedding TYPE vector(4096)
      USING NULL;

    RAISE NOTICE 'Migration 22: allura_memories embedding column upgraded to vector(4096)';

  ELSE
    RAISE NOTICE 'Migration 22: Skipping — allura_memories table does not exist (standard PG instance without RuVector)';
  END IF;
END $$;

-- NOTE: No vector index is created here. With <1000 rows, brute-force
-- cosine distance scan is fast enough. Once pgvector is upgraded to 0.8.4+,
-- add: CREATE INDEX allura_mem_embedding_hnsw ON allura_memories USING hnsw (embedding vector_cosine_ops);