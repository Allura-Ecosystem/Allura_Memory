/**
 * Process Engine — State Manager
 * Story 12.1: Process-as-Code Engine for Allura Memory
 *
 * Persists process state as append-only PostgreSQL events.
 * State is reconstructed by replaying events (foundation for Story 12.2).
 *
 * Event types emitted:
 *   process_started      — initial snapshot of the process definition
 *   process_state_saved  — periodic full-state snapshot
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/state-manager is server-side only")
}

import type { Pool } from "pg"
import { insertEvent } from "@/lib/postgres/queries/insert-trace"
import type { ProcessState, ProcessStatus } from "./types"

// ── Replay Helpers ────────────────────────────────────────────────────────────

/**
 * Build a ProcessState from a sorted list of raw event rows.
 * Only events with event_type === 'process_state_saved' carry a full snapshot;
 * we take the latest one to recover current state.
 */
function replayEvents(rows: Array<{ event_type: string; metadata: Record<string, unknown> }>): ProcessState | null {
  // Walk newest-first to find the most recent full snapshot
  const snapshots = rows.filter((r) => r.event_type === "process_state_saved")
  if (snapshots.length === 0) {
    // Fall back to process_started snapshot if no intermediate saves
    const started = rows.find((r) => r.event_type === "process_started")
    if (!started) return null
    return started.metadata.state as ProcessState
  }
  return snapshots[snapshots.length - 1].metadata.state as ProcessState
}

// ── ProcessStateManager ───────────────────────────────────────────────────────

export class ProcessStateManager {
  constructor(private pool: Pool) {}

  /**
   * Persist the current process state as an append-only event.
   * The full state snapshot is stored in metadata.state so it can be
   * replayed without scanning every individual step event.
   */
  async saveState(state: ProcessState): Promise<void> {
    await insertEvent({
      group_id: state.groupId,
      event_type: "process_state_saved",
      agent_id: "process-engine",
      workflow_id: state.processId,
      metadata: {
        state,
        definitionId: state.definitionId,
        status: state.status,
      },
      status: "completed",
    })
  }

  /**
   * Emit the initial process_started event.
   * This captures the definition snapshot for replay.
   */
  async saveInitialState(state: ProcessState, definitionSnapshot: Record<string, unknown>): Promise<void> {
    await insertEvent({
      group_id: state.groupId,
      event_type: "process_started",
      agent_id: "process-engine",
      workflow_id: state.processId,
      metadata: {
        state,
        definitionId: state.definitionId,
        definitionSnapshot,
      },
      status: "completed",
    })
  }

  /**
   * Reconstruct the latest ProcessState by replaying events for a processId.
   * Returns null if no events exist for this processId.
   */
  async loadState(processId: string): Promise<ProcessState | null> {
    const result = await this.pool.query<{
      event_type: string
      metadata: Record<string, unknown>
    }>(
      `SELECT event_type, metadata
       FROM events
       WHERE workflow_id = $1
         AND event_type IN ('process_started', 'process_state_saved')
       ORDER BY created_at ASC`,
      [processId],
    )

    if (result.rows.length === 0) return null
    return replayEvents(result.rows)
  }

  /**
   * List process states for a group, optionally filtered by status.
   * Reconstructed from the latest process_state_saved event per process.
   */
  async listProcesses(groupId: string, status?: ProcessStatus): Promise<ProcessState[]> {
    // Fetch distinct workflow_ids for this group that have process events
    const baseQuery = `
      SELECT DISTINCT ON (workflow_id) workflow_id, metadata, event_type
      FROM events
      WHERE group_id = $1
        AND event_type IN ('process_started', 'process_state_saved')
      ORDER BY workflow_id, created_at DESC
    `

    const result = await this.pool.query<{
      workflow_id: string
      event_type: string
      metadata: Record<string, unknown>
    }>(baseQuery, [groupId])

    const states: ProcessState[] = []

    for (const row of result.rows) {
      const state = row.metadata.state as ProcessState | undefined
      if (!state) continue
      if (status !== undefined && state.status !== status) continue
      states.push(state)
    }

    return states
  }
}
