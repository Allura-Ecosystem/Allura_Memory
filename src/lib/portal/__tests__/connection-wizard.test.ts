/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConnectionWizard } from "@/components/portal/connection-wizard";

beforeEach(() => cleanup());
afterEach(() => cleanup());

describe("ConnectionWizard", () => {
  it("generates client-specific placeholder configuration and an honest test checklist", () => {
    const { container } = render(createElement(ConnectionWizard, {
      endpoint: "https://mcp.faithmeats.org/mcp",
      authorizationHeader: "Authorization: Bearer <your Allura MCP credential>",
    }));

    expect((screen.getByLabelText("MCP client") as HTMLSelectElement).value).toBe("claude-desktop");
    expect(screen.getByTestId("client-config").textContent).toContain("https://mcp.faithmeats.org/mcp");
    expect(screen.getByTestId("client-config").textContent).toContain("<your Allura MCP credential>");

    fireEvent.change(screen.getByLabelText("MCP client"), { target: { value: "hermes" } });
    expect(screen.getByTestId("client-config").textContent).toContain('"allura-memory"');
    expect(screen.getByText("Test the connection")).toBeTruthy();
    expect(container.textContent).not.toMatch(/allura_mcp_[a-z0-9]{8,}/i);
  });
});
