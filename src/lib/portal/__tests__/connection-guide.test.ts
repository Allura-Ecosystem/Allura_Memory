import { describe, expect, it } from "vitest";

import { buildConnectionGuide } from "@/lib/portal/connection-guide";

describe("buildConnectionGuide", () => {
  it("points humans at the Clerk sign-in the portal actually deploys, not Cloudflare Access", () => {
    const guide = buildConnectionGuide("https://mcp.faithmeats.org/mcp");

    // The deployed portal redirects /portal -> Clerk sign-in. Step 1 must
    // match that reality; "Cloudflare Access" sends partners hunting for
    // a login flow that does not exist.
    const joined = guide.steps.join(" | ");
    expect(joined).toContain("Sign in with your approved Faith Meats account");
    expect(joined).not.toContain("Cloudflare Access");
  });

  it("keeps the credential steps and never embeds a secret", () => {
    const guide = buildConnectionGuide("https://mcp.faithmeats.org/mcp");

    expect(guide.endpoint).toBe("https://mcp.faithmeats.org/mcp");
    expect(guide.transport).toBe("streamable-http");
    expect(guide.steps.some((s) => s.includes("least-privilege"))).toBe(true);
    expect(guide.steps.some((s) => s.includes("secure store"))).toBe(true);
    expect(guide.authorizationHeader).toBe(
      "Authorization: Bearer <your Allura MCP credential>",
    );

    expect(JSON.stringify(guide)).not.toMatch(
      /cf-access-client-secret|raw token|allura_mcp_[a-z0-9]/i,
    );
  });
});