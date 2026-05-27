import { describe, expect, it } from "vitest"

import { PROVENANCE_EXPORT_LABELS } from "@/lib/memory/provenance-export"
import {
  REQUIRED_PROVENANCE_BASELINE_LABELS,
  validateProvenanceDriftAgainstBaseline,
} from "@/lib/memory/provenance-drift"

describe("validateProvenanceDriftAgainstBaseline", () => {
  it("maps every provenance export label to Data Dictionary or documented derived semantics", () => {
    const report = validateProvenanceDriftAgainstBaseline(PROVENANCE_EXPORT_LABELS)

    expect(report.summary.critical).toBe(0)
    expect(report.summary.major).toBe(0)
    expect(report.items.map((item) => item.label)).toEqual(PROVENANCE_EXPORT_LABELS)
    expect(report.items.every((item) => item.dictionaryRefs.length > 0 || item.derivedFrom.length > 0)).toBe(true)
  })

  it("logs critical drift when tenant scope is missing", () => {
    const labelsWithoutTenant = PROVENANCE_EXPORT_LABELS.filter((label) => label !== "Tenant scope")

    const report = validateProvenanceDriftAgainstBaseline(labelsWithoutTenant)

    expect(report.items).toContainEqual(
      expect.objectContaining({
        label: "Tenant scope",
        severity: "critical",
        status: "missing",
      })
    )
    expect(report.summary.critical).toBe(1)
  })

  it("keeps required baseline labels explicit for review evidence", () => {
    expect(REQUIRED_PROVENANCE_BASELINE_LABELS).toEqual(
      expect.arrayContaining(["Memory ID", "Tenant scope", "Timestamp", "Evidence", "Status"])
    )
  })
})
