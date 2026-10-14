import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/postgres/connection", () => ({ getPool: () => ({ query }) }));
import { revokeToken } from "./repository";

describe("tenant-scoped token revocation", () => {
  beforeEach(() => { query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 }); });

  it("binds token and authenticated tenant in one idempotent update", async () => {
    await revokeToken("tok_'literal", "allura-company");
    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\$1\s+AND\s+group_id\s*=\s*\$2\s+AND\s+revoked_at\s+IS\s+NULL/i);
    expect(values).toEqual(["tok_'literal", "allura-company"]);
    expect(sql).not.toContain("tok_'literal");
  });

  it.each([undefined, null, "", "other", "allura-BAD"])("refuses invalid tenant before querying: %s", async group => {
    await expect(revokeToken("tok_1", group as string)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps nonexistent, foreign and already-revoked no-op result opaque", async () => {
    await expect(revokeToken("tok_foreign", "allura-company")).resolves.toBeUndefined();
  });
});
