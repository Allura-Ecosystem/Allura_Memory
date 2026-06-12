import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAuthConfig,
  updatePermissionProfile,
  validatePermissionProfile,
  type PermissionProfile,
} from "@/lib/auth";
import { PATCH } from "@/app/api/permission-profiles/[id]/route";

const baseProfile: PermissionProfile = {
  id: "profile_test",
  group_id: "allura-system",
  name: "Test Profile",
  description: "Scoped test profile",
  role_ids: ["viewer"],
  allowed_actions: ["memory:read"],
  memory_scope: ["allura:memory"],
  applies_to: ["human"],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("permission profile helpers", () => {
  beforeEach(() => {
    clearAuthConfig();
  });

  it("validates canonical permission profile shape", () => {
    const result = validatePermissionProfile(baseProfile);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.group_id).toBe("allura-system");
      expect(result.data.role_ids).toEqual(["viewer"]);
    }
  });

  it("rejects permission profiles outside allura group namespace", () => {
    const result = validatePermissionProfile({
      ...baseProfile,
      group_id: "legacy-system",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("group_id");
    }
  });

  it("updates mutable fields without changing identity or tenant", () => {
    const updated = updatePermissionProfile(baseProfile, {
      name: "Updated Profile",
      role_ids: ["approver"],
      applies_to: ["human", "agent"],
    });

    expect(updated.id).toBe(baseProfile.id);
    expect(updated.group_id).toBe(baseProfile.group_id);
    expect(updated.created_at).toBe(baseProfile.created_at);
    expect(updated.name).toBe("Updated Profile");
    expect(updated.role_ids).toEqual(["approver"]);
    expect(updated.applies_to).toEqual(["human", "agent"]);
    expect(updated.updated_at).not.toBe(baseProfile.updated_at);
  });

  it("returns a client error for malformed PATCH JSON", async () => {
    const request = new Request("http://localhost/api/permission-profiles/profile_admin", {
      method: "PATCH",
      headers: {
        "x-allura-user-id": "admin-user",
        "x-allura-role": "admin",
        "x-allura-group-id": "allura-system",
        "x-allura-email": "admin@example.test",
      },
      body: "{not-json",
    });

    const response = await PATCH(request as never, {
      params: Promise.resolve({ id: "profile_admin" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.warnings[0].code).toBe("invalid-json");
  });

  it("returns 401 for an unauthenticated mutation (no identity)", async () => {
    const prevDevAuth = process.env.ALLURA_DEV_AUTH_ENABLED;
    const prevClerkPub = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const prevClerkSecret = process.env.CLERK_SECRET_KEY;
    // Disable dev-auth fallback and Clerk so a header-less request resolves to
    // no identity → 401 (distinct from authenticated-but-forbidden → 403).
    process.env.ALLURA_DEV_AUTH_ENABLED = "false";
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    clearAuthConfig();

    try {
      const request = new Request("http://localhost/api/permission-profiles/profile_admin", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Anonymous Should Not Mutate" }),
      });

      const response = await PATCH(request as never, {
        params: Promise.resolve({ id: "profile_admin" }),
      });

      expect(response.status).toBe(401);
    } finally {
      if (prevDevAuth === undefined) delete process.env.ALLURA_DEV_AUTH_ENABLED;
      else process.env.ALLURA_DEV_AUTH_ENABLED = prevDevAuth;
      if (prevClerkPub !== undefined) process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = prevClerkPub;
      if (prevClerkSecret !== undefined) process.env.CLERK_SECRET_KEY = prevClerkSecret;
      clearAuthConfig();
    }
  });

  it("requires admin role before mutating a permission profile", async () => {
    const request = new Request("http://localhost/api/permission-profiles/profile_admin", {
      method: "PATCH",
      headers: {
        "x-allura-user-id": "viewer-user",
        "x-allura-role": "viewer",
        "x-allura-group-id": "allura-system",
        "x-allura-email": "viewer@example.test",
      },
      body: JSON.stringify({ name: "Should Not Mutate" }),
    });

    const response = await PATCH(request as never, {
      params: Promise.resolve({ id: "profile_admin" }),
    });

    expect(response.status).toBe(403);
  });
});
