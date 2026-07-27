/**
 * Memory Writeback Helper Tests — Story 20.5
 *
 * Verifies:
 * - writeTaskOutcome calls memory_add with structured content and metadata
 * - Content format: "Task: {summary} | Outcome: {outcome} | Files: {files} | Decisions: {decisions}"
 * - Metadata includes type, agent_id, files_changed, outcome, key_decisions
 * - group_id validation is enforced
 * - Required field validation (task_summary, agent_id, outcome)
 * - MCP tool wrapper returns proper response envelope
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock environment ──────────────────────────────────────────────────────────

process.env.ALLURA_DEV_AUTH_ENABLED = "true";
// @ts-expect-error — NODE_ENV is read-only in Next.js types but must be set for tests
process.env.NODE_ENV = "test";

// ── Mutable mock state ────────────────────────────────────────────────────────

const mockAddResponse = {
  id: "mem-test-001" as any,
  stored: "episodic" as const,
  score: 0.75,
  created_at: "2026-07-27T00:00:00Z",
};

const memoryAddMock = vi.fn(async () => ({ ...mockAddResponse }));

// ── Mock canonical-tools ──────────────────────────────────────────────────────

vi.mock("@/mcp/canonical-tools", () => ({
  memory_add: memoryAddMock,
  memory_search: vi.fn(),
  memory_get: vi.fn(),
  memory_list: vi.fn(),
  memory_delete: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import {
  writeTaskOutcome,
  buildTaskOutcomeContent,
  buildTaskOutcomeMetadata,
  memory_writeback_tool,
} from "@/lib/memory/memory-writeback";
import type { TaskOutcomeParams } from "@/lib/memory/memory-writeback";
import { GroupIdValidationError } from "@/lib/validation/group-id";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<TaskOutcomeParams> = {}): TaskOutcomeParams {
  return {
    task_summary: "Implement auth module",
    group_id: "allura-system",
    agent_id: "woz",
    outcome: "pass",
    files_changed: ["src/auth.ts", "src/auth.test.ts"],
    key_decisions: ["Used JWT over session cookies"],
    ...overrides,
  };
}

beforeEach(() => {
  memoryAddMock.mockReset();
  memoryAddMock.mockResolvedValue({ ...mockAddResponse });
});

// ── buildTaskOutcomeContent ────────────────────────────────────────────────────

describe("Story 20.5 — buildTaskOutcomeContent", () => {
  it("builds content with all fields present", () => {
    const content = buildTaskOutcomeContent(makeParams());
    expect(content).toContain("Task: Implement auth module");
    expect(content).toContain("Outcome: pass");
    expect(content).toContain("Files: src/auth.ts, src/auth.test.ts");
    expect(content).toContain("Decisions: Used JWT over session cookies");
    expect(content).toContain(" | ");
  });

  it("uses (none) for empty files_changed", () => {
    const content = buildTaskOutcomeContent(makeParams({ files_changed: [] }));
    expect(content).toContain("Files: (none)");
  });

  it("uses (none) for empty key_decisions", () => {
    const content = buildTaskOutcomeContent(makeParams({ key_decisions: [] }));
    expect(content).toContain("Decisions: (none)");
  });

  it("uses (none) for undefined files_changed", () => {
    const content = buildTaskOutcomeContent(makeParams({ files_changed: undefined }));
    expect(content).toContain("Files: (none)");
  });

  it("uses (none) for undefined key_decisions", () => {
    const content = buildTaskOutcomeContent(makeParams({ key_decisions: undefined }));
    expect(content).toContain("Decisions: (none)");
  });
});

// ── buildTaskOutcomeMetadata ───────────────────────────────────────────────────

describe("Story 20.5 — buildTaskOutcomeMetadata", () => {
  it("builds metadata with all fields", () => {
    const metadata = buildTaskOutcomeMetadata(makeParams());
    expect(metadata["type"]).toBe("task_outcome");
    expect(metadata["agent_id"]).toBe("woz");
    expect(metadata["files_changed"]).toEqual(["src/auth.ts", "src/auth.test.ts"]);
    expect(metadata["outcome"]).toBe("pass");
    expect(metadata["key_decisions"]).toEqual(["Used JWT over session cookies"]);
  });

  it("defaults files_changed to empty array", () => {
    const metadata = buildTaskOutcomeMetadata(makeParams({ files_changed: undefined }));
    expect(metadata["files_changed"]).toEqual([]);
  });

  it("defaults key_decisions to empty array", () => {
    const metadata = buildTaskOutcomeMetadata(makeParams({ key_decisions: undefined }));
    expect(metadata["key_decisions"]).toEqual([]);
  });

  it("includes conversation_id when provided", () => {
    const metadata = buildTaskOutcomeMetadata(
      makeParams({ conversation_id: "conv-123" })
    );
    expect(metadata["conversation_id"]).toBe("conv-123");
  });

  it("omits conversation_id when not provided", () => {
    const metadata = buildTaskOutcomeMetadata(makeParams());
    expect(metadata["conversation_id"]).toBeUndefined();
  });
});

// ── writeTaskOutcome ───────────────────────────────────────────────────────────

describe("Story 20.5 — writeTaskOutcome", () => {
  it("calls memory_add with structured content and metadata", async () => {
    const params = makeParams();
    const result = await writeTaskOutcome(params);

    expect(memoryAddMock).toHaveBeenCalledTimes(1);
    const callArgs = (memoryAddMock.mock.calls[0] as any[])[0] as Record<string, unknown>;
    expect(callArgs["group_id"]).toBe("allura-system");
    expect(callArgs["user_id"]).toBe("woz");
    expect((callArgs["content"] as string)).toContain("Task: Implement auth module");
    expect((callArgs["content"] as string)).toContain("Outcome: pass");
    const metadata = callArgs["metadata"] as Record<string, unknown>;
    expect(metadata["type"]).toBe("task_outcome");
    expect(metadata["source"]).toBe("conversation");
  });

  it("returns the memory response, content, and metadata", async () => {
    const result = await writeTaskOutcome(makeParams());

    expect(result.memory.id).toBe("mem-test-001");
    expect(result.content).toContain("Task: Implement auth module");
    expect(result.metadata["type"]).toBe("task_outcome");
  });

  it("uses agent_id as user_id when user_id not provided", async () => {
    await writeTaskOutcome(makeParams({ agent_id: "bellard" }));

    const callArgs = (memoryAddMock.mock.calls[0] as any[])[0] as Record<string, unknown>;
    expect(callArgs["user_id"]).toBe("bellard");
  });

  it("uses explicit user_id when provided", async () => {
    await writeTaskOutcome(makeParams({ user_id: "user-42", agent_id: "bellard" }));

    const callArgs = (memoryAddMock.mock.calls[0] as any[])[0] as Record<string, unknown>;
    expect(callArgs["user_id"]).toBe("user-42");
  });

  it("rejects invalid group_id format", async () => {
    await expect(
      writeTaskOutcome(makeParams({ group_id: "invalid" }))
    ).rejects.toThrow(GroupIdValidationError);
  });

  it("rejects empty task_summary", async () => {
    await expect(
      writeTaskOutcome(makeParams({ task_summary: "" }))
    ).rejects.toThrow("task_summary is required");
  });

  it("rejects whitespace-only task_summary", async () => {
    await expect(
      writeTaskOutcome(makeParams({ task_summary: "   " }))
    ).rejects.toThrow("task_summary is required");
  });

  it("rejects empty agent_id", async () => {
    await expect(
      writeTaskOutcome(makeParams({ agent_id: "" }))
    ).rejects.toThrow("agent_id is required");
  });

  it("rejects invalid outcome value", async () => {
    await expect(
      writeTaskOutcome(makeParams({ outcome: "skipped" as any }))
    ).rejects.toThrow("outcome must be 'pass', 'fail', or 'partial'");
  });

  it("accepts all valid outcome values", async () => {
    for (const outcome of ["pass", "fail", "partial"] as const) {
      memoryAddMock.mockClear();
      await writeTaskOutcome(makeParams({ outcome }));
      expect(memoryAddMock).toHaveBeenCalledTimes(1);
      const callArgs = (memoryAddMock.mock.calls[0] as any[])[0] as Record<string, unknown>;
      expect((callArgs["content"] as string)).toContain(`Outcome: ${outcome}`);
    }
  });
});

// ── memory_writeback_tool (MCP wrapper) ────────────────────────────────────────

describe("Story 20.5 — memory_writeback_tool", () => {
  it("returns data envelope on success", async () => {
    const response = await memory_writeback_tool({
      task_summary: "Deployed the API",
      group_id: "allura-system",
      agent_id: "woz",
      outcome: "pass",
      files_changed: ["src/api.ts"],
    });

    expect(response.data).not.toBeNull();
    expect(response.data!.memory_id).toBe("mem-test-001");
    expect(response.data!.content).toContain("Task: Deployed the API");
    expect(response.data!.metadata["type"]).toBe("task_outcome");
    expect(response.error).toBeNull();
    expect(response.meta.contract_version).toBe("v1");
  });

  it("returns error envelope on invalid group_id", async () => {
    const response = await memory_writeback_tool({
      task_summary: "Test",
      group_id: "invalid",
      agent_id: "woz",
      outcome: "pass",
    });

    expect(response.data).toBeNull();
    expect(response.error).toBeTruthy();
  });

  it("returns error envelope on empty task_summary", async () => {
    const response = await memory_writeback_tool({
      task_summary: "",
      group_id: "allura-system",
      agent_id: "woz",
      outcome: "pass",
    });

    expect(response.data).toBeNull();
    expect(response.error).toContain("task_summary");
  });

  it("returns error envelope when memory_add throws", async () => {
    memoryAddMock.mockRejectedValue(new Error("DB write failed"));

    const response = await memory_writeback_tool({
      task_summary: "Test task",
      group_id: "allura-system",
      agent_id: "woz",
      outcome: "pass",
    });

    expect(response.data).toBeNull();
    expect(response.error).toBe("DB write failed");
  });
});