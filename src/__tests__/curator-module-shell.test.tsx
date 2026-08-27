import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CuratorModuleShell } from "@/components/curator/module-shell"

const states = ["loading", "empty", "denied", "stale", "partial", "degraded", "conflict", "error", "complete"] as const

describe("Story 25.3b curator shell", () => {
  it("owns and exposes every canonical truth state accessibly", () => {
    for (const state of states) {
      const markup = renderToStaticMarkup(createElement(CuratorModuleShell, { issue: { state, modules: [] } }))
      expect(markup, state).toContain(`data-shell-state=\"${state}\"`)
      expect(markup, state).toContain('role="status"')
      expect(markup, state).toContain('aria-live="polite"')
    }
  })

  it("renders a disabled module as unavailable without hiding the shell", () => {
    const markup = renderToStaticMarkup(createElement(CuratorModuleShell, {
      issue: { state: "complete", modules: [{ id: "bumblebee", state: "unavailable", title: "Bumblebee" }] },
    }))
    expect(markup).toContain("Curator console")
    expect(markup).toContain("Bumblebee is currently unavailable")
  })

  it("renders only host-provided safe view data for an available adapter", () => {
    const markup = renderToStaticMarkup(createElement(CuratorModuleShell, {
      issue: { state: "complete", modules: [{ id: "bumblebee", state: "available", title: "Bumblebee", summary: { sources: 4, unpinnedActions: 1, openExposures: 2, incidents: 1, receipts: 3 } }] },
    }))
    expect(markup).toContain("4 sources")
    expect(markup).toContain("2 open exposures")
    expect(markup).toContain('data-testid="host-owned-bumblebee-adapter"')
    for (const surface of ["Sources", "Exposures", "Policy Drafts", "Incidents", "Receipts"]) {
      expect(markup).toContain(surface)
    }
  })
})
