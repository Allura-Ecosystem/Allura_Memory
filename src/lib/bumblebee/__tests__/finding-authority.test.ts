import { describe, expect, it } from "vitest"

import {
  buildEvidenceJunctions,
  type CatalogEntryAuthority,
  type FindingRecord,
  type PackageRecord,
  recomputeExposures,
} from "../finding-authority"

// ── Fixtures ──────────────────────────────────────────────────────────────

const pkg: PackageRecord = {
  ecosystem: "npm",
  normalized_name: "lodash",
  version: "4.17.21",
  source_file: "/repo/package-lock.json",
}

const finding: FindingRecord = {
  ecosystem: "npm",
  normalized_name: "lodash",
  version: "4.17.21",
  finding_type: "vulnerability",
  catalog_id: "CVE-2021-23337",
  advisory_id: "GHSA-xxxx",
}

const catalogEntry: CatalogEntryAuthority = {
  catalog_entry_id: "catalog-lodash-cve-2021-23337",
  ecosystem: "npm",
  normalized_name: "lodash",
  finding_type: "vulnerability",
  advisory_id: "GHSA-xxxx",
  affected_versions: ["4.17.21"],
}

// ── recomputeExposures ────────────────────────────────────────────────────

describe("recomputeExposures", () => {
  it("marks a finding trusted when a matching package exists and catalogDigest is present", () => {
    const result = recomputeExposures([finding], [pkg], "sha256:abc123", [catalogEntry])

    expect(result).toHaveLength(1)
    expect(result[0].is_trusted).toBe(true)
    expect(result[0].evidence_source).toBe("server-recomputed")
    expect(result[0].matched_package).toEqual(pkg)
  })

  it("marks a finding untrusted when no matching package exists", () => {
    const result = recomputeExposures([finding], [], "sha256:abc123")

    expect(result).toHaveLength(1)
    expect(result[0].is_trusted).toBe(false)
    expect(result[0].evidence_source).toBe("endpoint-asserted")
    expect(result[0].matched_package).toBeNull()
  })

  it("marks all findings endpoint-asserted when catalogDigest is null, even if a package matches", () => {
    const result = recomputeExposures([finding], [pkg], null)

    expect(result).toHaveLength(1)
    expect(result[0].is_trusted).toBe(false)
    expect(result[0].evidence_source).toBe("endpoint-asserted")
  })

  it("preserves null version on the exposure — no fake sentinel", () => {
    const nullVersionFinding: FindingRecord = {
      ...finding,
      version: null,
    }
    const result = recomputeExposures([nullVersionFinding], [pkg], "sha256:abc123")

    expect(result[0].version).toBeNull()
  })

  it("preserves null catalog_id on the exposure — no fake sentinel", () => {
    const nullCatalogFinding: FindingRecord = {
      ...finding,
      catalog_id: null,
    }
    const result = recomputeExposures([nullCatalogFinding], [pkg], "sha256:abc123")

    expect(result[0].catalog_id).toBeNull()
  })

  it("matches by ecosystem + normalized_name even when finding version is null", () => {
    const nullVersionFinding: FindingRecord = {
      ...finding,
      version: null,
    }
    const result = recomputeExposures([nullVersionFinding], [pkg], "sha256:abc123", [catalogEntry])

    // A null finding version still matches by name+ecosystem; the package
    // version is carried in matched_package but the exposure keeps null.
    expect(result[0].is_trusted).toBe(true)
    expect(result[0].matched_package).toEqual(pkg)
    expect(result[0].version).toBeNull()
  })

  it("does not match when ecosystems differ", () => {
    const result = recomputeExposures(
      [{ ...finding, ecosystem: "pypi" }],
      [pkg],
      "sha256:abc123",
    )

    expect(result[0].is_trusted).toBe(false)
    expect(result[0].matched_package).toBeNull()
  })

  it("produces one exposure per finding, preserving order", () => {
    const findings: FindingRecord[] = [
      finding,
      { ...finding, finding_type: "license", catalog_id: "LICENSE-GPL", advisory_id: null },
      { ...finding, normalized_name: "express" },
    ]
    const result = recomputeExposures(findings, [pkg], "sha256:abc123")

    expect(result).toHaveLength(3)
    expect(result[0].finding_type).toBe("vulnerability")
    expect(result[1].finding_type).toBe("license")
    expect(result[2].package_name).toBe("express")
  })
})

// ── buildEvidenceJunctions ────────────────────────────────────────────────

describe("buildEvidenceJunctions", () => {
  it("produces one junction per exposure with correct scope fields", () => {
    const exposures = recomputeExposures([finding], [pkg], "sha256:abc123", [catalogEntry])
    const junctions = buildEvidenceJunctions(
      exposures,
      "source-1",
      "rev-1",
      "lease-1",
      "batch_abc",
      "run_xyz",
    )

    expect(junctions).toHaveLength(1)
    expect(junctions[0]).toEqual({
      source_id: "source-1",
      source_revision_id: "rev-1",
      lease_id: "lease-1",
      batch_id: "batch_abc",
      run_id: "run_xyz",
      record_id: expect.any(String),
      exposure_key: expect.any(String),
      is_trusted: true,
    })
    expect(junctions[0].record_id.length).toBeGreaterThan(0)
    expect(junctions[0].exposure_key.length).toBeGreaterThan(0)
  })

  it("produces a separate junction for each exposure when multiple findings match the same package", () => {
    const findings: FindingRecord[] = [
      finding,
      { ...finding, finding_type: "license", catalog_id: "LICENSE-MIT", advisory_id: null },
    ]
    const exposures = recomputeExposures(findings, [pkg], "sha256:abc123")
    const junctions = buildEvidenceJunctions(
      exposures,
      "source-1",
      "rev-1",
      "lease-1",
      "batch_abc",
      "run_xyz",
    )

    expect(junctions).toHaveLength(2)
    expect(junctions[0].exposure_key).not.toBe(junctions[1].exposure_key)
    expect(junctions[0].record_id).not.toBe(junctions[1].record_id)
  })
})