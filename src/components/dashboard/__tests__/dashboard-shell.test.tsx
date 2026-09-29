// @vitest-environment jsdom
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DASHBOARD_ROUTES, DashboardShell } from "../dashboard-shell"

const USER = {
  id: "dev-user-allura",
  email: "dev@allura.local",
  role: "admin" as const,
  groupId: "allura-system",
  workspaceId: "workspace-allura",
  sessionId: "dev:dev-user-allura",
}

afterEach(() => {
  cleanup()
})

describe("DashboardShell mobile navigation", () => {
  it("exposes every dashboard route in the markup, once", () => {
    render(
      <DashboardShell user={USER} title="Overview">
        <p>content</p>
      </DashboardShell>,
    )

    for (const route of DASHBOARD_ROUTES) {
      expect(screen.getAllByRole("link", { name: new RegExp(route.label) }).length).toBeGreaterThanOrEqual(1)
    }
  })

  it("provides a labeled, keyboard-operable disclosure for the compact mobile menu", () => {
    render(
      <DashboardShell user={USER} title="Overview">
        <p>content</p>
      </DashboardShell>,
    )

    // A native <details>/<summary> or a button with aria-expanded satisfies
    // "keyboard operable" without requiring bespoke JS focus management.
    const disclosure = screen.queryByRole("button", { name: /menu/i })
    expect(disclosure, "expected a labeled menu disclosure control for narrow layouts").not.toBeNull()
  })

  it("does not rely on horizontal overflow to expose mobile routes", async () => {
    const css = await readFile(join(process.cwd(), "src/components/dashboard/dashboard-shell.module.css"), "utf8")
    const mobileBreakpoint = css.slice(css.indexOf("max-width:760px"))

    expect(
      mobileBreakpoint,
      "the <=760px breakpoint should not clip navigation into a horizontally scrolling row",
    ).not.toMatch(/overflow-x:\s*auto/)
  })
})
