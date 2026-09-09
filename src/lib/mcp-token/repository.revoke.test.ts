import { describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/postgres/connection", () => ({
  getPool: () => ({ query }),
}));

import { revokeToken } from "@/lib/mcp-token/repository";

describe("revokeToken", () => {
  it("binds revocation to the authenticated tenant instead of token ID alone", async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [] });

    await expect(revokeToken("tok_known_elsewhere", "allura-faithmeats")).resolves.toBe(true);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND group_id = $2 AND revoked_at IS NULL"),
      ["tok_known_elsewhere", "allura-faithmeats"],
    );
  });
});
