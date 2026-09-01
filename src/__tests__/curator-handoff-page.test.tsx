/**
 * Story 25.3b — Executing test for the production /dashboard/curator page.
 *
 * Verification-gap review (bmad-code-review, 2026-08-28): the issuance→shell
 * wiring in `CuratorHandoffPage` had no executing test — a wiring regression
 * would ship the legacy static console with every lane green. This test
 * executes the real default export and pins the emitted shell state, plus the
 * remediated degraded-state and adapter-guard behaviors.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { getDashboardPrincipal, withWorkspaceTransaction, getBumblebeeSummaryInTransaction, transactionClient } = vi.hoisted(() => {
  const transactionClient = { query: vi.fn().mockResolvedValue({ rows: [] }) }
  return {
    getDashboardPrincipal: vi.fn(),
    withWorkspaceTransaction: vi.fn(async (_scope, callback) => callback(transactionClient)),
    getBumblebeeSummaryInTransaction: vi.fn().mockResolvedValue({
      sources: 4,
      unpinnedActions: 1,
      openExposures: 2,
      incidents: 1,
      receipts: 3,
    }),
    transactionClient,
  }
})

vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT_TO_LOGIN") } }))
vi.mock("@/lib/auth/dashboard-principal", () => ({ getDashboardPrincipal }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction }))
vi.mock("@/lib/curator/operator-read-service", () => ({ getBumblebeeSummaryInTransaction }))

import CuratorHandoffPage from "@/app/dashboard/curator/page"
import { BUMBLEBEE_ENABLED_ENV_VAR } from "@/lib/bumblebee/module"

const user = { id: "curator-1", email: "curator@example.test", role: "curator" as const, groupId: "allura-acme", workspaceId: "workspace-a", sessionId: "session-a" }

beforeEach(() => {
  getDashboardPrincipal.mockResolvedValue(user)
})

afterEach(() => {
  delete process.env[BUMBLEBEE_ENABLED_ENV_VAR]
  vi.clearAllMocks()
})

describe("Story 25.3b production /dashboard/curator page wiring", () => {
  it("issues the module and renders the host-owned shell when enabled", async () => {
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"

    const element = await CuratorHandoffPage()
    const markup = renderToStaticMarkup(element)

    expect(markup).toContain('data-shell-state="complete"')
    expect(markup).toContain('data-testid="host-owned-bumblebee-adapter"')
    expect(markup).toContain("4 sources")
    // The issuance decision was committed as a completed ledger event.
    expect(transactionClient.query).toHaveBeenCalled()
    expect(transactionClient.query.mock.calls.at(-1)?.[0]).toContain("curator_module_registry_decision")
    const metadata = JSON.parse(transactionClient.query.mock.calls.at(-1)?.[1]?.[5] as string) as { decision: string }
    expect(metadata.decision).toBe("issued")
  })

  it("renders the approved evidence-first command-center contract", async () => {
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"

    const element = await CuratorHandoffPage()
    const markup = renderToStaticMarkup(element)

    expect(markup).toContain('aria-label="Dashboard navigation"')
    expect(markup).toContain("Command Center")
    expect(markup).toContain("Review queue")
    expect(markup).toContain("Evidence path")
    expect(markup).toContain("Module registry")
    expect(markup).toContain("Receipt contract")
    expect(markup.indexOf("Evidence")).toBeLessThan(markup.indexOf("Human review"))
  })

  it("renders a truthful degraded state when the module is disabled", async () => {
    // BUMBLEBEE_MODULE_ENABLED unset → disabled branch → recordOutcome("disabled")
    const element = await CuratorHandoffPage()
    const markup = renderToStaticMarkup(element)

    expect(markup).toContain('data-shell-state="degraded"')
    expect(markup).toContain("Bumblebee is currently unavailable.")
    // No host adapter markup — nothing is issued when disabled.
    expect(markup).not.toContain('data-testid="host-owned-bumblebee-adapter"')
    expect(markup).not.toContain('data-shell-state="complete"')
  })

  it("redirects to login without a ledger event when unauthenticated", async () => {
    getDashboardPrincipal.mockResolvedValue(null)

    await expect(CuratorHandoffPage()).rejects.toThrow("REDIRECT_TO_LOGIN")
    expect(transactionClient.query).not.toHaveBeenCalled()
  })
})
