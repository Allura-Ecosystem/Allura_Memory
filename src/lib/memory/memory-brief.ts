/**
 * Memory Brief Helper — Story 20.4
 *
 * Lightweight helper that queries Allura Brain for prior work on a topic,
 * returning a filtered, categorized brief so agents don't repeat work.
 *
 * Categorizes results into:
 *   - priorWork:  memories describing previous implementations or tasks
 *   - decisions:  memories containing ADRs, decisions, or "decided" language
 *   - blockers:   memories describing known issues, failures, or blockers
 *
 * Token-efficient: returns at most 5 results total, sorted by relevance.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

import { memory_search } from "@/mcp/canonical-tools";
import type { MemorySearchResult, GroupId } from "@/lib/memory/canonical-contracts";
import { validateGroupId } from "@/lib/validation/group-id";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryBrief {
  /** Topic queried */
  topic: string;
  /** Tenant namespace */
  group_id: string;
  /** Prior work memories (implementations, tasks completed) */
  priorWork: MemorySearchResult[];
  /** Decision memories (ADRs, "decided", "chose", "we picked") */
  decisions: MemorySearchResult[];
  /** Blocker memories (issues, failures, "blocked", "doesn't work") */
  blockers: MemorySearchResult[];
  /** Total results found (before categorization) */
  totalFound: number;
  /** Query latency in ms */
  latency_ms: number;
}

export interface MemoryBriefRequest {
  /** Required: Topic to search for */
  topic: string;
  /** Required: Tenant namespace (format: allura-*) */
  group_id: string;
  /** Optional: Max results per category (default: 5 total across all categories) */
  limit?: number;
}

// ── Categorization Heuristics ─────────────────────────────────────────────────

const DECISION_PATTERNS = [
  /\bADR\b/i,
  /\bdecision\b/i,
  /\bdecided\b/i,
  /\bchose\b/i,
  /\bwe picked\b/i,
  /\badopted\b/i,
  /\bapproved\b/i,
  /\bresolution\b/i,
];

const BLOCKER_PATTERNS = [
  /\bblocker\b/i,
  /\bblocked\b/i,
  /\bdoesn'?t work\b/i,
  /\bbroken\b/i,
  /\bfail(?:ed|ure)\b/i,
  /\bissue\b/i,
  /\bbug\b/i,
  /\bcan'?t\b/i,
  /\bnot supported\b/i,
  /\bunsupported\b/i,
];

const PRIOR_WORK_PATTERNS = [
  /\bimplement(?:ed|ation)\b/i,
  /\bcomplet(?:ed|ion)\b/i,
  /\bdone\b/i,
  /\bshipped\b/i,
  /\bdeployed\b/i,
  /\brefactor(?:ed)?\b/i,
  /\bmigrat(?:ed|ion)\b/i,
  /\bbuilt\b/i,
  /\bcreated\b/i,
  /\bprev(?:ious)?\s+work\b/i,
];

/**
 * Categorize a single memory result by content heuristics.
 * A memory can appear in multiple categories if it matches multiple patterns.
 */
export function categorizeMemory(result: MemorySearchResult): {
  priorWork: boolean;
  decisions: boolean;
  blockers: boolean;
} {
  const content = result.content ?? "";
  return {
    priorWork: PRIOR_WORK_PATTERNS.some((p) => p.test(content)),
    decisions: DECISION_PATTERNS.some((p) => p.test(content)),
    blockers: BLOCKER_PATTERNS.some((p) => p.test(content)),
  };
}

// ── Main Helper ───────────────────────────────────────────────────────────────

/**
 * Get a memory brief for a topic.
 *
 * Calls memory_search with the topic query, limited to 5 results, sorted by
 * relevance. Filters results to only include memories from the caller's
 * group_id — no cross-tenant leakage (enforced by memory_search itself).
 *
 * Categorizes results into priorWork / decisions / blockers by content heuristics.
 * Memories that don't match any category are placed in priorWork as a default.
 *
 * @param params - { topic, group_id, limit? }
 * @returns MemoryBrief with categorized results
 * @throws GroupIdValidationError if group_id format is invalid
 */
export async function getMemoryBrief(
  params: MemoryBriefRequest
): Promise<MemoryBrief> {
  const { topic, group_id } = params;
  const limit = Math.min(params.limit ?? 5, 10);

  // Validate group_id format (fail fast)
  const validatedGroupId = validateGroupId(group_id);

  // Call memory_search — group_id is enforced by the canonical tool itself,
  // so there's no cross-tenant leakage.
  const searchResponse = await memory_search({
    query: topic,
    group_id: validatedGroupId,
    limit,
    status: "all", // include proposed + approved for a complete brief
  });

  const results = searchResponse.results ?? [];

  // Categorize results
  const priorWork: MemorySearchResult[] = [];
  const decisions: MemorySearchResult[] = [];
  const blockers: MemorySearchResult[] = [];

  for (const result of results) {
    const cats = categorizeMemory(result);
    if (cats.decisions) decisions.push(result);
    if (cats.blockers) blockers.push(result);
    // priorWork is the default bucket — include if matched OR if no other category matched
    if (cats.priorWork || (!cats.decisions && !cats.blockers)) {
      priorWork.push(result);
    }
  }

  return {
    topic,
    group_id: validatedGroupId,
    priorWork,
    decisions,
    blockers,
    totalFound: searchResponse.count ?? results.length,
    latency_ms: searchResponse.latency_ms ?? 0,
  };
}

// ── MCP Tool Wrapper ──────────────────────────────────────────────────────────

export interface MemoryBriefToolRequest {
  topic: string;
  group_id: string;
  limit?: number;
}

export interface MemoryBriefToolResponse {
  data: MemoryBrief | null;
  meta: { contract_version: string; degraded: boolean; warnings: string[] };
  error: string | null;
}

/**
 * MCP tool wrapper for memory_brief.
 * Returns a standard response envelope.
 */
export async function memory_brief_tool(
  request: MemoryBriefToolRequest
): Promise<MemoryBriefToolResponse> {
  try {
    const brief = await getMemoryBrief(request);
    return {
      data: brief,
      meta: { contract_version: "v1", degraded: false, warnings: [] },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: null,
      meta: { contract_version: "v1", degraded: false, warnings: [] },
      error: message,
    };
  }
}