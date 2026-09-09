/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TokenInventoryPanel } from "@/components/portal/token-inventory-panel";

const fetchMock = vi.fn();

beforeEach(() => {
  cleanup();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TokenInventoryPanel", () => {
  it("lists safe prefixes only and revokes through the scoped API", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        tokens: [{
          id: "tok_1",
          token_prefix: "allura_mcp_abcd1234",
          agent_name: "Sabir desktop",
          scopes: ["memory:read"],
          token: "allura_mcp_RAW_SHOULD_NEVER_RENDER",
          token_hash: "HASH_SHOULD_NEVER_RENDER",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, id: "tok_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    const { container } = render(createElement(TokenInventoryPanel, { isAdmin: true, workspaceId: "ws_1" }));

    await screen.findByText("allura_mcp_abcd1234");
    expect(container.textContent).not.toContain("allura_mcp_RAW_SHOULD_NEVER_RENDER");
    expect(container.textContent).not.toContain("HASH_SHOULD_NEVER_RENDER");

    fireEvent.click(screen.getByRole("button", { name: "Revoke allura_mcp_abcd1234" }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/tokens/tok_1/revoke", { method: "POST" }));
    await waitFor(() => expect(screen.queryByText("allura_mcp_abcd1234")).toBeNull());
  });
});
