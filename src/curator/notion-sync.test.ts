/**
 * notion-sync.test.ts
 *
 * Unit tests for src/curator/notion-sync.ts
 *
 * Strategy:
 * - Mock `getPool` so no real DB connection is required
 * - Mock `insertDlqEntry` to assert DLQ routing on failure
 * - Inject a mock `notionCreatePage` to control success / failure paths
 */

import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock postgres connection before importing the module under test
vi.mock("../lib/postgres/connection", () => ({
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

// Mock DLQ module
vi.mock("./notion-sync-dlq", () => ({
  insertDlqEntry: vi.fn(),
}));

import {
  DEFAULT_NOTION_CURATOR_DB_ID,
  getPendingProposals,
  markSynced,
  NOTION_CURATOR_DATA_SOURCE_ID,
  type NotionCreatePageFn,
  type NotionSyncConfig,
  type PendingProposal,
  syncToNotion,
} from "./notion-sync";
import { insertDlqEntry } from "./notion-sync-dlq";
import { getPool } from "../lib/postgres/connection";

// ── Helpers ───────────────────────────────────────────────────────────────────

const GROUP_ID = "allura-roninmemory";

function makeProposal(overrides: Partial<PendingProposal> = {}): PendingProposal {
  return {
    id: "proposal-abc-123",
    content: "Agents should always validate group_id at query time",
    score: "0.87",
    reasoning: "Prevents tenant data leakage",
    tier: "emerging",
    created_at: "2026-04-13T10:00:00.000Z",
    trace_ref: 42,
    ...overrides,
  };
}

function makePool(queryRows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows: queryRows }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("syncToNotion", () => {
  let mockPool: ReturnType<typeof makePool>;
  let mockInsertDlqEntry: MockInstance;

  beforeEach(() => {
    mockPool = makePool();
    vi.mocked(getPool).mockReturnValue(mockPool as never);
    mockInsertDlqEntry = vi.mocked(insertDlqEntry);
    mockInsertDlqEntry.mockReset();
    mockInsertDlqEntry.mockResolvedValue({ success: true, dlqId: 99 });
  });

  // ── No proposals ────────────────────────────────────────────────────────────

  it("returns zero counts when no pending proposals exist", async () => {
    // DB returns empty rows
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await syncToNotion({ groupId: GROUP_ID });

    expect(result).toEqual({
      proposalsFound: 0,
      proposalsSynced: 0,
      syncedProposalIds: [],
      errors: [],
    });
  });

  // ── Unconfigured (no notionCreatePage) ──────────────────────────────────────

  it("returns unconfigured state when notionCreatePage is not provided", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [makeProposal()] });

    const result = await syncToNotion({ groupId: GROUP_ID });

    expect(result.proposalsFound).toBe(1);
    expect(result.proposalsSynced).toBe(0);
    expect(result.errors[0]).toMatch(/notionCreatePage/);
    expect(result.errors[1]).toMatch(/1 pending proposals/);
  });

  // ── Successful sync ─────────────────────────────────────────────────────────

  it("creates a Notion page and marks proposal as synced on success", async () => {
    const proposal = makeProposal();
    // First query: getPendingProposals
    mockPool.query.mockResolvedValueOnce({ rows: [proposal] });
    // Second query: markSynced UPDATE
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const mockCreate: NotionCreatePageFn = vi.fn().mockResolvedValue({
      id: "notion-page-id-xyz",
      url: "https://notion.so/workspace/notion-page-id-xyz",
    });

    const result = await syncToNotion({
      groupId: GROUP_ID,
      notionCreatePage: mockCreate,
    });

    expect(result.proposalsSynced).toBe(1);
    expect(result.syncedProposalIds).toEqual([proposal.id]);
    expect(result.errors).toHaveLength(0);

    // Verify the Notion call was made with correct parameters
    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(mockCreate).mock.calls[0][0];
    expect(callArgs.dataSourceId).toBe(NOTION_CURATOR_DATA_SOURCE_ID);
    expect(callArgs.properties.Title).toBe(proposal.content.slice(0, 100));
    expect(callArgs.properties.Status).toBe("pending");
    expect(callArgs.properties.Type).toBe("insight"); // emerging → insight
    expect(callArgs.properties.Score).toBe(0.87);
    expect(callArgs.properties["Group ID"]).toBe(GROUP_ID);
    expect(callArgs.properties["date:Proposed At:start"]).toBe("2026-04-13");
    expect(callArgs.properties["Notion Synced"]).toBe("__YES__");
    expect(callArgs.properties.Notes).toContain("Trace ref: 42");
    expect(callArgs.properties.Notes).toContain("Prevents tenant data leakage");

    // Verify markSynced was called (the UPDATE query)
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    const markSyncedCall = mockPool.query.mock.calls[1];
    expect(markSyncedCall[1]).toContain("[notion:notion-page-id-xyz]");
    expect(mockInsertDlqEntry).not.toHaveBeenCalled();
  });

  // ── Tier → Type mapping ─────────────────────────────────────────────────────

  it.each([
    ["emerging", "insight"],
    ["adoption", "pattern"],
    ["mainstream", "decision"],
    ["unknown-tier", "insight"], // fallback
  ])("maps tier '%s' to Notion Type '%s'", async (tier, expectedType) => {
    const proposal = makeProposal({ tier });
    mockPool.query
      .mockResolvedValueOnce({ rows: [proposal] })
      .mockResolvedValueOnce({ rows: [] });

    const mockCreate: NotionCreatePageFn = vi.fn().mockResolvedValue({
      id: "page-id",
      url: "https://notion.so/page-id",
    });

    await syncToNotion({ groupId: GROUP_ID, notionCreatePage: mockCreate });

    const callArgs = vi.mocked(mockCreate).mock.calls[0][0];
    expect(callArgs.properties.Type).toBe(expectedType);
  });

  // ── Title truncation ────────────────────────────────────────────────────────

  it("truncates content to 100 chars for the Notion Title property", async () => {
    const longContent = "A".repeat(200);
    const proposal = makeProposal({ content: longContent });
    mockPool.query
      .mockResolvedValueOnce({ rows: [proposal] })
      .mockResolvedValueOnce({ rows: [] });

    const mockCreate: NotionCreatePageFn = vi.fn().mockResolvedValue({
      id: "page-id",
      url: "https://notion.so/page-id",
    });

    await syncToNotion({ groupId: GROUP_ID, notionCreatePage: mockCreate });

    const callArgs = vi.mocked(mockCreate).mock.calls[0][0];
    expect(callArgs.properties.Title).toHaveLength(100);
  });

  // ── DLQ routing on failure ──────────────────────────────────────────────────

  it("routes to DLQ and records error when notionCreatePage throws", async () => {
    const proposal = makeProposal();
    mockPool.query.mockResolvedValueOnce({ rows: [proposal] });

    const mockCreate: NotionCreatePageFn = vi.fn().mockRejectedValue(
      new Error("Notion API rate limited")
    );

    const result = await syncToNotion({
      groupId: GROUP_ID,
      notionCreatePage: mockCreate,
    });

    expect(result.proposalsSynced).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Notion API rate limited/);

    // DLQ must be called — no silent drops
    expect(mockInsertDlqEntry).toHaveBeenCalledOnce();
    const dlqCall = mockInsertDlqEntry.mock.calls[0][1];
    expect(dlqCall.groupId).toBe(GROUP_ID);
    expect(dlqCall.proposalId).toBe(proposal.id);
    expect(dlqCall.errorMessage).toBe("Notion API rate limited");
    expect(dlqCall.errorCode).toBe("NOTION_CREATE_FAILED");
    expect(dlqCall.originalMetadata.proposal_id).toBe(proposal.id);
  });

  it("records DLQ insert failure in errors without throwing", async () => {
    const proposal = makeProposal();
    mockPool.query.mockResolvedValueOnce({ rows: [proposal] });

    const mockCreate: NotionCreatePageFn = vi.fn().mockRejectedValue(
      new Error("Notion down")
    );

    // Simulate DLQ also failing
    mockInsertDlqEntry.mockResolvedValue({ success: false, error: "DB unreachable" });

    const result = await syncToNotion({
      groupId: GROUP_ID,
      notionCreatePage: mockCreate,
    });

    expect(result.proposalsSynced).toBe(0);
    // Two errors: one for Notion failure, one for DLQ failure
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/Notion down/);
    expect(result.errors[1]).toMatch(/CRITICAL.*DLQ.*DB unreachable/);
  });

  // ── Multiple proposals: partial success ────────────────────────────────────

  it("processes multiple proposals independently — partial success with DLQ routing", async () => {
    const p1 = makeProposal({ id: "p1", content: "First proposal" });
    const p2 = makeProposal({ id: "p2", content: "Second proposal", tier: "adoption" });
    const p3 = makeProposal({ id: "p3", content: "Third proposal", tier: "mainstream" });

    mockPool.query
      .mockResolvedValueOnce({ rows: [p1, p2, p3] }) // getPendingProposals
      .mockResolvedValueOnce({ rows: [] }) // markSynced p1
      .mockResolvedValueOnce({ rows: [] }); // markSynced p3

    let callCount = 0;
    const mockCreate: NotionCreatePageFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("p2 failed");
      }
      return { id: `page-${callCount}`, url: `https://notion.so/page-${callCount}` };
    });

    const result = await syncToNotion({
      groupId: GROUP_ID,
      notionCreatePage: mockCreate,
    });

    expect(result.proposalsFound).toBe(3);
    expect(result.proposalsSynced).toBe(2);
    expect(result.syncedProposalIds).toContain("p1");
    expect(result.syncedProposalIds).toContain("p3");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/p2.*p2 failed/);
    expect(mockInsertDlqEntry).toHaveBeenCalledOnce();
  });

  // ── Notes field when no trace_ref or reasoning ──────────────────────────────

  it("falls back to tier in Notes when trace_ref and reasoning are absent", async () => {
    const proposal = makeProposal({ trace_ref: null, reasoning: null });
    mockPool.query
      .mockResolvedValueOnce({ rows: [proposal] })
      .mockResolvedValueOnce({ rows: [] });

    const mockCreate: NotionCreatePageFn = vi.fn().mockResolvedValue({
      id: "page-id",
      url: "https://notion.so/page-id",
    });

    await syncToNotion({ groupId: GROUP_ID, notionCreatePage: mockCreate });

    const callArgs = vi.mocked(mockCreate).mock.calls[0][0];
    expect(callArgs.properties.Notes).toBe("Tier: emerging");
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("exports the correct default Notion DB ID", () => {
    expect(DEFAULT_NOTION_CURATOR_DB_ID).toBe("08d2e672-2a73-45b0-a31d-b4a7be551e16");
  });

  it("exports the correct Notion data source ID", () => {
    expect(NOTION_CURATOR_DATA_SOURCE_ID).toBe("42894678-aedb-4c90-9371-6494a9fe5270");
  });
});

