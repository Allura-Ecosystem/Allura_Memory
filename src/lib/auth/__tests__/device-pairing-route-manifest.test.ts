import { describe, expect, it } from "vitest";
import { ROUTE_SCOPE_MANIFEST } from "../route-scope-manifest";

describe("Story 29.14 device-pairing RFC proof routes", () => {
  it("declares challenge, rotation, and grace recovery as route-handler proof-of-possession routes", () => {
    const entries = ROUTE_SCOPE_MANIFEST.filter((entry) => entry.pattern.startsWith("/api/device-pairing/"));
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ pattern: "/api/device-pairing/challenge", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/exchange", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/rotation/stage", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/rotation/activate", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/recovery", methods: ["POST"], authStrategy: "route_handler" }),
    ]));
  });
});
