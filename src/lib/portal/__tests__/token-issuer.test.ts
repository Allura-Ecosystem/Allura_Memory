/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TokenIssuerPanel } from "@/components/portal/token-issuer-panel";

const fetchMock = vi.fn();

beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TokenIssuerPanel", () => {
  it("tells a viewer that an administrator must issue credentials without calling an API", () => {
    render(createElement(TokenIssuerPanel, { isAdmin: false }));

    expect(screen.getByRole("status").textContent).toContain("An administrator must issue an allura MCP credential");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an issued credential once then clears it without browser persistence", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        workspaces: [{ workspace_id: "ws_1", name: "Faith Meats" }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: "allura_mcp_RAW_ONCE",
        record: { id: "tok_1", token_prefix: "allura_mcp_abcd1234" },
      }), { status: 201, headers: { "content-type": "application/json" } }));

    render(createElement(TokenIssuerPanel, { isAdmin: true }));

    await screen.findByRole("option", { name: "Faith Meats" });
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Sabir desktop" } });
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));

    await screen.findByText("allura_mcp_RAW_ONCE");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/tokens", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ workspace_id: "ws_1", agent_name: "Sabir desktop" }),
    }));
    expect(localStorage.length).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss credential" }));
    await waitFor(() => expect(screen.queryByText("allura_mcp_RAW_ONCE")).toBeNull());
    expect(localStorage.length).toBe(0);
  });
});
