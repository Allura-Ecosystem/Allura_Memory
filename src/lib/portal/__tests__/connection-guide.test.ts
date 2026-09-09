import { describe, expect, it } from "vitest";

import { buildConnectionGuide } from "@/lib/portal/connection-guide";

describe("buildConnectionGuide", () => {
  it("separates the human Access step from the one-time Allura credential without embedding a secret", () => {
    const guide = buildConnectionGuide("https://mcp.faithmeats.org/mcp");

    expect(guide).toEqual({
      endpoint: "https://mcp.faithmeats.org/mcp",
      transport: "streamable-http",
      steps: [
        "Sign in through Cloudflare Access with your approved work account.",
        "Create or obtain a least-privilege Allura MCP credential from an administrator.",
        "Add the endpoint and credential to your MCP client; store the credential in that client's secure store.",
      ],
      authorizationHeader: "Authorization: Bearer <your Allura MCP credential>",
    });

    expect(JSON.stringify(guide)).not.toMatch(/cf-access-client-secret|raw token|allura_mcp_[a-z0-9]/i);
  });
});
