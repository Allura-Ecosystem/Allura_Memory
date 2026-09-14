/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionWizard } from "@/components/portal/connection-wizard";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
beforeEach(() => { cleanup(); localStorage.clear(); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

const props = {
  endpoint: "https://mcp.faithmeats.org/mcp",
  authorizationHeader: "Authorization: Bearer <your Allura MCP credential>",
};

describe("Clients screen", () => {
  it("clears a credential when leaving setup and never copies it into a config", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ token: "test-sensitive-once" }), { status: 201 }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(createElement(ConnectionWizard, { ...props, isAdmin: true, workspaceId: "ws_personal" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect OpenCode" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));
    await screen.findByText("test-sensitive-once");
    fireEvent.click(screen.getByRole("button", { name: "Copy setup" }));
    await screen.findByText("Setup copied. Add your credential only in your local secret store.");
    expect(writeText.mock.calls[0][0]).not.toContain("test-sensitive-once");
    fireEvent.click(screen.getByRole("button", { name: "Back to clients" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect OpenCode" }));
    expect(screen.queryByText("test-sensitive-once")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("does not report a stale clipboard success after changing clients", async () => {
    let settle!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { settle = resolve; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(createElement(ConnectionWizard, props));
    fireEvent.click(screen.getByRole("button", { name: "Connect Hermes" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to clients" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect OpenCode" }));
    await act(async () => { settle(); });
    expect(screen.queryByText("Setup copied. Add your credential only in your local secret store.")).toBeNull();
    expect(screen.getByTestId("client-config").textContent).toContain('"type": "remote"');
  });

  it("keeps setup open during issuance and exposes an API denial without a success state", async () => {
    let settle!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    render(createElement(ConnectionWizard, { ...props, isAdmin: true, workspaceId: "ws_personal" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Hermes" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));
    expect((screen.getByRole("button", { name: "Back to clients" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Credentials" }) as HTMLButtonElement).disabled).toBe(true);
    settle(new Response(JSON.stringify({ error: "Not authorized for this workspace" }), { status: 403 }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("Not authorized");
    expect((screen.getByRole("button", { name: "Back to clients" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/^Connected$/)).toBeNull();
  });

  it.each(["ChatGPT", "Claude Desktop", "OpenClaw"])("does not mint credentials for the unverified %s adapter", (name) => {
    render(createElement(ConnectionWizard, { ...props, isAdmin: true, workspaceId: "ws_personal" }));
    fireEvent.click(screen.getByRole("button", { name: `Connect ${name}` }));
    expect(screen.queryByRole("button", { name: "Issue credential" })).toBeNull();
    expect(screen.getByText(/Setup is unavailable until the adapter is verified/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("handles clipboard denial without reporting success", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(createElement(ConnectionWizard, props));
    fireEvent.click(screen.getByRole("button", { name: "Connect Custom client" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy setup" }));
    await screen.findByText("Clipboard unavailable. Select and copy the setup text below.");
    expect(screen.queryByText(/^Setup copied/)).toBeNull();
  });

  it("filters clients and opens the real credential inventory without claiming connection", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ tokens: [] }), { status: 200 }));
    render(createElement(ConnectionWizard, { ...props, isAdmin: true, workspaceId: "ws_personal" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search clients" }), { target: { value: "opencode" } });
    expect(screen.getByRole("button", { name: "Connect OpenCode" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect Hermes" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search clients" }), { target: { value: "unknown-tool" } });
    expect(screen.getByText("No clients match your search.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Credentials" }));
    await screen.findByText("No active unpaired credentials.");
    expect(fetchMock).toHaveBeenCalledWith("/api/tokens?workspace_id=ws_personal");
  });

  it("offers a safe config copy and the client-side test command", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(createElement(ConnectionWizard, props));
    fireEvent.click(screen.getByRole("button", { name: "Connect OpenCode" }));
    expect(screen.getByTestId("client-config").textContent).toContain('"type": "remote"');
    expect(screen.getByTestId("client-config").textContent).toContain("{env:ALLURA_MCP_TOKEN}");
    expect(screen.getByText("opencode mcp list")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy setup" }));
    await screen.findByText("Setup copied. Add your credential only in your local secret store.");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).not.toContain("undefined");
  });

  it("lets a person choose a client with a Connect button and return to the catalog", () => {
    render(createElement(ConnectionWizard, props));
    for (const name of ["ChatGPT", "Claude Desktop", "Hermes", "OpenCode", "OpenClaw"]) {
      expect(screen.getByRole("button", { name: `Connect ${name}` })).toBeTruthy();
    }
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect OpenCode" }));
    expect(screen.getByRole("heading", { name: "Connect OpenCode" })).toBeTruthy();
    expect(screen.getByText(/not verified/i)).toBeTruthy();
    expect(screen.queryByText(/^Connected$/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to clients" }));
    expect(screen.getByRole("button", { name: "Connect OpenCode" })).toBe(document.activeElement);
  });

  it("issues an explicitly requested scoped credential from the selected client's setup", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: "test-once-credential" }), { status: 201 }));
    render(createElement(ConnectionWizard, { ...props, isAdmin: true, workspaceId: "ws_personal" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Hermes" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Agent name") as HTMLInputElement).value).toBe("Hermes");
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));
    await screen.findByText("test-once-credential");
    expect(fetchMock).toHaveBeenCalledWith("/api/tokens", expect.objectContaining({
      method: "POST", body: JSON.stringify({ workspace_id: "ws_personal", agent_name: "Hermes" }),
    }));
    expect(screen.queryByText(/^Connected$/)).toBeNull();
    expect(localStorage.length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss credential" }));
    expect(screen.queryByText("test-once-credential")).toBeNull();
  });
});
