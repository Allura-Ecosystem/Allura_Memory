/**
 * Coherence Monitor — Pure Detectors
 * Story 2.1
 *
 * Pure functions that extract facts from memory content and detect conflicts
 * between pairs of memories. No DB, no controlPlane, no side effects — this module
 * is the unit-testable core of the coherence monitor.
 *
 * Detection strategy
 *   1. Extract facts from memory content using lightweight regex patterns.
 *      A "fact" is an (entity, attribute, value) triple. The grammar is
 *      deliberately simple: "<Entity> <attribute> is <value>" or
 *      "<Entity>'s <attribute> is <value>".
 *   2. Compare two memories' fact sets:
 *      - entity_attribute: same entity + same attribute, different value
 *      - temporal_contradiction: same entity + attribute, different value,
 *        and the later memory's value supersedes (heuristic: numeric/version)
 *      - duplicate_with_different_fact: high cosine similarity AND a differing
 *        fact (caller passes similarity; detector confirms fact delta)
 */

import type {
  ConflictDetection,
  ConflictType,
  ExtractedFact,
  MemoryRow,
  Severity,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// FACT EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patterns for fact extraction. We support a small grammar that covers the
 * common forms found in agent memory content:
 *   "ProjectX status is active"
 *   "ProjectX's status is active"
 *   "ProjectX version: 1.2.0"
 *   "ProjectX version is 1.2.0"
 *
 * Capture groups: 1 = entity, 2 = attribute, 3 = value.
 *
 * Value capture: we allow everything except newlines and semicolons, then
 * trim trailing sentence punctuation (". " at end of a sentence). This lets
 * us capture "1.2.0" as a single value while still terminating cleanly.
 */
const FACT_PATTERNS: readonly RegExp[] = [
  // "Entity's attribute is value"  /  "Entity attribute is value"
  /\b([A-Z][A-Za-z0-9_-]+)(?:'s)?\s+([a-z][a-z0-9_-]+)\s+is\s+([^\n;]+)/g,
  // "Entity attribute: value"  /  "Entity.attribute: value"
  /\b([A-Z][A-Za-z0-9_-]+)(?:\.| )([a-z][a-z0-9_-]+)\s*[:=]\s*([^\n;]+)/g,
];

/** Trim trailing sentence punctuation and surrounding whitespace/quotes. */
function cleanValue(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\.+$/, "")
    .trim();
}

/**
 * Extract facts from a memory's content string.
 *
 * Returns a list of (entity, attribute, value) triples. Entity names are
 * lower-cased and trimmed so they compare stably across memories.
 */
export function extractFacts(content: string): ExtractedFact[] {
  if (!content || typeof content !== "string") return [];
  const facts: ExtractedFact[] = [];
  const seen = new Set<string>();

  for (const pattern of FACT_PATTERNS) {
    // Reset lastIndex because the regex is /g and reused
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const entity = match[1].trim().toLowerCase();
      const attribute = match[2].trim().toLowerCase();
      const value = cleanValue(match[3]);
      if (!entity || !attribute || !value) continue;
      const key = `${entity}::${attribute}::${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({ entity, attribute, value });
    }
  }
  return facts;
}

/**
 * Extract facts from a MemoryRow, also pulling from `metadata.facts` if the
 * memory carries pre-extracted facts there.
 */
export function extractFactsFromMemory(row: MemoryRow): ExtractedFact[] {
  const facts = extractFacts(row.content ?? "");
  const meta = row.metadata;
  if (meta && typeof meta === "object" && Array.isArray(meta.facts)) {
    for (const f of meta.facts) {
      if (
        f &&
        typeof f === "object" &&
        typeof f.entity === "string" &&
        typeof f.attribute === "string" &&
        typeof f.value === "string"
      ) {
        facts.push({
          entity: f.entity.trim().toLowerCase(),
          attribute: f.attribute.trim().toLowerCase(),
          value: f.value.trim(),
        });
      }
    }
  }
  return facts;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/** Index facts by `${entity}::${attribute}` so we can diff two memories. */
function indexFacts(
  facts: ExtractedFact[]
): Map<string, ExtractedFact[]> {
  const idx = new Map<string, ExtractedFact[]>();
  for (const f of facts) {
    const key = `${f.entity}::${f.attribute}`;
    const list = idx.get(key);
    if (list) list.push(f);
    else idx.set(key, [f]);
  }
  return idx;
}

/** Compare two fact indexes and return the (entity, attribute) keys that differ. */
function diffFactIndexes(
  a: Map<string, ExtractedFact[]>,
  b: Map<string, ExtractedFact[]>
): { key: string; valueA: string; valueB: string }[] {
  const diffs: { key: string; valueA: string; valueB: string }[] = [];
  for (const [key, listA] of a) {
    const listB = b.get(key);
    if (!listB) continue;
    const valueA = listA[0]?.value ?? "";
    const valueB = listB[0]?.value ?? "";
    if (valueA && valueB && valueA !== valueB) {
      diffs.push({ key, valueA, valueB });
    }
  }
  return diffs;
}

/**
 * Detect entity-attribute conflicts: same entity + same attribute, but the
 * two memories record different values.
 */
export function detectEntityAttributeConflict(
  a: MemoryRow,
  b: MemoryRow
): ConflictDetection | null {
  const factsA = extractFactsFromMemory(a);
  const factsB = extractFactsFromMemory(b);
  if (factsA.length === 0 || factsB.length === 0) return null;

  const idxA = indexFacts(factsA);
  const idxB = indexFacts(factsB);
  const diffs = diffFactIndexes(idxA, idxB);
  if (diffs.length === 0) return null;

  const first = diffs[0];
  const [entity, attribute] = first.key.split("::");
  return {
    memory_id_a: a.id,
    memory_id_b: b.id,
    conflict_type: "entity_attribute",
    description: `Entity "${entity}" attribute "${attribute}" differs: "${first.valueA}" vs "${first.valueB}"`,
    severity: "medium",
  };
}

/**
 * Detect temporal contradictions: same entity + attribute, different values,
 * where the *later* memory (by created_at) records a value that contradicts
 * the earlier one. Severity escalates to high when a value is negated or
 * marked as reverted (heuristic: "not ", "reverted", "cancelled").
 */
export function detectTemporalContradiction(
  a: MemoryRow,
  b: MemoryRow
): ConflictDetection | null {
  const factsA = extractFactsFromMemory(a);
  const factsB = extractFactsFromMemory(b);
  if (factsA.length === 0 || factsB.length === 0) return null;

  const idxA = indexFacts(factsA);
  const idxB = indexFacts(factsB);
  const diffs = diffFactIndexes(idxA, idxB);
  if (diffs.length === 0) return null;

  // Order a/b by created_at
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  const [earlier, later] = ta <= tb ? [a, b] : [b, a];

  const first = diffs[0];
  const [entity, attribute] = first.key.split("::");
  const laterValue = ta <= tb ? first.valueB : first.valueA;
  const negation =
    /\b(not|reverted|cancelled|undo|rollback|deprecated)\b/i.test(laterValue);
  const severity: Severity = negation ? "high" : "medium";

  return {
    memory_id_a: earlier.id,
    memory_id_b: later.id,
    conflict_type: "temporal_contradiction",
    description: `Temporal contradiction for "${entity}.${attribute}": later memory (${later.id}) records "${laterValue}", contradicting earlier value`,
    severity,
  };
}

/**
 * Detect duplicate-with-different-fact: the caller has already determined
 * the two memories are semantically similar (above the cosine threshold).
 * This detector confirms there is a differing fact and classifies it.
 */
export function detectDuplicateWithDifferentFact(
  a: MemoryRow,
  b: MemoryRow,
  similarity: number
): ConflictDetection | null {
  const factsA = extractFactsFromMemory(a);
  const factsB = extractFactsFromMemory(b);
  if (factsA.length === 0 || factsB.length === 0) return null;

  const idxA = indexFacts(factsA);
  const idxB = indexFacts(factsB);
  const diffs = diffFactIndexes(idxA, idxB);
  if (diffs.length === 0) return null;

  const first = diffs[0];
  const [entity, attribute] = first.key.split("::");
  // Higher similarity + differing fact → higher severity
  const severity: Severity = similarity >= 0.95 ? "high" : "medium";

  return {
    memory_id_a: a.id,
    memory_id_b: b.id,
    conflict_type: "duplicate_with_different_fact",
    description: `Near-duplicate memories (cosine=${similarity.toFixed(3)}) disagree on "${entity}.${attribute}": "${first.valueA}" vs "${first.valueB}"`,
    severity,
  };
}

/**
 * Run all detectors on a pair and return the first hit (or null). Detectors
 * are tried in order of specificity: entity_attribute, temporal, duplicate.
 * The caller controls whether duplicate detection is attempted by passing
 * a similarity value (>= 0 means the pair was flagged as similar).
 */
export function detectConflict(
  a: MemoryRow,
  b: MemoryRow,
  similarity?: number
): ConflictDetection | null {
  const ea = detectEntityAttributeConflict(a, b);
  if (ea) return ea;
  const tc = detectTemporalContradiction(a, b);
  if (tc) return tc;
  if (similarity !== undefined && similarity >= 0) {
    const dup = detectDuplicateWithDifferentFact(a, b, similarity);
    if (dup) return dup;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COSINE SIMILARITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cosine distance between two numeric vectors (1 - cosine_similarity).
 * Returns +Infinity if either vector is null/empty so the pair is never
 * considered similar. Used as a fallback / test stub; in production the
 * monitor relies on pgvector's `<=>` operator for performance.
 */
export function cosineDistanceStub(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return Infinity;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return Infinity;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Convert a cosine *distance* (pgvector `<=>`, 0 = identical) to a cosine
 * *similarity* (1 = identical). The monitor works in similarity space.
 */
export function distanceToSimilarity(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, Math.min(1, 1 - distance));
}

export const CONFLICT_TYPES: readonly ConflictType[] = [
  "entity_attribute",
  "temporal_contradiction",
  "duplicate_with_different_fact",
];