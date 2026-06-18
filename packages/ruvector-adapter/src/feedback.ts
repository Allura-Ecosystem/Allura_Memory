// Feedback hooks. Feedback NEVER mutates approved knowledge or promotes directly;
// it emits a proposal that requires human approval (AD-04 / governance gate).

import type { AlluraScope } from "@allura/types";
import { assertScope, auditContext, type AuditContext } from "./policy.ts";

export interface FeedbackProposal {
  kind: "feedback";
  memory_id: string;
  signal: number;
  requires_human_approval: true;
  audit: AuditContext;
}

export async function recordFeedback(
  scope: AlluraScope,
  memoryId: string,
  signal: number,
): Promise<FeedbackProposal> {
  assertScope(scope);
  return {
    kind: "feedback",
    memory_id: memoryId,
    signal,
    requires_human_approval: true,
    audit: auditContext(scope, "feedback"),
  };
}
