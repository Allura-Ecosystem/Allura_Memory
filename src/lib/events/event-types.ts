/**
 * Canonical Event Types — Allura Memory System
 *
 * These are the recognized event types in the PostgreSQL events table.
 * Adding a new type requires updating this registry AND the Data Dictionary
 * (docs/allura/DATA-DICTIONARY.md).
 *
 * Categories:
 * - CURATOR: Proposal lifecycle events
 * - MEMORY: Memory operations
 * - DEBUG: Systematic debugging trace events (POL-006)
 * - SYSTEM: Infrastructure and session events
 * - SYNC: Projection and sync events
 * - MCP: Tool governance events
 */

// ── Curator Pipeline ──────────────────────────────────────────────────────

export const EVENT_PROPOSAL_CREATED = "proposal_created"
export const EVENT_PROPOSAL_DECIDED = "proposal_decided"
export const EVENT_PROPOSAL_APPROVED = "proposal_approved"
export const EVENT_PROPOSAL_REJECTED = "proposal_rejected"

// ── Memory Operations ───────────────────────────────────────────────────────

export const EVENT_MEMORY_ADD = "memory_add"
export const EVENT_MEMORY_SEARCH = "memory_search"
export const EVENT_MEMORY_PROMOTED = "memory_promoted"
export const EVENT_MEMORY_DELETE = "memory_delete"

// ── Systematic Debugging (POL-006) ─────────────────────────────────────────
//
// The Iron Law: No fix without root cause.
// These events form the debugging audit trail:
//   1. debug:root_cause_found  → Phase 1 complete (evidence gathered)
//   2. debug:hypothesis_tested  → Phase 3 step (single hypothesis tested)
//   3. debug:fix_implemented    → Phase 4 (fix after root cause confirmed)
//
// POL-006 enforces that debug:fix_implemented MUST be preceded by
// debug:root_cause_found within the same scope.

export const EVENT_DEBUG_ROOT_CAUSE_FOUND = "debug:root_cause_found"
export const EVENT_DEBUG_HYPOTHESIS_TESTED = "debug:hypothesis_tested"
export const EVENT_DEBUG_FIX_IMPLEMENTED = "debug:fix_implemented"

/** All debug event types (for querying) */
export const DEBUG_EVENT_TYPES = [
  EVENT_DEBUG_ROOT_CAUSE_FOUND,
  EVENT_DEBUG_HYPOTHESIS_TESTED,
  EVENT_DEBUG_FIX_IMPLEMENTED,
] as const

// ── System Events ─────────────────────────────────────────────────────────

export const EVENT_SESSION_START = "session_start"
export const EVENT_SESSION_END = "session_end"
export const EVENT_WATCHDOG_HEARTBEAT = "WATCHDOG_HEARTBEAT"
export const EVENT_AUTO_CURATED = "auto_curated"
export const EVENT_ARCHITECTURE_DECISION = "ARCHITECTURE_DECISION"
export const EVENT_TASK_COMPLETE = "TASK_COMPLETE"

// ── Sync Events ────────────────────────────────────────────────────────────

export const EVENT_NOTION_SYNC_PENDING = "notion_sync_pending"

// ── MCP Tool Governance ────────────────────────────────────────────────────

export const EVENT_TOOL_APPROVED = "tool_approved"
export const EVENT_TOOL_DENIED = "tool_denied"

// ── Trace Middleware (Story 1.2) ────────────────────────────────────────────

export const EVENT_REQUEST_TRACE = "request_trace"

// ── All Event Types ────────────────────────────────────────────────────────

export const ALL_EVENT_TYPES = [
  // Curator
  EVENT_PROPOSAL_CREATED,
  EVENT_PROPOSAL_DECIDED,
  EVENT_PROPOSAL_APPROVED,
  EVENT_PROPOSAL_REJECTED,
  // Memory
  EVENT_MEMORY_ADD,
  EVENT_MEMORY_SEARCH,
  EVENT_MEMORY_PROMOTED,
  EVENT_MEMORY_DELETE,
  // Debug
  ...DEBUG_EVENT_TYPES,
  // System
  EVENT_SESSION_START,
  EVENT_SESSION_END,
  EVENT_WATCHDOG_HEARTBEAT,
  EVENT_AUTO_CURATED,
  EVENT_ARCHITECTURE_DECISION,
  EVENT_TASK_COMPLETE,
  // Sync
  EVENT_NOTION_SYNC_PENDING,
  // MCP
  EVENT_TOOL_APPROVED,
  EVENT_TOOL_DENIED,
  // Trace
  EVENT_REQUEST_TRACE,
] as const

export type AlluraEventType = typeof ALL_EVENT_TYPES[number]