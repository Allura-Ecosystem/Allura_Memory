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
  it("does not claim an empty inventory on API failure and supports retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tokens: [] }), { status: 200 }));
    render(createElement(TokenInventoryPanel, { isAdmin: true, workspaceId: "ws_1", pairedDeviceId: "desktop" }));
    await screen.findByRole("alert");
    expect(screen.queryByText(/No active/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh credentials" }));
    await screen.findByText("No active credentials for this device.");
  });

  it("shows only active credentials bound to the selected device", async () => {
    const row = { agent_name: "owner", scopes: ["memory:read"] };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ tokens: [
      { ...row, id: "a", token_prefix: "desktop-active", paired_device_id: "desktop" },
      { ...row, id: "b", token_prefix: "laptop-active", paired_device_id: "laptop" },
      { ...row, id: "c", token_prefix: "unpaired", paired_device_id: null },
      { ...row, id: "d", token_prefix: "revoked", paired_device_id: "desktop", revoked_at: "2026-01-01" },
      { ...row, id: "e", token_prefix: "expired", paired_device_id: "desktop", expires_at: "2020-01-01" },
    ] }), { status: 200 }));
    render(createElement(TokenInventoryPanel, { isAdmin: true, workspaceId: "ws_1", pairedDeviceId: "desktop" }));
    await screen.findByText("desktop-active");
    expect(screen.queryByRole("button", { name: "Revoke desktop-active" })).toBeNull();
    for (const label of ["laptop-active", "unpaired", "revoked", "expired"]) expect(screen.queryByText(label)).toBeNull();
  });
  it("lists safe prefixes only and revokes through the scoped API", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        tokens: [{
          id: "tok_1",
          token_prefix: "allura_mcp_abcd1234",
          agent_name: "Sabir desktop",
          scopes: ["memory:read"],
          token: "allura_mcp_fixture_000000000000000000",
          token_hash: "HASH_SHOULD_NEVER_RENDER",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, id: "tok_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    const { container } = render(createElement(TokenInventoryPanel, { isAdmin: true, workspaceId: "ws_1" }));

    await screen.findByText("allura_mcp_abcd1234");
    expect(container.textContent).not.toContain("allura_mcp_fixture_000000000000000000");
    expect(container.textContent).not.toContain("HASH_SHOULD_NEVER_RENDER");

    fireEvent.click(screen.getByRole("button", { name: "Revoke allura_mcp_abcd1234" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke credential" }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/tokens/tok_1/revoke", { method: "POST" }));
    await waitFor(() => expect(screen.queryByText("allura_mcp_abcd1234")).toBeNull());
  });
});
