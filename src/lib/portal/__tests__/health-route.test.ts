import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/live/route";

describe("portal liveness route", () => {
  it("keeps a public dependency-free liveness probe for the portal container", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.alive).toBe(true);
    expect(typeof payload.uptime).toBe("number");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
