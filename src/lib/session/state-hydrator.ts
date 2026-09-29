/**
 * State Hydrator - Load State from Canonical Sources
 *
 * Implements the 4-layer encoding priority:
 * 1. Database (PostgreSQL) - Primary source of truth
 * 2. Serialization (Neo4j) - Curated knowledge
 * 3. Files (.opencode/state) - Fast recovery
 * 4. Memory Bank - Fallback documentation
 */

import { z } from "zod"
import fs from "fs/promises"
import path from "path"
import type { CheckpointState } from "./checkpoint-manager"

/**
 * Session state schema
 */
export const SessionStateSchema = z.object({
  /** Session ID */
  sessionId: z.string().uuid(),
  /** Group ID for tenant isolation */
  groupId: z.string().min(1),
  /** Current epic number */
  currentEpic: z.number().int().positive().optional(),
  /** Current story ID */
  currentStory: z.string().optional(),
  /** Phase of development loop */
  phase: z.enum(["DEV", "CODE_REVIEW", "CORRECT_COURSE", "BLOOD_LOOP", "RETROSPECTIVE", "WAITING"]),
  /** Memory bank context */
  memoryBankContext: z.record(z.string(), z.unknown()).optional(),
  /** Planning artifacts */
  planningArtifacts: z.record(z.string(), z.unknown()).optional(),
  /** Budget state */
  budgetState: z.record(z.string(), z.unknown()).optional(),
  /** Checkpoint reference */
  checkpointId: z.string().uuid().optional(),
  /** Loaded from source */
  loadedFrom: z.enum(["database", "serialization", "files", "none"]),
})

export type SessionState = z.infer<typeof SessionStateSchema>

/**
 * State source priority (4-layer encoding)
 */
export enum StateSource {
  DATABASE = 1, // PostgreSQL - highest priority
  SERIALIZATION = 2, // Neo4j
  FILES = 3, // .opencode/state
}

/**
 * State hydrator configuration
 */
export interface StateHydratorConfig {
  /** State directory */
  stateDir: string
  /** Planning artifacts directory */
  planningArtifactsDir: string
  /** Enable database hydration */
  enableDbHydration: boolean
  /** Enable Neo4j hydration */
  enableNeo4jHydration: boolean
}

const DEFAULT_CONFIG: StateHydratorConfig = {
  stateDir: ".opencode/state",
  planningArtifactsDir: "_bmad_output/planning-artifacts",
  enableDbHydration: true,
  enableNeo4jHydration: true,
}

/**
 * State Hydrator
 *
 * Loads session state from multiple canonical sources.
 * Prioritizes freshness and completeness.
 */
export class StateHydrator {
  private config: StateHydratorConfig

  constructor(config?: Partial<StateHydratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Hydrate state from all sources
   * Tries each source in priority order until successful
   */
  async hydrate(sessionId: string, groupId: string): Promise<SessionState> {
    // Try database first (PostgreSQL)
    if (this.config.enableDbHydration) {
      const dbState = await this.tryHydrateFromDatabase(sessionId, groupId)
      if (dbState) {
        return { ...dbState, loadedFrom: "database" }
      }
    }

    // Try serialization (Neo4j)
    if (this.config.enableNeo4jHydration) {
      const neo4jState = await this.tryHydrateFromNeo4j(sessionId, groupId)
      if (neo4jState) {
        return { ...neo4jState, loadedFrom: "serialization" }
      }
    }

    // Try files (.opencode/state)
    const fileState = await this.tryHydrateFromFiles(sessionId, groupId)
    if (fileState) {
      return { ...fileState, loadedFrom: "files" }
    }

    // No state found - return initial state
    return {
      sessionId,
      groupId,
      phase: "WAITING",
      loadedFrom: "none",
    }
  }

  /**
   * Try to hydrate from PostgreSQL database
   */
  private async tryHydrateFromDatabase(sessionId: string, groupId: string): Promise<SessionState | null> {
    // TODO: Implement PostgreSQL hydration
    // This will be implemented when we have the Postgres client available
    console.log(`[Hydrator] Database hydration not yet implemented for session ${sessionId}`)
    return null

    // Example implementation:
    // const result = await postgresClient.query(
    //   'SELECT * FROM session_states WHERE session_id = $1 AND group_id = $2 ORDER BY created_at DESC LIMIT 1',
    //   [sessionId, groupId]
    // );
    //
    // if (result.rows.length === 0) {
    //   return null;
    // }
    //
    // return SessionStateSchema.parse({
    //   ...result.rows[0],
    //   phase: result.rows[0].phase,
    // });
  }

  /**
   * Try to hydrate from Neo4j
   */
  private async tryHydrateFromNeo4j(sessionId: string, groupId: string): Promise<SessionState | null> {
    // TODO: Implement Neo4j hydration
    // This will be implemented when we have the Neo4j client available
    console.log(`[Hydrator] Neo4j hydration not yet implemented for session ${sessionId}`)
    return null

    // Example implementation:
    // const result = await neo4jClient.run(
    //   'MATCH (s:SessionState {session_id: $sessionId, group_id: $groupId}) RETURN s ORDER BY s.created_at DESC LIMIT 1',
    //   { sessionId, groupId }
    // );
    //
    // if (result.records.length === 0) {
    //   return null;
    // }
    //
    // const node = result.records[0].get('s').properties;
    // return SessionStateSchema.parse(node);
  }

  /**
   * Try to hydrate from files (.opencode/state)
   */
  private async tryHydrateFromFiles(sessionId: string, groupId: string): Promise<SessionState | null> {
    try {
      const sessionsDir = path.join(this.config.stateDir, "sessions")
      const sessionFile = path.join(sessionsDir, `${sessionId}.json`)

      const content = await fs.readFile(sessionFile, "utf8")
      const parsed = JSON.parse(content)
      const validated = SessionStateSchema.parse(parsed)

      // Verify group ID matches
      if (validated.groupId !== groupId) {
        console.warn(`[Hydrator] Group ID mismatch in file state: expected ${groupId}, got ${validated.groupId}`)
        return null
      }

      return validated
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null
      }
      console.error("[Hydrator] Failed to hydrate from files:", error)
      return null
    }
  }

