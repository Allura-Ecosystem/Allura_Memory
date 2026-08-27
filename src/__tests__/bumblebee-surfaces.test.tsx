/**
 * @vitest-environment jsdom
 *
 * Story 26.7 AC-1/AC-5 — operator surfaces render, and are accessible.
 *
 * Follows the ARIA/keyboard conventions already used by
 * src/__tests__/toast.test.tsx and src/__tests__/inspector-panel.test.tsx
 * (@testing-library/react, role-and-accessible-name queries).
 */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  ExposuresSurface,
  IncidentsSurface,
  PolicyDraftsSurface,
  ReceiptsSurface,
  SourcesSurface,
} from "@/components/bumblebee/surfaces"
import type { ExposureRow, ReceiptRow, SourceRow } from "@/lib/curator/operator-read-service"
import type { MitigationDraft } from "@/lib/mitigation/types"

// Explicit cleanup, matching the convention in toast.test.tsx and
// inspector-panel.test.tsx -- without it, renders accumulate across tests and
// screen-level queries start matching the previous test's DOM.
beforeEach(() => cleanup())
afterEach(() => cleanup())

const sourceRow: SourceRow = {
  id: "ghaction:actions/cache@v3",
  artifact_type: "ci_workflow",
  ecosystem: "github-actions",
  package: "actions/cache",
  version: "v3",
  hash: "unpinned",
  publisher: "actions",
  workflow_reference: "actions/cache@v3",
  source_ref: ".github/workflows/x.yml#L36",
  trust_state: "verified",
  freshness_state: "fresh",
  updated_at: "2026-08-27T00:00:00.000Z",
}

const exposureRow: ExposureRow = {
  id: "alert-1",
  inventory_ref: "inv-1",
  artifact_ref: "nx",
  advisory_refs: ["REPLAY-NX-S1NGULARITY-2025"],
  match_type: "package_version",
  severity: "critical",
  lifecycle_state: "new",
  dedup_key: "dk-1",
  created_at: "2026-08-27T00:00:00.000Z",
  updated_at: "2026-08-27T00:00:00.000Z",
}

const receiptRow: ReceiptRow = {
  kind: "containment",
  id: "receipt-1",
  action: "mcp_token_revocation:revoke",
  actor_id: "admin-1",
  actor_role: "admin",
  rationale: "suspected leaked token",
  policy_reference: "policy-v1",
  approval_ref: "11111111-2222-3333-4444-555555555555",
  authorization_chain: ["role:admin"],
  subject_ref: "token-123",
  occurred_at: "2026-08-27T00:00:00.000Z",
}

const draft: MitigationDraft = {
  id: "draft-1",
  group_id: "allura-test",
  workspace_id: "workspace-a",
  alert_id: "alert-1",
  template_id: "mitigation-compromised-dependency",
  template_version: "1.0.0",
  parameters: {},
  scope_explanation: "scoped to one workspace",
  dry_run_result: "no changes applied",
  rollback_evidence: "no-op; nothing to roll back",
  authority_state: "simulated_only",
  approval_state: "draft",
  evidence_ids: ["e1"],
  created_at: "2026-08-27T00:00:00.000Z",
}

const SURFACES = [
  { name: "Sources", element: () => <SourcesSurface rows={[sourceRow]} /> },
  { name: "Exposures", element: () => <ExposuresSurface rows={[exposureRow]} /> },
  { name: "Policy Drafts", element: () => <PolicyDraftsSurface drafts={[draft]} /> },
  { name: "Incidents", element: () => <IncidentsSurface rows={[exposureRow]} /> },
  { name: "Receipts", element: () => <ReceiptsSurface rows={[receiptRow]} /> },
]

const EMPTY_SURFACES = [
  { name: "Sources", element: () => <SourcesSurface rows={[]} /> },
  { name: "Exposures", element: () => <ExposuresSurface rows={[]} /> },
  { name: "Policy Drafts", element: () => <PolicyDraftsSurface drafts={[]} /> },
  { name: "Incidents", element: () => <IncidentsSurface rows={[]} /> },
  { name: "Receipts", element: () => <ReceiptsSurface rows={[]} /> },
]

describe("Story 26.7 AC-1 — all five operator surfaces exist", () => {
  it("renders exactly the five surfaces the story names", () => {
    expect(SURFACES.map((s) => s.name)).toEqual([
      "Sources",
      "Exposures",
      "Policy Drafts",
      "Incidents",
      "Receipts",
    ])
  })
})

describe.each(SURFACES)("Story 26.7 AC-5 — accessibility: $name", ({ name, element }) => {
  it("is a landmark region with an accessible name", () => {
    render(element())
    const region = screen.getByRole("region", { name })
    expect(region).toBeDefined()
  })

  it("exposes its heading to assistive technology", () => {
    render(element())
    expect(screen.getByRole("heading", { name })).toBeDefined()
  })

  it("gives its table a caption and column-scoped headers", () => {
    const { container } = render(element())
    const table = within(container).getByRole("table")
    // A caption is what a screen reader announces when entering the table.
    expect(table.querySelector("caption")?.textContent?.trim()).toBeTruthy()

    const columnHeaders = within(table).getAllByRole("columnheader")
    expect(columnHeaders.length).toBeGreaterThan(0)
    for (const header of columnHeaders) {
      expect(header.getAttribute("scope")).toBe("col")
    }
  })

  it("gives every data row a row header so cells are navigable by name", () => {
    const { container } = render(element())
    const table = within(container).getByRole("table")
    const rowHeaders = within(table).getAllByRole("rowheader")
    expect(rowHeaders.length).toBeGreaterThan(0)
    for (const header of rowHeaders) {
      expect(header.getAttribute("scope")).toBe("row")
    }
  })
})

describe.each(EMPTY_SURFACES)("Story 26.7 AC-5 — empty state: $name", ({ name, element }) => {
  it("announces an explicit empty message instead of rendering silence", () => {
    const { container } = render(element())
    // An empty table and a failed load must not look identical to a
    // screen-reader user -- or to a sighted operator, for that matter.
    expect(within(container).queryByRole("table")).toBeNull()
    const empty = within(container).getByTestId("empty-state")
    expect(empty.textContent?.trim().length ?? 0).toBeGreaterThan(0)
  })

  it("still exposes its landmark region when empty", () => {
    render(element())
    expect(screen.getByRole("region", { name })).toBeDefined()
  })
})

describe("Story 26.7 — surfaces are truthful about authority (AD-57)", () => {
  it("states on the Policy Drafts surface that drafts cannot be activated here", () => {
    render(<PolicyDraftsSurface drafts={[draft]} />)
    const note = screen.getByTestId("drafts-authority-note")
    expect(note.textContent).toMatch(/simulated only/i)
    expect(note.textContent).toMatch(/separate approval/i)
  })

  it("renders no control that could mutate state — the module is read-only", () => {
    for (const surface of SURFACES) {
      const { container, unmount } = render(surface.element())
      expect(within(container).queryAllByRole("button")).toHaveLength(0)
      expect(container.querySelectorAll("form")).toHaveLength(0)
      unmount()
    }
  })

  it("surfaces a mutable action tag as a distinct, named pinning state", () => {
    render(<SourcesSurface rows={[sourceRow]} />)
    expect(screen.getByText("Mutable tag")).toBeDefined()
  })
})
