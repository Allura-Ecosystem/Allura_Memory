import { describe, expect, it } from "vitest";
import { resolveWorkspaceScope } from "./workspace-scope";

describe("resolveWorkspaceScope", () => {
  it("derives the scope exclusively from a validated token record", () => {
    const scope = resolveWorkspaceScope({
      group_id: "allura-scope", workspace_id: "workspace-a", agent_name: "agent",
    });
    expect(scope).toMatchObject({ tenantId: "allura-scope", workspaceId: "workspace-a", principalId: "agent" });
  });
});
