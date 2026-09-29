/**
 * Tests for State Hydrator
 * Requires filesystem access.
 * Run with: RUN_E2E_TESTS=true bun vitest run src/lib/session/state-hydrator.test.ts
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "fs/promises"
import path from "path"
import { createStateHydrator, type SessionState, StateHydrator } from "./state-hydrator"

const shouldRunE2E = process.env.RUN_E2E_TESTS === "true"

describe.skipIf(!shouldRunE2E)("StateHydrator", () => {
  let hydrator: StateHydrator
  const testStateDir = ".opencode/state/sessions-test"
  const testPlanningDir = "_bmad_output/planning-artifacts-test"
  const sessionId = "00000000-0000-4000-8000-000000000001"
  const groupId = "allura-test"

  beforeEach(async () => {
    hydrator = createStateHydrator({
      stateDir: testStateDir,
      planningArtifactsDir: testPlanningDir,
      enableDbHydration: false,
      enableNeo4jHydration: false,
    })

    // Create test directories
    await fs.mkdir(testStateDir, { recursive: true })
    await fs.mkdir(path.join(testStateDir, "sessions"), { recursive: true })
    await fs.mkdir(testPlanningDir, { recursive: true })
  })

  afterEach(async () => {
    // Cleanup test directories
    try {
      await fs.rm(testStateDir, { recursive: true, force: true })
      await fs.rm(testPlanningDir, { recursive: true, force: true })
    } catch {
      // Directories may not exist
    }
  })

  describe("hydrate", () => {
    it("should return default state when no state exists", async () => {
      const state = await hydrator.hydrate(sessionId, groupId)

      expect(state.sessionId).toBe(sessionId)
      expect(state.groupId).toBe(groupId)
      expect(state.phase).toBe("WAITING")
      expect(state.loadedFrom).toBe("none")
    })

    it("should load state from files when available", async () => {
      const savedState: SessionState = {
        sessionId,
        groupId,
        phase: "DEV",
        currentEpic: 1,
        currentStory: "story-1",
        loadedFrom: "database",
      }

      await hydrator.saveState(savedState)

      const loadedState = await hydrator.hydrate(sessionId, groupId)

      expect(loadedState.phase).toBe("DEV")
      expect(loadedState.currentEpic).toBe(1)
      expect(loadedState.currentStory).toBe("story-1")
      expect(loadedState.loadedFrom).toBe("files")
    })

    it("should prioritize database over files (when enabled)", async () => {
      // Note: Database hydration is disabled in tests
      // This test verifies the fallback behavior
      const savedState: SessionState = {
        sessionId,
        groupId,
        phase: "CODE_REVIEW",
        loadedFrom: "files",
      }

      await hydrator.saveState(savedState)

      const loadedState = await hydrator.hydrate(sessionId, groupId)
      expect(loadedState.phase).toBe("CODE_REVIEW")
    })
  })

  describe("saveState", () => {
    it("should save state to file", async () => {
      const state: SessionState = {
        sessionId,
        groupId,
        phase: "BLOOD_LOOP",
        currentEpic: 2,
        currentStory: "story-2",
        loadedFrom: "files",
      }

      await hydrator.saveState(state)

      // Verify file exists
      const stateFile = path.join(testStateDir, "sessions", `${sessionId}.json`)
      const content = await fs.readFile(stateFile, "utf8")
      const loaded = JSON.parse(content)

      expect(loaded.sessionId).toBe(sessionId)
      expect(loaded.phase).toBe("BLOOD_LOOP")
    })
  })

  describe("validateState", () => {
    it("should validate correct state", async () => {
      const state: SessionState = {
        sessionId,
        groupId: "allura-test",
        phase: "DEV",
        loadedFrom: "files",
      }

      const valid = await hydrator.validateState(state)
      expect(valid).toBe(true)
    })

    it("should reject invalid phase", async () => {
      const state = {
        sessionId,
        groupId: "allura-test",
        phase: "INVALID_PHASE",
        loadedFrom: "files",
      } as unknown as SessionState

      const valid = await hydrator.validateState(state)
      expect(valid).toBe(false)
    })

    it("should accept legacy roninmemory group ID", async () => {
      const state: SessionState = {
        sessionId,
        groupId: "roninmemory",
        phase: "WAITING",
        loadedFrom: "none",
      }

      const valid = await hydrator.validateState(state)
      expect(valid).toBe(true)
    })
  })

  describe("mergeState", () => {
    it("should merge partial state updates", async () => {
      const current: SessionState = {
        sessionId,
        groupId: "allura-test",
        phase: "DEV",
        currentEpic: 1,
        currentStory: "story-1",
        loadedFrom: "files",
      }

      const merged = hydrator.mergeState(current, {
        phase: "CODE_REVIEW",
        currentStory: "story-2",
      })

      expect(merged.sessionId).toBe(sessionId)
      expect(merged.groupId).toBe("allura-test")
      expect(merged.phase).toBe("CODE_REVIEW")
      expect(merged.currentEpic).toBe(1)
      expect(merged.currentStory).toBe("story-2")
      expect(merged.loadedFrom).toBe("files") // Should not change
    })
  })

  describe("restoreFromCheckpoint", () => {
    it("should restore state from checkpoint", async () => {
      const checkpoint = {
        timestamp: new Date().toISOString(),
        sessionId,
        groupId: "allura-test",
        phase: "RETROSPECTIVE" as const,
        currentEpic: 3,
        currentStory: "story-3",
        stateData: {
          memoryBankContext: { test: "value" },
          planningArtifacts: { epics: "content" },
        },
        lastCheckpointId: "checkpoint-123",
      }

      const state = hydrator.restoreFromCheckpoint(checkpoint)

      expect(state.sessionId).toBe(sessionId)
      expect(state.groupId).toBe("allura-test")
      expect(state.phase).toBe("RETROSPECTIVE")
      expect(state.currentEpic).toBe(3)
      expect(state.memoryBankContext).toEqual({ test: "value" })
      expect(state.planningArtifacts).toEqual({ epics: "content" })
      expect(state.loadedFrom).toBe("files")
    })
  })

  describe("createCheckpointFromState", () => {
    it("should create checkpoint from state", async () => {
      const state: SessionState = {
        sessionId,
        groupId: "allura-test",
        phase: "CORRECT_COURSE",
        currentEpic: 2,
        currentStory: "story-2",
        memoryBankContext: { context: "test" },
        planningArtifacts: { artifacts: "test" },
        budgetState: { remaining: 100 },
        loadedFrom: "database",
        checkpointId: "old-checkpoint",
      }

      const checkpoint = hydrator.createCheckpointFromState(state)

      expect(checkpoint.sessionId).toBe(sessionId)
      expect(checkpoint.groupId).toBe("allura-test")
      expect(checkpoint.phase).toBe("CORRECT_COURSE")
      expect(checkpoint.currentEpic).toBe(2)
      expect(checkpoint.currentStory).toBe("story-2")
      expect(checkpoint.stateData).toEqual({
        memoryBankContext: { context: "test" },
        planningArtifacts: { artifacts: "test" },
        budgetState: { remaining: 100 },
      })
    })
  })

  describe("error handling", () => {
    it("should handle file read errors gracefully", async () => {
      // Try to hydrate when state file doesn't exist
      const state = await hydrator.hydrate("non-existent-session", groupId)

      expect(state.sessionId).toBe("non-existent-session")
      expect(state.loadedFrom).toBe("none")
    })

    it("should handle invalid JSON in state file", async () => {
      const stateFile = path.join(testStateDir, "sessions", `${sessionId}.json`)
      await fs.writeFile(stateFile, "invalid json", "utf8")

      const state = await hydrator.hydrate(sessionId, groupId)

      expect(state.loadedFrom).toBe("none")
    })
  })
})

describe("createStateHydrator", () => {
  it("should create instance with default config", () => {
    const hydrator = createStateHydrator()
    expect(hydrator).toBeInstanceOf(StateHydrator)
  })

  it("should create instance with custom config", () => {
    const hydrator = createStateHydrator({
      stateDir: ".opencode/state/custom",
      planningArtifactsDir: "_bmad_output/planning-artifacts-custom",
    })
    expect(hydrator).toBeInstanceOf(StateHydrator)
  })
})
