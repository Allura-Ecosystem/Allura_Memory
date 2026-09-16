import { afterEach, describe, expect, it } from "vitest";

import { clearAuthConfig, getAuthConfig } from "../config";
import { clearRuntimeAuthConfigForTests, setRuntimeAuthConfigForTests } from "../runtime-auth-config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  clearAuthConfig();
  clearRuntimeAuthConfigForTests();
});

describe("getAuthConfig runtime environment guard", () => {
  it("uses defaults for invalid configuration at a development runtime", () => {
    process.env = {
      ...process.env,
      NODE_ENV: "development",
      ALLURA_MCP_BASE_URL: "not-a-url",
    };
    setRuntimeAuthConfigForTests({
      environment: "development",
      devAuthEnabled: true,
      devAuthForce: true,
      devAuthRole: "admin",
      devAuthGroupId: "allura-system",
      devAuthUserId: "dev-user-allura",
      devAuthEmail: "dev@allura.local",
      devAuthWorkspaceId: "workspace-allura",
      clerkConfigured: false,
    });

    expect(getAuthConfig().NODE_ENV).toBe("development");
  });

  it("fails fast for invalid configuration at a production runtime", () => {
    process.env = {
      ...process.env,
      NODE_ENV: "production",
      ALLURA_MCP_BASE_URL: "not-a-url",
    };
    setRuntimeAuthConfigForTests({
      environment: "production",
      devAuthEnabled: true,
      devAuthForce: true,
      devAuthRole: "admin",
      devAuthGroupId: "allura-system",
      devAuthUserId: "dev-user-allura",
      devAuthEmail: "dev@allura.local",
      devAuthWorkspaceId: "workspace-allura",
      clerkConfigured: false,
    });

    expect(() => getAuthConfig()).toThrow("Auth environment validation failed");
  });
});