// ── getPendingProposals ───────────────────────────────────────────────────────

describe("getPendingProposals", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReturnValue(makePool() as never);
  });

  it("rejects invalid group_id not matching ^allura-[a-z0-9-]+$", async () => {
    await expect(getPendingProposals("roninclaw-memory")).rejects.toThrow(/Invalid group_id/);
    await expect(getPendingProposals("allura_memory")).rejects.toThrow(/Invalid group_id/);
    await expect(getPendingProposals("ALLURA-memory")).rejects.toThrow(/Invalid group_id/);
  });

  it("accepts valid allura- prefixed group_id", async () => {
    const pool = makePool([makeProposal()]);
    vi.mocked(getPool).mockReturnValue(pool as never);

    const result = await getPendingProposals("allura-roninmemory");
    expect(result).toHaveLength(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("group_id = $1"),
      ["allura-roninmemory"]
    );
  });
});

// ── markSynced ───────────────────────────────────────────────────────────────

describe("markSynced", () => {
  it("scopes the Notion receipt update to the proposal tenant", async () => {
    const pool = makePool();
    vi.mocked(getPool).mockReturnValue(pool as never);

    await markSynced("proposal-id-123", "notion-page-abc", GROUP_ID);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $2 AND group_id = $3"),
      ["[notion:notion-page-abc]", "proposal-id-123", GROUP_ID]
    );
  });
});
