/**
 * Versioned mitigation template library.
 *
 * Story 26.5: templates map exposure categories to reviewable simulated policy
 * drafts. Each template declares a strict, typed parameter schema. Free-text
 * advisory content can never satisfy a parameter slot; parameters are derived
 * only from verified evidence fields on the ExposureAlert.
 */

import { z } from "zod"
import { BaseMitigationParameters } from "./schemas"
import type { MitigationTemplate } from "./types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

/**
 * Compromised dependency template: proposes a package pin/upgrade review.
 * Parameters are typed and bounded; no executable instruction can be injected.
 */
export const CompromisedDependencyTemplate: MitigationTemplate = {
  id: "mitigation-compromised-dependency",
  version: "1.0.0",
  name: "Compromised Dependency Pin/Upgrade Review",
  description:
    "Draft a simulated package containment policy: pin the affected package version and require an upgrade review before re-introduction.",
  affected_scope_kinds: ["packages", "systems"],
  parameter_schema: BaseMitigationParameters.extend({
    package_name: z.string().min(1),
    affected_version: z.string().min(1),
    suggested_pin_version: z.string().min(1).optional(),
  }).strict(),
  dry_run_plan:
    "Compute the affected package scope, list consuming systems, and describe the proposed pin/upgrade review. No registry lookup, no lockfile mutation.",
  rollback_plan:
    "Remove the simulated pin policy and restore the previous version allowance via the approved governance receipt path.",
  created_at: "2026-08-26T00:00:00Z",
}

/**
 * Malicious install hook template: proposes a workflow/action review.
 */
export const MaliciousInstallHookTemplate: MitigationTemplate = {
  id: "mitigation-malicious-install-hook",
  version: "1.0.0",
  name: "Malicious Install Hook Workflow Review",
  description:
    "Draft a simulated workflow review policy: flag CI/CD workflows and reusable actions referencing the affected artifact for human inspection before execution.",
  affected_scope_kinds: ["workflows", "systems"],
  parameter_schema: BaseMitigationParameters.extend({
    workflow_reference: z.string().min(1),
    action_refs: z.array(z.string().min(1)).min(1),
  }).strict(),
  dry_run_plan:
    "List workflows and reusable actions that reference the affected artifact and describe the required inspection gate. No CI configuration is modified.",
  rollback_plan:
    "Clear the simulated workflow inspection flag and restore the previous execution allowance via the approved governance receipt path.",
  created_at: "2026-08-26T00:00:00Z",
}

/**
 * Credential-exposure indicator template: proposes a token rotation review.
 */
export const CredentialExposureTemplate: MitigationTemplate = {
  id: "mitigation-credential-exposure",
  version: "1.0.0",
  name: "Credential Exposure Token Rotation Review",
  description:
    "Draft a simulated token rotation policy: identify the affected credential indicator and require a rotation review before the credential is trusted again.",
  affected_scope_kinds: ["tokens", "workspaces", "systems"],
  parameter_schema: BaseMitigationParameters.extend({
    credential_indicator: z.string().min(1),
    rotation_deadline_hours: z.number().int().min(1).max(168).optional(),
  }).strict(),
  dry_run_plan:
    "Identify the exposed credential indicator, affected workspace scope, and describe the rotation review. No token is invalidated and no secret store is touched.",
  rollback_plan:
    "Mark the simulated rotation review as not required and restore previous token trust via the approved governance receipt path.",
  created_at: "2026-08-26T00:00:00Z",
}

/**
 * The canonical versioned mitigation template library. Templates are indexed
 * by id and are immutable once published; a new version receives a new
 * `version` string.
 */
export const MITIGATION_TEMPLATES: readonly MitigationTemplate[] = [
  CompromisedDependencyTemplate,
  MaliciousInstallHookTemplate,
  CredentialExposureTemplate,
] as const

/**
 * Map from exposure match category to default template id. The generator uses
 * the alert's match_type plus its classification (when available) to select a
 * template. Classification is taken from the original advisory metadata, never
 * from free-text narrative.
 */
export const DEFAULT_TEMPLATE_BY_MATCH_TYPE: Readonly<Record<string, string>> = {
  package_version: CompromisedDependencyTemplate.id,
  package_hash: CompromisedDependencyTemplate.id,
  workflow_reference: MaliciousInstallHookTemplate.id,
  indicator: CredentialExposureTemplate.id,
  publisher: CompromisedDependencyTemplate.id,
} as const
