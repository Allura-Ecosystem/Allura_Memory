import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/postgres/connection", () => ({
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

import { getPool } from "../lib/postgres/connection";
import * as notionSyncWorker from "./notion-sync-worker";
import { writeNotionUrlToProposal } from "./notion-bridge";
import { markSynced } from "./notion-sync";

const GROUP_ID = "allura-receipt-scope";
const PROPOSAL_ID = "c17a735d-44a9-4e42-a797-7a91e5c6f3ba";
const PAGE_URL = "https://notion.so/tenant-scoped-receipt";

type TenantScopedWriter = (
  proposalId: string,
  groupId: string,
  notionPageUrl: string,
  pool?: { query: ReturnType<typeof vi.fn> },
) => Promise<void>;

function makePool(): { query: ReturnType<typeof vi.fn> } {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
}

describe("Notion proposal receipt tenant isolation", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReturnValue(makePool() as never);
  });

  it("scopes the worker receipt update to the event tenant", async () => {
    const writer = (notionSyncWorker as unknown as { writeNotionUrlToProposal: TenantScopedWriter })
      .writeNotionUrlToProposal;

    await writer(PROPOSAL_ID, GROUP_ID, PAGE_URL);

    const pool = vi.mocked(getPool).mock.results[0]?.value as ReturnType<typeof makePool>;
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $2 AND group_id = $3"),
      [`\n[notion-page:${PAGE_URL}]`, PROPOSAL_ID, GROUP_ID],
    );
  });

  it("scopes the bridge receipt update to the supplied tenant", async () => {
    const pool = makePool();
    const writer = writeNotionUrlToProposal as unknown as TenantScopedWriter;

    await writer(PROPOSAL_ID, GROUP_ID, PAGE_URL, pool);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $2 AND group_id = $3"),
      [`\n[notion-page:${PAGE_URL}]`, PROPOSAL_ID, GROUP_ID],
    );
  });

  it("rejects malformed tenant IDs before either receipt writer can query", async () => {
    const workerWriter = (notionSyncWorker as unknown as { writeNotionUrlToProposal: TenantScopedWriter })
      .writeNotionUrlToProposal;
    const pool = makePool();
    const bridgeWriter = writeNotionUrlToProposal as unknown as TenantScopedWriter;

    await expect(workerWriter(PROPOSAL_ID, "allura--", PAGE_URL)).rejects.toThrow(/Invalid group_id/);
    await expect(bridgeWriter(PROPOSAL_ID, "allura--", PAGE_URL, pool)).rejects.toThrow(/Invalid group_id/);
    await expect(markSynced(PROPOSAL_ID, "notion-page", "allura--")).rejects.toThrow(/Invalid group_id/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