  /**
   * Load planning artifacts
   */
  private async loadPlanningArtifacts(): Promise<Record<string, unknown>> {
    const artifacts: Record<string, unknown> = {}

    const planningFiles = ["epics.md", "source-of-truth.md", "tech-spec-*.md"]

    for (const pattern of planningFiles) {
      try {
        if (pattern.includes("*")) {
          // Handle glob patterns
          // For now, just log that we'd handle this
          console.log(`[Hydrator] Would handle glob pattern: ${pattern}`)
        } else {
          const filePath = path.join(this.config.planningArtifactsDir, pattern)
          const content = await fs.readFile(filePath, "utf8")
          const key = pattern.replace(".md", "")
          artifacts[key] = content
        }
      } catch {
        // File doesn't exist or can't be read - skip
        console.warn(`[Hydrator] Could not load planning file: ${pattern}`)
      }
    }

    return artifacts
  }

  /**
   * Save state to files
   */
  async saveState(state: SessionState): Promise<void> {
    const sessionsDir = path.join(this.config.stateDir, "sessions")
    await fs.mkdir(sessionsDir, { recursive: true })

    const sessionFile = path.join(sessionsDir, `${state.sessionId}.json`)
    await fs.writeFile(sessionFile, JSON.stringify(state, null, 2), "utf8")
  }

  /**
   * Merge partial state update
   */
  mergeState(current: SessionState, update: Partial<SessionState>): SessionState {
    return SessionStateSchema.parse({
      ...current,
      ...update,
      // Ensure loadedFrom is never changed
      loadedFrom: current.loadedFrom,
    })
  }

  /**
   * Validate state integrity
   */
  async validateState(state: SessionState): Promise<boolean> {
    try {
      // Validate schema
      SessionStateSchema.parse(state)

      // Validate groupId format (allura-*)
      if (!state.groupId.startsWith("allura-") && state.groupId !== "roninmemory") {
        console.warn(`[Hydrator] Invalid groupId format: ${state.groupId}`)
        return false
      }

      // Validate phase
      const validPhases = ["DEV", "CODE_REVIEW", "CORRECT_COURSE", "BLOOD_LOOP", "RETROSPECTIVE", "WAITING"]
      if (!validPhases.includes(state.phase)) {
        console.warn(`[Hydrator] Invalid phase: ${state.phase}`)
        return false
      }

      return true
    } catch (error) {
      console.error("[Hydrator] State validation failed:", error)
      return false
    }
  }

  /**
   * Create checkpoint from state
   */
  createCheckpointFromState(state: SessionState): CheckpointState {
    return {
      timestamp: new Date().toISOString(),
      sessionId: state.sessionId,
      groupId: state.groupId,
      currentEpic: state.currentEpic,
      currentStory: state.currentStory,
      phase: state.phase,
      stateData: {
        memoryBankContext: state.memoryBankContext,
        planningArtifacts: state.planningArtifacts,
        budgetState: state.budgetState,
      },
      lastCheckpointId: state.checkpointId,
    }
  }

  /**
   * Restore state from checkpoint
   */
  restoreFromCheckpoint(checkpoint: CheckpointState): SessionState {
    return {
      sessionId: checkpoint.sessionId,
      groupId: checkpoint.groupId,
      currentEpic: checkpoint.currentEpic,
      currentStory: checkpoint.currentStory,
      phase: checkpoint.phase,
      memoryBankContext: checkpoint.stateData?.memoryBankContext as Record<string, unknown> | undefined,
      planningArtifacts: checkpoint.stateData?.planningArtifacts as Record<string, unknown> | undefined,
      budgetState: checkpoint.stateData?.budgetState as Record<string, unknown> | undefined,
      checkpointId: checkpoint.lastCheckpointId,
      loadedFrom: "files",
    }
  }
}

/**
 * Factory function to create state hydrator
 */
export function createStateHydrator(config?: Partial<StateHydratorConfig>): StateHydrator {
  return new StateHydrator(config)
}

/**
 * Default export
 */
export default StateHydrator
