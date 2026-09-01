-- Migration 58: transactionally consume canonical Genesis evidence before proposal persistence.
-- The ledger is append-only: an evidence JTI can be recorded once, and the
-- same transaction creates the target row. Application roles may only EXECUTE
-- the narrow definer function; they receive no table privileges.
BEGIN;

CREATE TABLE IF NOT EXISTS public.genesis_evidence_consumptions (
  jti UUID PRIMARY KEY,
  group_id TEXT NOT NULL,
  canonical_target TEXT NOT NULL CHECK (canonical_target = 'pg:pattern_proposals'),
  mutation_digest TEXT NOT NULL CHECK (mutation_digest ~ '^[0-9a-f]{64}$'),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.genesis_evidence_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genesis_evidence_consumptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS genesis_evidence_consumptions_tenant_read ON public.genesis_evidence_consumptions;
CREATE POLICY genesis_evidence_consumptions_tenant_read
  ON public.genesis_evidence_consumptions FOR SELECT
  USING (group_id = current_setting('app.current_group_id', true));
CREATE POLICY genesis_evidence_consumptions_definer_insert
  ON public.genesis_evidence_consumptions FOR INSERT
  WITH CHECK (current_setting('app.genesis_evidence_writer', true) = 'trusted');
REVOKE ALL ON public.genesis_evidence_consumptions FROM PUBLIC;
REVOKE ALL ON public.genesis_evidence_consumptions FROM allura_app;

CREATE OR REPLACE FUNCTION app.consume_genesis_evidence_and_insert(
  p_jti UUID,
  p_group_id TEXT,
  p_target TEXT,
  p_mutation_digest TEXT,
  p_pattern_description TEXT,
  p_pattern_type TEXT,
  p_frequency INTEGER,
  p_suggested_skill TEXT,
  p_confidence NUMERIC,
  p_status TEXT
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  proposal_id BIGINT;
BEGIN
  -- This local marker is visible only inside this SECURITY DEFINER transaction.
  -- Direct table INSERT remains impossible because all application privileges
  -- are revoked, while FORCE RLS still constrains the definer path.
  PERFORM set_config('app.genesis_evidence_writer', 'trusted', true);
  IF p_target IS DISTINCT FROM 'pg:pattern_proposals' OR p_mutation_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Genesis evidence binding is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_status IS DISTINCT FROM 'proposed' THEN
    RAISE EXCEPTION 'Genesis evidence may only create proposed rows' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.genesis_evidence_consumptions(jti,group_id,canonical_target,mutation_digest)
  VALUES (p_jti,p_group_id,p_target,p_mutation_digest);

  INSERT INTO public.pattern_proposals
    (group_id,pattern_description,pattern_type,frequency,suggested_skill,confidence,status)
  VALUES
    (p_group_id,p_pattern_description,p_pattern_type,p_frequency,p_suggested_skill,p_confidence,p_status)
  RETURNING id INTO proposal_id;
  RETURN proposal_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Genesis evidence JTI has already been consumed' USING ERRCODE = '23505';
END;
$$;

ALTER FUNCTION app.consume_genesis_evidence_and_insert(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,NUMERIC,TEXT) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.consume_genesis_evidence_and_insert(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_genesis_evidence_and_insert(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,NUMERIC,TEXT) TO allura_app;

INSERT INTO schema_versions(version,applied_at,description)
VALUES ('058',NOW(),'Genesis evidence canonical target/digest replay ledger')
ON CONFLICT(version) DO NOTHING;
COMMIT;
