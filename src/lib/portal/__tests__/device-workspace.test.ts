/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceWorkspace } from "@/components/portal/device-workspace";
const props = { endpoint: "https://mcp.example.test/mcp", isAdmin: true, workspaceId: "ws_own" };
const devices = [
  { id: "dev-desktop", display_label: "My desktop", workspace_id: "ws_own", created_at: "2026-09-01T00:00:00Z", last_exchange_at: null },
  { id: "dev-laptop", display_label: "Travel laptop", workspace_id: "ws_own", created_at: "2026-09-02T00:00:00Z", last_exchange_at: "2026-09-14T10:00:00Z" },
];
beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("device-first workspace", () => {
  it("locks navigation while an account credential revocation is pending", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === "POST") return new Promise<Response>(resolve => { finish = resolve; });
      return new Response(JSON.stringify(String(url).includes("/api/tokens") ? { tokens: [
        { id: "token-account", token_prefix: "account-prefix", agent_name: "Hermes", scopes: ["memory:read"], paired_device_id: null }
      ] } : { devices }), { status: 200 });
    });
    render(createElement(DeviceWorkspace, props));
    await screen.findByRole("heading", { name: "My desktop" });
    fireEvent.click(screen.getByRole("button", { name: "Account connections" }));
    fireEvent.click(screen.getByRole("button", { name: "Credentials" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revoke account-prefix" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke credential" }));
    expect((screen.getByRole("button", { name: "Devices" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Clients" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    expect((screen.getByRole("button", { name: "Devices" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not carry a destructive confirmation from one device into another", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ devices }), { status: 200 }));
    render(createElement(DeviceWorkspace, { ...props, isAdmin: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Manage My desktop" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark lost" }));
    fireEvent.click(screen.getByRole("button", { name: "Account connections" }));
    fireEvent.click(screen.getByRole("button", { name: "Devices" }));
    fireEvent.click(screen.getByRole("button", { name: "Manage Travel laptop" }));
    expect(screen.queryByRole("button", { name: "Confirm mark lost" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mark lost" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("restores keyboard focus after returning or canceling a device action", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ devices }), { status: 200 }));
    render(createElement(DeviceWorkspace, { ...props, isAdmin: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Manage My desktop" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark lost" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Mark lost: My desktop?" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mark lost" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to devices" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Manage My desktop" }));
  });

  it("shows a recoverable inventory failure rather than an empty success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ devices }), { status: 200 }));
    render(createElement(DeviceWorkspace, props));
    await screen.findByRole("alert");
    expect(screen.queryByText("No paired devices yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh devices" }));
    await screen.findByRole("heading", { name: "My desktop" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("holds all section navigation while a confirmed device operation is pending", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ devices }), { status: 200 }))
      .mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    render(createElement(DeviceWorkspace, { ...props, isAdmin: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Manage My desktop" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark lost" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm mark lost" }));
    for (const name of ["Devices", "Account connections", "Profiles", "Cancel", "Back to devices"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    resolve(new Response(JSON.stringify({ status: "LOST", device_id: "dev-desktop" }), { status: 200 }));
    await screen.findByText("Device marked lost. Its device-bound credentials have been revoked.");
    expect(screen.getByRole("heading", { name: "Travel laptop" })).toBeTruthy();
  });
  it("offers read-write without any administrative or delete scopes", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === "POST" ? { token: "test-profile-once" } : { devices: [] }), { status: init?.method === "POST" ? 201 : 200 }));
    render(createElement(DeviceWorkspace, props));
    await screen.findByText("No paired devices yet.");
    fireEvent.click(screen.getByRole("button", { name: "Profiles" }));
    fireEvent.click(screen.getByRole("button", { name: "Use Read & write" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect OpenCode" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));
    await screen.findByText("test-profile-once");
    const request = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(request[1]!.body as string).scopes).toEqual(["memory:read", "memory:write"]);
  });
  it("explains target-device enrollment instead of fabricating a device", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ devices: [] }), { status: 200 }));
    render(createElement(DeviceWorkspace, props));
    await screen.findByText("No paired devices yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add device" }));
    expect(screen.getByRole("heading", { name: "Pair a device with allura" })).toBeTruthy();
    expect(screen.getByText(/Start pairing from a compatible allura client on the target computer/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("marks a device lost only after confirmation and retains it on an API denial", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ devices }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "MEMBERSHIP_INACTIVE" }), { status: 403 }));
    render(createElement(DeviceWorkspace, { ...props, isAdmin: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Manage My desktop" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark lost" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Mark lost" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm mark lost" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "My desktop" })).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/device-pairing/mark-lost");
    expect(screen.queryByText("Device marked lost. Its device-bound credentials have been revoked.")).toBeNull();
  });
  it("opens clients for a particular device without offering an unbound credential as device access", async () => {
    vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify(String(url).startsWith("/api/tokens") ? { tokens: [{ id: "bound", token_prefix: "bound-prefix", agent_name: "owner", scopes: ["memory:read"], paired_device_id: "dev-desktop" }] } : { devices }), { status: 200 }));
    render(createElement(DeviceWorkspace, props));
    fireEvent.click(await screen.findByRole("button", { name: "Manage My desktop" }));
    await screen.findByText("bound-prefix");
    fireEvent.click(screen.getByRole("button", { name: "Set up a client" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Hermes" }));
    expect(screen.getByText(/Device-bound setup requires a compatible local adapter/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Issue credential" })).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("applies a reusable read-only profile to an unpaired client without copying device authority", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === "POST" ? { token: "test-profile-once" } : { devices }), { status: init?.method === "POST" ? 201 : 200 }));
    render(createElement(DeviceWorkspace, props));
    await screen.findByRole("heading", { name: "My desktop" });
    fireEvent.click(screen.getByRole("button", { name: "Profiles" }));
    fireEvent.click(screen.getByRole("button", { name: "Use Read only" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Hermes" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));
    await screen.findByText("test-profile-once");
    const request = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(request[1]!.body as string)).toEqual({ workspace_id: "ws_own", agent_name: "Hermes", scopes: ["memory:read"] });
  });
  it("requires confirmation before disconnecting a device and removes only that device", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ devices }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "REVOKED", device_id: "dev-desktop" }), { status: 200 }));
    render(createElement(DeviceWorkspace, { ...props, isAdmin: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Manage My desktop" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect device" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm disconnect" }));
    await screen.findByText("Device disconnected. Its device-bound credentials have been revoked.");
    expect(vi.mocked(fetch).mock.calls[1]).toEqual(["/api/device-pairing/revoke", expect.objectContaining({ method: "POST", body: JSON.stringify({ device_id: "dev-desktop" }) })]);
    expect(screen.queryByRole("heading", { name: "My desktop" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Travel laptop" })).toBeTruthy();
  });
  it("loads the authenticated device inventory without inventing machines or online state", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ devices }), { status: 200 }));
    render(createElement(DeviceWorkspace, props));
    expect(await screen.findByRole("heading", { name: "My desktop" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Travel laptop" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/device-pairing/devices", expect.objectContaining({ cache: "no-store" }));
    expect(screen.queryByText(/^Online$/)).toBeNull();
    expect(screen.getByText("No credential exchange recorded")).toBeTruthy();
  });
});
