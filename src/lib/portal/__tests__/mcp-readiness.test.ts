import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/postgres/connection", () => ({ isPoolHealthy: vi.fn(async () => true) }));
vi.mock("@/lib/sdk/index", () => ({ AlluraClient: class { constructor(public config: unknown) {} } }));
import { checkLiveness, checkReadiness } from "@/lib/health/probes";
import { createServerClient } from "@/lib/sdk/server-client";
import { isPoolHealthy } from "@/lib/postgres/connection";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ALLURA_MCP_BASE_URL", "http://allura-memory-mcp:3201");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(isPoolHealthy).mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("requires an explicit production URL in both readiness and SDK", async () => {
  vi.stubEnv("ALLURA_MCP_BASE_URL", "");
  expect((await checkReadiness()).ready).toBe(false);
  expect(() => createServerClient()).toThrow(/ALLURA_MCP_BASE_URL/);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not mask wrong localhost topology or connection failures", async () => {
  vi.stubEnv("ALLURA_MCP_BASE_URL", "http://localhost:3201");
  fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
  expect((await checkReadiness()).ready).toBe(false);
  expect(checkLiveness().alive).toBe(true);
});
it.each([
  [503, '{"ready":true}'], [302, ''], [200, '<html>login</html>'],
  [200, '{}'], [200, '{"ready":false}'], [200, '{"ready":"true"}'], [200, 'null'],
])("rejects MCP status %s / body %s", async (status, body) => {
  fetchMock.mockResolvedValue(new Response(body, { status }));
  expect((await checkReadiness()).ready).toBe(false);
});
it("checks the gateway contract without redirects or cached responses and recovers", async () => {
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ready: true }));
  expect((await checkReadiness()).ready).toBe(false);
  expect((await checkReadiness()).ready).toBe(true);
  expect(String(fetchMock.mock.calls[1][0])).toBe("http://allura-memory-mcp:3201/ready");
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: "error", cache: "no-store" });
});
it("bounds the entire readiness probe even when both dependencies hang", async () => {
  vi.useFakeTimers();
  vi.mocked(isPoolHealthy).mockImplementation(() => new Promise(() => {}));
  fetchMock.mockImplementation(() => new Promise(() => {}));
  let result: Awaited<ReturnType<typeof checkReadiness>> | undefined;
  const pending = checkReadiness().then(value => { result = value; });
  await vi.advanceTimersByTimeAsync(4501);
  expect(result?.ready).toBe(false);
  expect(result?.checks.mcp.healthy).toBe(false);
  await pending;
});
