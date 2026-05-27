-- Seed test proposal for queue verification
INSERT INTO canonical_proposals (id, group_id, content, score, reasoning, tier, status, trace_ref, created_at)
VALUES (
  'test-proposal-' || extract(epoch from now())::bigint,
  'allura-system',
  'Test proposal for TALON queue verification. This is a synthetic proposal to verify the /dashboard/insights queue renders real data and actions work end-to-end.',
  0.72,
  'Synthetic proposal for TALON dashboard governance gap verification.',
  'emerging',
  'pending',
  'talons-trace-' || extract(epoch from now())::bigint,
  NOW()
);
