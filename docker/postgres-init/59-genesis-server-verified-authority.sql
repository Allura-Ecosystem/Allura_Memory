-- Migration 59: make signed Genesis provenance an owner-only server boundary.
--
-- PostgreSQL does not hold the evidence HMAC key.  Consequently it must never
-- accept a caller-selected JTI/digest as proof.  The trusted server verifies the
-- signed evidence, then invokes this owner-only SECURITY DEFINER transaction to
-- durably bind the verified principal, tenant, target, digest, JTI, and proposal.
BEGIN;

CREATE TABLE IF NOT EXISTS public.genesis_verified_claims (
  jti UUID PRIMARY KEY,
  group_id TEXT NOT NULL,
  principal TEXT NOT NULL CHECK (length(trim(principal)) > 0),
  canonical_target TEXT NOT NULL CHECK (canonical_target = 'pg:pattern_proposals'),
  mutation_digest TEXT NOT NULL CHECK (mutation_digest ~ '^[0-9a-f]{64}$'),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.genesis_verified_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genesis_verified_claims FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS genesis_verified_claims_tenant_read ON public.genesis_verified_claims;
CREATE POLICY genesis_verified_claims_tenant_read
  ON public.genesis_verified_claims FOR SELECT TO allura_app
  USING (group_id = current_setting('app.current_group_id', true));
DROP POLICY IF EXISTS genesis_verified_claims_trusted_insert ON public.genesis_verified_claims;
CREATE POLICY genesis_verified_claims_trusted_insert
  ON public.genesis_verified_claims FOR INSERT
  WITH CHECK (current_setting('app.genesis_verified_writer', true) = 'trusted');

CREATE OR REPLACE FUNCTION public.fn_genesis_verified_claims_append_only_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'genesis_verified_claims is append-only' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS trg_genesis_verified_claims_no_update ON public.genesis_verified_claims;
CREATE TRIGGER trg_genesis_verified_claims_no_update
  BEFORE UPDATE OR DELETE ON public.genesis_verified_claims
  FOR EACH ROW EXECUTE FUNCTION public.fn_genesis_verified_claims_append_only_guard();
DROP TRIGGER IF EXISTS trg_genesis_verified_claims_no_truncate ON public.genesis_verified_claims;
CREATE TRIGGER trg_genesis_verified_claims_no_truncate
  BEFORE TRUNCATE ON public.genesis_verified_claims
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_genesis_verified_claims_append_only_guard();

-- The legacy function has no cryptographic verifier and is never an app API.
REVOKE ALL ON FUNCTION app.consume_genesis_evidence_and_insert(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,NUMERIC,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.consume_genesis_evidence_and_insert(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,NUMERIC,TEXT) FROM allura_app;

-- Generic app DML cannot synthesize a Genesis proposal.  Reads and the existing
-- HITL review path retain their separately governed database privileges.
REVOKE INSERT ON TABLE public.pattern_proposals FROM allura_app;
DROP POLICY IF EXISTS genesis_verified_proposal_writer ON public.pattern_proposals;
CREATE POLICY genesis_verified_proposal_writer ON public.pattern_proposals FOR INSERT
  WITH CHECK (current_setting('app.genesis_verified_writer', true) = 'trusted');
REVOKE ALL ON TABLE public.genesis_verified_claims FROM PUBLIC;
REVOKE ALL ON TABLE public.genesis_verified_claims FROM allura_app;

CREATE OR REPLACE FUNCTION app.persist_verified_genesis_proposal(
  p_jti UUID,
  p_group_id TEXT,
  p_principal TEXT,
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
  -- This function is executable only by its owner/trusted server role.  The
  -- local markers satisfy FORCE RLS for its append-only audit writes; they are
  -- not authentication because no application role receives table/function DML.
  PERFORM set_config('app.genesis_verified_writer', 'trusted', true);
  PERFORM set_config('app.genesis_evidence_writer', 'trusted', true);

  IF p_target IS DISTINCT FROM 'pg:pattern_proposals'
     OR p_mutation_digest !~ '^[0-9a-f]{64}$'
     OR p_principal IS NULL
     OR length(trim(p_principal)) = 0 THEN
    RAISE EXCEPTION 'verified Genesis claim binding is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_status IS DISTINCT FROM 'proposed' THEN
    RAISE EXCEPTION 'Genesis evidence may only create proposed rows' USING ERRCODE = '42501';
  END IF;

  -- The unique JTI spans the durable verified-claim audit, replay ledger, and
  -- proposal insert in this single transaction. Any replay or altered binding
  -- aborts before the target row can be created.
  INSERT INTO public.genesis_verified_claims
    (jti,group_id,principal,canonical_target,mutation_digest)
  VALUES
    (p_jti,p_group_id,p_principal,p_target,p_mutation_digest);

  INSERT INTO public.genesis_evidence_consumptions
    (jti,group_id,canonical_target,mutation_digest)
  VALUES
    (p_jti,p_group_id,p_target,p_mutation_digest);

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

ALTER FUNCTION app.persist_verified_genesis_proposal(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,NUMERIC,TEXT) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.persist_verified_genesis_proposal(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,NUMERIC,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.persist_verified_genesis_proposal(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,NUMERIC,TEXT) FROM allura_app;

COMMENT ON TABLE public.genesis_verified_claims IS
  'Append-only owner-only audit: trusted server verified the signed Genesis evidence before binding this JTI, principal, group, target, and digest to proposal persistence.';
COMMENT ON FUNCTION app.persist_verified_genesis_proposal(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,NUMERIC,TEXT) IS
  'Owner-only server boundary after HMAC verification; allura_app has no EXECUTE grant and cannot create Genesis pattern proposals directly.';

INSERT INTO schema_versions(version,applied_at,description)
VALUES ('059',NOW(),'Owner-only verified Genesis claim and proposal authority')
ON CONFLICT(version) DO NOTHING;
COMMIT;
