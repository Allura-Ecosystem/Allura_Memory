-- Seed policy enforcement events for dashboard testing
-- Run via: docker exec -i knowledge-postgres psql -U ronin4life -d memory < seed-policy-events.sql

INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
VALUES
  ('allura-system', 'policy_check', 'troy-curator', 'completed', '{"rule": "Tenant namespace", "group_id": "allura-system", "allowed": true}'::jsonb, NOW() - INTERVAL '5 minutes'),
  ('allura-system', 'policy_check', 'troy-curator', 'completed', '{"rule": "Agent identity", "user_id": "troy-curator", "allowed": true}'::jsonb, NOW() - INTERVAL '10 minutes'),
  ('allura-system', 'policy_violation', 'anonymous-bot', 'failed', '{"rule": "Tenant namespace", "reason": "Missing required group_id", "allowed": false}'::jsonb, NOW() - INTERVAL '15 minutes'),
  ('allura-system', 'policy_check', 'memory-architect', 'completed', '{"rule": "Approval audit", "group_id": "allura-system", "allowed": true}'::jsonb, NOW() - INTERVAL '20 minutes'),
  ('allura-system', 'policy_violation', 'rogue-agent', 'failed', '{"rule": "Agent identity", "reason": "user_id mismatch or missing", "allowed": false}'::jsonb, NOW() - INTERVAL '25 minutes'),
  ('allura-system', 'policy_check', 'troy-curator', 'completed', '{"rule": "Curator tiers", "score": 0.85, "allowed": true}'::jsonb, NOW() - INTERVAL '30 minutes'),
  ('allura-system', 'policy_check', 'troy-curator', 'completed', '{"rule": "Tenant namespace", "group_id": "allura-memory", "allowed": true}'::jsonb, NOW() - INTERVAL '35 minutes'),
  ('allura-system', 'policy_violation', 'anonymous-bot', 'failed', '{"rule": "Tenant namespace", "reason": "Missing required group_id", "allowed": false}'::jsonb, NOW() - INTERVAL '40 minutes'),
  ('allura-system', 'policy_check', 'memory-architect', 'completed', '{"rule": "Agent identity", "user_id": "memory-architect", "allowed": true}'::jsonb, NOW() - INTERVAL '45 minutes'),
  ('allura-system', 'policy_check', 'troy-curator', 'completed', '{"rule": "Approval audit", "group_id": "allura-system", "allowed": true}'::jsonb, NOW() - INTERVAL '50 minutes');
