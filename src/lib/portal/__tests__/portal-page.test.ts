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
    expect(html).toContain("MCP connections");
    expect(html).toContain('href="/portal"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Clients");
    expect(html).toContain("Connect your AI tools");
    expect(html).toContain("Connect ChatGPT");
    expect(html).toContain("Connect Claude Desktop");
    expect(html).toContain("Connect Hermes");
    expect(html).toContain("Connect OpenCode");
    expect(html).toContain("Connect OpenClaw");
    expect(html).toContain("ws_1");
    expect(html).not.toContain("allura_mcp_");
  });
});
