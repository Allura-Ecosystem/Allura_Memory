-- AD-71 CANDIDATE ONLY; deliberately outside automatic database initialization.
-- No permitted live write adapter exists. Do not execute manually or on a shared DB.
-- A future verified adapter must own the transaction, verify Docker/database
-- identity, and bind this exact expected database. The setting alone is NOT
-- ownership proof. Missing adapter/target evidence blocks execution.
DO $$
DECLARE
  expected_database text := current_setting('allura.first_use.expected_database', true);
  original_type text;
  parallel_type text;
BEGIN
  IF expected_database IS NULL OR expected_database !~ '^allura_first_use_[a-z0-9]{12}$'
     OR current_database() IS DISTINCT FROM expected_database THEN
    RAISE EXCEPTION 'Verified exact trial database binding required';
  END IF;

  LOCK TABLE public.allura_memories IN ACCESS EXCLUSIVE MODE;
  -- An RLS-filtered empty result cannot establish that the table is empty.
  -- This refuses restricted visibility; it does not disable RLS or grant it.
  IF pg_catalog.row_security_active('public.allura_memories'::regclass) THEN
    RAISE EXCEPTION 'Unrestricted authorized schema visibility required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.allura_memories LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing alignment of a nonempty trial table';
  END IF;

  SELECT format_type(atttypid, atttypmod) INTO original_type
    FROM pg_attribute WHERE attrelid = 'public.allura_memories'::regclass
      AND attname = 'embedding' AND NOT attisdropped;
  SELECT format_type(atttypid, atttypmod) INTO parallel_type
    FROM pg_attribute WHERE attrelid = 'public.allura_memories'::regclass
      AND attname = 'embedding_1024' AND NOT attisdropped;
  IF original_type IS DISTINCT FROM 'vector(4096)' OR parallel_type IS DISTINCT FROM 'vector(1024)' THEN
    RAISE EXCEPTION 'Unexpected empty-schema state; explicit review required';
  END IF;
  IF to_regclass('public.allura_mem_hnsw') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected original index; do not drop or reuse it';
  END IF;

  -- Current init migration 22 changes the active column to 4096; the actual
  -- client writes 1024. This branch accepts only the known EMPTY schema.
  ALTER TABLE public.allura_memories ALTER COLUMN embedding TYPE vector(1024);
  CREATE INDEX allura_mem_hnsw ON public.allura_memories
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL AND deleted_at IS NULL;
END
$$;
-- Re-entry after successful alignment is deliberately refused, not normalized.
-- No row overwrite, null rewrite, index drop, grant or shared migration change.
