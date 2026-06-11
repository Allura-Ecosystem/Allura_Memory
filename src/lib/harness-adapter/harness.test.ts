/**
 * Harness Adapter — Unit Tests
 * Story 12.7: Multi-Harness Adapter Interface for Allura Memory
 *
 * NOTE on fs mocking: Bun's node:fs shim marks existsSync as non-configurable,
 * so vi.spyOn cannot redefine it. Tests that need to control existsSync instead
 * mock node:fs at the module level with vi.mock().
 *
 * NOTE on env isolation: The CI runner and local dev have a .claude/ directory
 * that would cause detectHarness() to return "claude-code" by default. Every
 * test that exercises a non-claude-code path must mock existsSync to return
 * false so the fs check does not contaminate the result.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { HarnessAdapter } from "./types"

// ── Module-level fs mock ──────────────────────────────────────────────────────
// Start with every path returning false; individual tests override as needed.

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function clearHarnessEnv(): void {
  delete process.env.CLAUDE_CODE
  delete process.env.CODEX_CLI
  delete process.env.CURSOR_SESSION
}

async function getMockedExistsSync() {
  const fs = await import("node:fs")
  return fs.existsSync as ReturnType<typeof vi.fn>
}

// ── 1. detectHarness ──────────────────────────────────────────────────────────

describe("detectHarness", () => {
  beforeEach(async () => {
    clearHarnessEnv()
    const mock = await getMockedExistsSync()
    mock.mockReturnValue(false)
  })

  afterEach(() => {
    clearHarnessEnv()
    vi.clearAllMocks()
  })

  it("returns claude-code when CLAUDE_CODE env is set", async () => {
    process.env.CLAUDE_CODE = "1"
    const { detectHarness } = await import("./detect")
    const result = detectHarness()
    expect(result.detected).toBe("claude-code")
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
    expect(result.evidence).toContain("CLAUDE_CODE")
  })

  it("returns claude-code when .claude/settings.json exists on disk", async () => {
    const mock = await getMockedExistsSync()
    mock.mockImplementation((p: unknown) => String(p) === ".claude/settings.json")
    const { detectHarness } = await import("./detect")
    const result = detectHarness()
    expect(result.detected).toBe("claude-code")
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it("returns codex when CODEX_CLI env is set", async () => {
    process.env.CODEX_CLI = "1"
    const { detectHarness } = await import("./detect")
    const result = detectHarness()
    expect(result.detected).toBe("codex")
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it("returns codex when .codex/ directory exists", async () => {
    const mock = await getMockedExistsSync()
    mock.mockImplementation((p: unknown) => String(p) === ".codex/")
    const { detectHarness } = await import("./detect")
    const result = detectHarness()
    expect(result.detected).toBe("codex")
  })

  it("returns cursor when CURSOR_SESSION env is set", async () => {
    process.env.CURSOR_SESSION = "1"
    const { detectHarness } = await import("./detect")
    const result = detectHarness()
    expect(result.detected).toBe("cursor")
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it("returns cursor when .cursor/ directory exists", async () => {
    const mock = await getMockedExistsSync()
    mock.mockImplementation((p: unknown) => String(p) === ".cursor/")
    const { detectHarness } = await import("./detect")
    const result = detectHarness()
    expect(result.detected).toBe("cursor")
  })

  it("returns generic when nothing matches", async () => {
    const { detectHarness } = await import("./detect")
    const result = detectHarness()
    expect(result.detected).toBe("generic")
    expect(result.confidence).toBeLessThan(0.8)
    expect(result.evidence).toBe("no specific harness detected")
  })
})

// ── 2. ClaudeCodeAdapter ──────────────────────────────────────────────────────

describe("ClaudeCodeAdapter", () => {
  beforeEach(async () => {
    clearHarnessEnv()
    const mock = await getMockedExistsSync()
    mock.mockReturnValue(false)
  })

  afterEach(() => {
    clearHarnessEnv()
    vi.clearAllMocks()
  })

  it("isAvailable returns true when CLAUDE_CODE env is set", async () => {
    process.env.CLAUDE_CODE = "1"
    const { ClaudeCodeAdapter } = await import("./adapters/claude-code")
    const adapter = new ClaudeCodeAdapter()
    expect(adapter.isAvailable()).toBe(true)
  })

  it("isAvailable returns true when .claude/settings.json exists", async () => {
    const mock = await getMockedExistsSync()
    mock.mockImplementation((p: unknown) => String(p) === ".claude/settings.json")
    const { ClaudeCodeAdapter } = await import("./adapters/claude-code")
    const adapter = new ClaudeCodeAdapter()
    expect(adapter.isAvailable()).toBe(true)
  })

  it("isAvailable returns false when no env or filesystem marker present", async () => {
    const { ClaudeCodeAdapter } = await import("./adapters/claude-code")
    const adapter = new ClaudeCodeAdapter()
    expect(adapter.isAvailable()).toBe(false)
  })

  it("executeTool returns delegated_to_mcp status", async () => {
    const { ClaudeCodeAdapter } = await import("./adapters/claude-code")
    const adapter = new ClaudeCodeAdapter()
    const result = await adapter.executeTool("memory_search", { query: "test" })
    expect(result).toMatchObject({
      tool: "memory_search",
      status: "delegated_to_mcp",
    })
  })

  it("executeTool echoes args in result", async () => {
    const { ClaudeCodeAdapter } = await import("./adapters/claude-code")
    const adapter = new ClaudeCodeAdapter()
    const args = { query: "allura", group_id: "allura-system" }
    const result = await adapter.executeTool("memory_search", args)
    expect(result).toMatchObject({ args })
  })

  it("getConfig returns mcpEnabled true", async () => {
    const { ClaudeCodeAdapter } = await import("./adapters/claude-code")
    const adapter = new ClaudeCodeAdapter()
    const config = adapter.getConfig()
    expect(config.mcpEnabled).toBe(true)
  })

  it("implements HarnessAdapter interface", async () => {
    const { ClaudeCodeAdapter } = await import("./adapters/claude-code")
    const adapter: HarnessAdapter = new ClaudeCodeAdapter()
    expect(adapter.type).toBe("claude-code")
    expect(adapter.name).toBeTruthy()
    expect(adapter.capabilities).toBeDefined()
    expect(adapter.capabilities.maxContextTokens).toBeGreaterThan(0)
    expect(adapter.capabilities.supportsMCP).toBe(true)
  })
})

// ── 3. CodexAdapter ───────────────────────────────────────────────────────────

describe("CodexAdapter", () => {
  it("implements HarnessAdapter interface", async () => {
    const { CodexAdapter } = await import("./adapters/codex")
    const adapter: HarnessAdapter = new CodexAdapter()
    expect(adapter.type).toBe("codex")
    expect(adapter.capabilities).toBeDefined()
    expect(adapter.capabilities.maxContextTokens).toBeGreaterThan(0)
  })

  it("executeTool returns not_implemented status", async () => {
    const { CodexAdapter } = await import("./adapters/codex")
    const adapter = new CodexAdapter()
    const result = await adapter.executeTool("memory_add", {})
    expect(result).toMatchObject({ status: "not_implemented", harness: "codex" })
  })

  it("getConfig returns settingsPath", async () => {
    const { CodexAdapter } = await import("./adapters/codex")
    const adapter = new CodexAdapter()
    const config = adapter.getConfig()
    expect(config.settingsPath).toBeTruthy()
  })
})

// ── 4. CursorAdapter ──────────────────────────────────────────────────────────

describe("CursorAdapter", () => {
  it("implements HarnessAdapter interface", async () => {
    const { CursorAdapter } = await import("./adapters/cursor")
    const adapter: HarnessAdapter = new CursorAdapter()
    expect(adapter.type).toBe("cursor")
    expect(adapter.capabilities).toBeDefined()
  })

  it("executeTool returns not_implemented status", async () => {
    const { CursorAdapter } = await import("./adapters/cursor")
    const adapter = new CursorAdapter()
    const result = await adapter.executeTool("memory_search", {})
    expect(result).toMatchObject({ status: "not_implemented", harness: "cursor" })
  })

  it("capabilities include supportsStreaming true", async () => {
    const { CursorAdapter } = await import("./adapters/cursor")
    const adapter = new CursorAdapter()
    expect(adapter.capabilities.supportsStreaming).toBe(true)
  })
})

// ── 5. GenericAdapter ─────────────────────────────────────────────────────────

describe("GenericAdapter", () => {
  it("implements HarnessAdapter interface", async () => {
    const { GenericAdapter } = await import("./adapters/generic")
    const adapter: HarnessAdapter = new GenericAdapter()
    expect(adapter.type).toBe("generic")
    expect(adapter.capabilities).toBeDefined()
  })

  it("isAvailable always returns true", async () => {
    const { GenericAdapter } = await import("./adapters/generic")
    const adapter = new GenericAdapter()
    expect(adapter.isAvailable()).toBe(true)
  })

  it("executeTool returns not_implemented status", async () => {
    const { GenericAdapter } = await import("./adapters/generic")
    const adapter = new GenericAdapter()
    const result = await adapter.executeTool("memory_add", {})
    expect(result).toMatchObject({ status: "not_implemented", harness: "generic" })
  })

  it("capabilities declare conservative defaults", async () => {
    const { GenericAdapter } = await import("./adapters/generic")
    const adapter = new GenericAdapter()
    expect(adapter.capabilities.supportsMCP).toBe(false)
    expect(adapter.capabilities.supportsStreaming).toBe(false)
    expect(adapter.capabilities.supportsToolUse).toBe(false)
    expect(adapter.capabilities.maxContextTokens).toBeGreaterThan(0)
  })

  it("getConfig returns an empty object", async () => {
    const { GenericAdapter } = await import("./adapters/generic")
    const adapter = new GenericAdapter()
    expect(adapter.getConfig()).toEqual({})
  })
})

// ── 6. getAdapter — factory ───────────────────────────────────────────────────

describe("getAdapter", () => {
  beforeEach(async () => {
    clearHarnessEnv()
    const mock = await getMockedExistsSync()
    mock.mockReturnValue(false)
  })

  afterEach(() => {
    clearHarnessEnv()
    vi.clearAllMocks()
  })

  it("returns ClaudeCodeAdapter when CLAUDE_CODE env is set", async () => {
    process.env.CLAUDE_CODE = "1"
    const { getAdapter } = await import("./index")
    const adapter = getAdapter()
    expect(adapter.type).toBe("claude-code")
  })

  it("returns CodexAdapter when CODEX_CLI env is set", async () => {
    process.env.CODEX_CLI = "1"
    const { getAdapter } = await import("./index")
    const adapter = getAdapter()
    expect(adapter.type).toBe("codex")
  })

  it("returns CursorAdapter when CURSOR_SESSION env is set", async () => {
    process.env.CURSOR_SESSION = "1"
    const { getAdapter } = await import("./index")
    const adapter = getAdapter()
    expect(adapter.type).toBe("cursor")
  })

  it("returns GenericAdapter when no harness is detected", async () => {
    const { getAdapter } = await import("./index")
    const adapter = getAdapter()
    expect(adapter.type).toBe("generic")
  })

  it("returned adapter satisfies HarnessAdapter interface", async () => {
    process.env.CLAUDE_CODE = "1"
    const { getAdapter } = await import("./index")
    const adapter: HarnessAdapter = getAdapter()
    expect(typeof adapter.executeTool).toBe("function")
    expect(typeof adapter.isAvailable).toBe("function")
    expect(typeof adapter.getConfig).toBe("function")
    expect(adapter.capabilities).toBeDefined()
  })
})
