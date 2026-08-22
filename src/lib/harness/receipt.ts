/**
 * Story 24.5 — Run Receipt: evidence contract for harness runs.
 *
 * Contains scenario digest, definition revision, principal/tenant references,
 * configuration fingerprint, evidence hashes, and replay comparison.
 */
import { createHash } from "node:crypto";

export interface RunReceipt {
  scenario_id: string;
  scenario_digest: string;
  definition_revision: string;
  principal_id: string;
  tenant_id: string;
  config_fingerprint: string;
  mode: "simulate" | "record" | "replay";
  started_at: string;
  completed_at: string;
  status: "completed" | "failed";
  tool_calls: Array<{ tool_name: string; step: number }>;
  policy_decisions: Array<{ policy_id: string; decision: string; step: number }>;
  checkpoint_transitions: Array<{ from: string; to: string; step: number }>;
  side_effect_keys: string[];
  evidence_hashes: Record<string, string>;
  replay_comparison?: {
    identical: boolean;
    divergent_fields: string[];
  };
}

export function buildReceipt(opts: {
  scenario_id: string;
  scenario_digest: string;
  definition_revision: string;
  principal_id: string;
  tenant_id: string;
  config: Record<string, unknown>;
  mode: "simulate" | "record" | "replay";
  started_at: string;
  completed_at: string;
  status: "completed" | "failed";
  tool_calls: Array<{ tool_name: string; step: number }>;
  policy_decisions: Array<{ policy_id: string; decision: string; step: number }>;
  checkpoint_transitions: Array<{ from: string; to: string; step: number }>;
  side_effect_keys: string[];
  evidence: Record<string, unknown>;
  replay_comparison?: { identical: boolean; divergent_fields: string[] };
}): RunReceipt {
  const config_fingerprint = createHash("sha256").update(JSON.stringify(opts.config)).digest("hex");
  const evidence_hashes: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.evidence)) {
    evidence_hashes[key] = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
  return {
    scenario_id: opts.scenario_id,
    scenario_digest: opts.scenario_digest,
    definition_revision: opts.definition_revision,
    principal_id: opts.principal_id,
    tenant_id: opts.tenant_id,
    config_fingerprint,
    mode: opts.mode,
    started_at: opts.started_at,
    completed_at: opts.completed_at,
    status: opts.status,
    tool_calls: opts.tool_calls,
    policy_decisions: opts.policy_decisions,
    checkpoint_transitions: opts.checkpoint_transitions,
    side_effect_keys: opts.side_effect_keys,
    evidence_hashes,
    replay_comparison: opts.replay_comparison,
  };
}

export function compareReceipts(a: RunReceipt, b: RunReceipt): { identical: boolean; divergent_fields: string[] } {
  const fields: Array<keyof RunReceipt> = [
    "scenario_digest",
    "definition_revision",
    "tool_calls",
    "policy_decisions",
    "checkpoint_transitions",
    "side_effect_keys",
    "evidence_hashes",
  ];
  const divergent: string[] = [];
  for (const field of fields) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) {
      divergent.push(field);
    }
  }
  return { identical: divergent.length === 0, divergent_fields: divergent };
}