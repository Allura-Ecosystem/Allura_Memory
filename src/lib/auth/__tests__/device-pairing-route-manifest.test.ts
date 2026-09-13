import { describe, expect, it } from "vitest";
import { resolveRouteAuthority, ROUTE_SCOPE_MANIFEST } from "../route-scope-manifest";

describe("Story 29.14 device-pairing RFC proof routes", () => {
  it("declares challenge, rotation, and grace recovery as route-handler proof-of-possession routes", () => {
    const entries = ROUTE_SCOPE_MANIFEST.filter((entry) => entry.pattern.startsWith("/api/device-pairing/"));
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ pattern: "/api/device-pairing/challenge", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/complete", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/enroll", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/exchange", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/rotation/stage", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/rotation/activate", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/recovery", methods: ["POST"], authStrategy: "route_handler" }),
      expect.objectContaining({ pattern: "/api/device-pairing/test-approve", methods: ["POST"], authStrategy: "route_handler" }),
    ]));
  });

  it("keeps the test pairing page principal-gated while the approval seam owns its protocol auth", () => {
    expect(resolveRouteAuthority("/pair")).toMatchObject({
      kind: "declared",
      requiredRole: "viewer",
      authStrategy: "principal",
    });
    expect(resolveRouteAuthority("/portal")).toMatchObject({
      kind: "declared",
      requiredRole: "viewer",
      authStrategy: "principal",
    });
    expect(resolveRouteAuthority("/api/device-pairing/test-approve")).toMatchObject({
      kind: "declared",
      requiredRole: "viewer",
      methods: ["POST"],
      authStrategy: "route_handler",
    });
  });
});
