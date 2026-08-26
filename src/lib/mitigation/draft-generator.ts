/**
 * Governed mitigation policy draft generator.
 *
 * Story 26.5: produces reviewable simulated policy drafts from a verified
 * ExposureAlert and a versioned MitigationTemplate. The generator is read-only,
 * in-memory, and derives typed parameters only from verified evidence fields.
 * Untrusted advisory text can never become a parameter value or executable
 * instruction.
 */

import { z } from "zod"
import { randomUUID } from "crypto"
import { MitigationDraft as MitigationDraftSchema } from "./schemas"
import { DEFAULT_TEMPLATE_BY_MATCH_TYPE, MITIGATION_TEMPLATES } from "./templates"
import type { MitigationDraft, MitigationTemplate } from "./types"
import { ExposureAlert as ExposureAlertSchema } from "../exposure/schemas"
import type { ExposureAlert } from "../exposure/types"
import { TenantScope as TenantScopeSchema } from "../inventory/schemas"
import type { TenantScope } from "../inventory/types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface DraftGenerator {
  /**
   * Generate a reviewable simulated policy draft for the given verified
   * exposure alert. The generator selects the only permitted template from the
   * alert's matcher category; callers cannot override that mapping.
   *
   * Parameters are derived from typed alert fields only. Free-text advisory
   * content never enters the parameter object.
   */
  generateDraft: (scope: TenantScope, alert: ExposureAlert) => MitigationDraft
}

/**
 * Create an in-memory, read-only mitigation draft generator.
 */
export function createDraftGenerator(): DraftGenerator {
  function resolveTemplate(alert: ExposureAlert): MitigationTemplate {
    const templateId = DEFAULT_TEMPLATE_BY_MATCH_TYPE[alert.match_type]
    const template = MITIGATION_TEMPLATES.find((t) => t.id === templateId)
    if (!template) {
      throw new Error(`no mitigation template found for match_type=${alert.match_type}`)
    }
    return template
  }

  function deriveParameters(alert: ExposureAlert, template: MitigationTemplate): Record<string, unknown> {
    const base = {
      severity: alert.severity,
      inventory_ref: alert.inventory_ref,
      artifact_ref: alert.artifact_ref,
    }

    switch (template.id) {
      case "mitigation-compromised-dependency": {
        return {
          ...base,
          package_name: alert.artifact_ref,
          affected_version: alert.artifact_ref,
          suggested_pin_version: undefined,
        }
      }
      case "mitigation-malicious-install-hook": {
        return {
          ...base,
          workflow_reference: alert.artifact_ref,
          action_refs: [alert.artifact_ref],
        }
      }
      case "mitigation-credential-exposure": {
        return {
          ...base,
          credential_indicator: alert.artifact_ref,
          rotation_deadline_hours: 24,
        }
      }
      default: {
        throw new Error(`unsupported mitigation template id=${template.id}`)
      }
    }
  }

  function validateParameters(
    template: MitigationTemplate,
    parameters: Record<string, unknown>
  ): Record<string, unknown> {
    if (!(template.parameter_schema instanceof z.ZodType)) {
      throw new Error("template parameter_schema is not a Zod schema")
    }
    const parsed = template.parameter_schema.safeParse(parameters)
    if (!parsed.success) {
      throw new Error(`parameter validation failed for template ${template.id}: ${parsed.error.message}`)
    }
    return parsed.data as Record<string, unknown>
  }

  function buildScopeExplanation(alert: ExposureAlert, template: MitigationTemplate): string {
    const kinds = template.affected_scope_kinds.join(", ")
    return [
      `Scope: affected ${kinds}.`,
      `Inventory record ${alert.inventory_ref} matched artifact ${alert.artifact_ref}`,
      `by ${alert.match_type} (${alert.severity} severity).`,
      `Advisory references: ${alert.advisory_refs.join(", ") || "none"}.`,
      "No systems, packages, workflows, tokens, or workspaces are modified by this draft.",
    ].join(" ")
  }

  function buildDryRunResult(alert: ExposureAlert, template: MitigationTemplate): string {
    return [
      `Dry-run: template "${template.name}" (${template.id}@${template.version})`,
      `would propose policy action for alert ${alert.id}.`,
      `It would inspect inventory ${alert.inventory_ref}, artifact ${alert.artifact_ref},`,
      `and match type ${alert.match_type}.`,
      `Execution is disabled: no package block, CI change, containment, or connector action`,
      "would be performed.",
    ].join(" ")
  }

  function buildRollbackEvidence(alert: ExposureAlert, template: MitigationTemplate): string {
    return [
      `Rollback: policy ${template.id}@${template.version} for alert ${alert.id}`,
      `can be reversed via the approved governance receipt path.`,
      `Affected artifact ${alert.artifact_ref} would be restored to its previous trust state`,
      `once an explicit approval receipt is recorded.`,
    ].join(" ")
  }

  function generateDraft(scope: TenantScope, alert: ExposureAlert): MitigationDraft {
    const scopeParsed = TenantScopeSchema.safeParse(scope)
    if (!scopeParsed.success) {
      throw new Error(`invalid tenant scope: ${scopeParsed.error.message}`)
    }

    const parsedAlert = ExposureAlertSchema.parse(alert)
    if (parsedAlert.group_id !== scope.group_id || parsedAlert.workspace_id !== scope.workspace_id) {
      throw new Error("alert tenant scope does not match generator scope")
    }

    const template = resolveTemplate(parsedAlert)
    const rawParameters = deriveParameters(parsedAlert, template)
    const parameters = validateParameters(template, rawParameters)

    const now = new Date().toISOString()
    const draftId = `draft-${randomUUID()}`

    const draft: MitigationDraft = {
      id: draftId,
      group_id: scope.group_id,
      workspace_id: scope.workspace_id,
      alert_id: parsedAlert.id,
      template_id: template.id,
      template_version: template.version,
      parameters,
      scope_explanation: buildScopeExplanation(parsedAlert, template),
      dry_run_result: buildDryRunResult(parsedAlert, template),
      rollback_evidence: buildRollbackEvidence(parsedAlert, template),
      authority_state: "simulated_only",
      approval_state: "draft",
      evidence_ids: [...parsedAlert.evidence_ids],
      created_at: now,
    }

    return MitigationDraftSchema.parse(draft)
  }

  return { generateDraft }
}
