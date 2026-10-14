import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pool: { query: vi.fn() }, getPool: vi.fn(), listRuns: vi.fn(), getRun: vi.fn(),
  createRun: vi.fn(), updateRunSnapshot: vi.fn(), getDefinition: vi.fn(), getLatestDefinition: vi.fn(), diagnoseRun: vi.fn(),
}));
vi.mock("@/lib/postgres/connection", () => ({ getPool: mocks.getPool }));
vi.mock("@/lib/observability/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/process-engine/run-manager", () => mocks);
vi.mock("@/lib/process-engine/definition-registry", () => mocks);
vi.mock("@/lib/process-engine/doctor", () => mocks);
import { GET as list, POST as create } from "@/app/api/runs/route";
import { GET as detail } from "@/app/api/runs/[id]/route";
import { GET as events } from "@/app/api/runs/[id]/events/route";
import { GET as breakpoints } from "@/app/api/runs/[id]/breakpoints/route";
import { GET as doctor } from "@/app/api/runs/[id]/doctor/route";
import { POST as cancel } from "@/app/api/runs/[id]/cancel/route";
import { POST as resume } from "@/app/api/runs/[id]/resume/route";

const cases = [
  { name: "list", method: "GET", handler: list },
  { name: "create", method: "POST", handler: create },
  { name: "detail", method: "GET", handler: detail },
  { name: "events", method: "GET", handler: events },
  { name: "breakpoints", method: "GET", handler: breakpoints },
  { name: "doctor", method: "GET", handler: doctor },
  { name: "cancel", method: "POST", handler: cancel },
  { name: "resume", method: "POST", handler: resume },
];

function request(method: string, group?: string, authenticated = true) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-allura-user-id": "u1" };
  // A partial authority set fails closed even in a developer environment.
  if (authenticated) Object.assign(headers, { "x-allura-role": "admin", "x-allura-group-id": "allura-company",
    "x-allura-workspace-id": "ws1", "x-allura-session-id": "session1" });
  return new NextRequest("http://localhost/api/runs?" + (group === undefined ? "" : new URLSearchParams({ group_id: group })), {
    method, headers, ...(method === "POST" ? { body: JSON.stringify({ group_id: group,
      definition_id: "definition1", actor_id: "u1", approved_by: "u1" }) } : {}),
  });
}
const context = () => ({ params: Promise.resolve({ id: "run1" }) });

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("PROCESS_ENGINE_ENABLED", "true");
  mocks.getPool.mockReturnValue(mocks.pool);
  mocks.pool.query.mockResolvedValue({ rows: [] });
  mocks.listRuns.mockResolvedValue([]); mocks.diagnoseRun.mockResolvedValue([]);
  mocks.getRun.mockResolvedValue({ id: "run1", status: "paused", state_json: {}, updated_at: "before" });
  mocks.getLatestDefinition.mockResolvedValue({ id: "definition1", revision: 1 });
  mocks.createRun.mockResolvedValue({ id: "run1" }); mocks.updateRunSnapshot.mockResolvedValue({ id: "run1" });
});
afterEach(() => vi.unstubAllEnvs());

describe.each(cases)("process run tenant guard: $name", ({ name, method, handler }) => {
  it("refuses a foreign tenant before pool access", async () => {
    const result = await handler(request(method, "allura-other"), context());
    expect(result.status).toBe(403);
    expect(mocks.getPool).not.toHaveBeenCalled();
    expect(mocks.pool.query).not.toHaveBeenCalled();
  });
  it("retains same-tenant execution", async () => {
    const result = await handler(request(method, "allura-company"), context());
    expect(result.status).toBe(name === "create" ? 201 : 200);
    expect(mocks.getPool).toHaveBeenCalledOnce();
  });
  it.each([undefined, "invalid"])("retains missing/malformed selector refusal: %s", async group => {
    expect((await handler(request(method, group), context())).status).toBe(400);
    expect(mocks.getPool).not.toHaveBeenCalled();
  });
  it("retains unauthenticated refusal", async () => {
    expect((await handler(request(method, "allura-company", false), context())).status).toBe(401);
    expect(mocks.getPool).not.toHaveBeenCalled();
  });
  it("keeps the process engine disabled unless explicitly enabled", async () => {
    vi.stubEnv("PROCESS_ENGINE_ENABLED", "false");
    expect((await handler(request(method, "allura-company"), context())).status).toBe(404);
    expect(mocks.getPool).not.toHaveBeenCalled();
  });
});
