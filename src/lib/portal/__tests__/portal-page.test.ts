import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const requireDashboardScope = vi.fn();
const buildConnectionGuide = vi.fn();

vi.mock("@/lib/dashboard/page-guard", () => ({
  requireDashboardScope: (...args: unknown[]) => requireDashboardScope(...args),
}));
vi.mock("@/lib/portal/connection-guide", () => ({
  buildConnectionGuide: (...args: unknown[]) => buildConnectionGuide(...args),
}));

import PortalPage from "@/app/portal/page";

describe("GET /portal", () => {
  it("derives server authority before rendering the human connection entry", async () => {
    requireDashboardScope.mockResolvedValue({
      user: { id: "u_1", sessionId: "s_1", groupId: "allura-faithmeats", workspaceId: "ws_1", role: "admin" },
      scope: {},
    });
    buildConnectionGuide.mockReturnValue({
      endpoint: "https://mcp.faithmeats.org/mcp",
      transport: "streamable-http",
      steps: ["Cloudflare Access", "Allura credential", "Configure your client"],
      authorizationHeader: "Authorization: Bearer <your Allura MCP credential>",
    });

    const html = renderToStaticMarkup(await PortalPage());

    expect(requireDashboardScope).toHaveBeenCalledWith("/portal");
    expect(buildConnectionGuide).toHaveBeenCalledWith("https://mcp.faithmeats.org/mcp");
    expect(html).toContain("Devices &amp; clients");
    expect(html).toContain('href="/portal"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('src="/brand/allura-wordmark-runtime.png"');
    expect(html).toContain('alt="allura"');
    expect(html).toContain("Your devices");
    expect(html).toContain("Profiles");
    expect(html).toContain("Account connections");
    expect(html).not.toContain("Docker");
    expect(html).toContain("ws_1");
    expect(html).not.toContain("allura_mcp_");
  });
});
