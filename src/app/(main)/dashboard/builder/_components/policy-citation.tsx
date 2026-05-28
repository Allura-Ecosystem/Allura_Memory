"use client"

import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, Info } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface PolicyRule {
  name: string
  description: string
  status: "enforced" | "proposed" | "drifted"
  appliesTo: string[]
}

interface PolicyCitationProps {
  content: string
  agentId?: string
  groupId?: string
}

const GOVERNANCE_RULES: PolicyRule[] = [
  {
    name: "Tenant namespace",
    description: "Every governed memory must include a group_id matching allura-*.",
    status: "enforced",
    appliesTo: ["memory_add", "memory_update", "proposal_create"],
  },
  {
    name: "Agent identity",
    description: "Memory writes require user_id for action traceability.",
    status: "enforced",
    appliesTo: ["memory_add", "proposal_create", "audit_write"],
  },
  {
    name: "Content validation",
    description: "Proposals must contain non-empty content with minimum length 10 characters.",
    status: "enforced",
    appliesTo: ["proposal_create", "memory_add"],
  },
  {
    name: "Approval audit",
    description: "Approval decisions are written as events with group_id, proposal, score, action.",
    status: "proposed",
    appliesTo: ["proposal_approve", "proposal_reject"],
  },
  {
    name: "Curator tiers",
    description: "Promotion confidence tiers: emerging 0.60, adoption 0.75, mainstream 0.85.",
    status: "enforced",
    appliesTo: ["memory_promote", "insight_approve"],
  },
]

function getApplicableRules(action: string): PolicyRule[] {
  return GOVERNANCE_RULES.filter((rule) => rule.appliesTo.includes(action))
}

function validateAgainstRules(
  rules: PolicyRule[],
  content: string,
  agentId?: string,
  groupId?: string
): Array<{ rule: PolicyRule; passed: boolean; message: string }> {
  return rules.map((rule) => {
    switch (rule.name) {
      case "Tenant namespace":
        return {
          rule,
          passed: Boolean(groupId?.startsWith("allura")),
          message: groupId?.startsWith("allura") ? "Valid namespace" : "Missing or invalid group_id",
        }
      case "Agent identity":
        return {
          rule,
          passed: Boolean(agentId),
          message: agentId ? "Agent identified" : "No agent attribution",
        }
      case "Content validation":
        return {
          rule,
          passed: content.length >= 10,
          message: content.length >= 10 ? "Content length valid" : `Content too short (${content.length}/10 chars)`,
        }
      default:
        return {
          rule,
          passed: true,
          message: "No automated check",
        }
    }
  })
}

export default function PolicyCitation({ content, agentId, groupId }: PolicyCitationProps) {
  const [expanded, setExpanded] = useState(false)
  const rules = getApplicableRules("proposal_create")
  const validations = validateAgainstRules(rules, content, agentId, groupId)
  const allPassed = validations.every((v) => v.passed)
  const enforcedCount = rules.filter((r) => r.status === "enforced").length

  return (
    <Card className={cn(
      "border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] overflow-hidden",
      allPassed ? "border-l-4 border-l-[var(--dashboard-cta-approval)]" : "border-l-4 border-l-[var(--dashboard-cta-primary)]"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full"
        aria-expanded={expanded}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className={cn(
                "size-4",
                allPassed ? "text-[var(--dashboard-cta-approval)]" : "text-[var(--dashboard-cta-primary)]"
              )} />
              <CardTitle className="text-sm font-medium text-[var(--dashboard-text-primary)]">
                Governance Check
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {enforcedCount} enforced
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {allPassed ? (
                <Badge className="border-green-500/20 bg-green-500/10 text-green-600 text-[10px]">
                  <CheckCircle2 className="mr-1 size-3" />
                  All clear
                </Badge>
              ) : (
                <Badge className="border-orange-500/20 bg-orange-500/10 text-orange-600 text-[10px]">
                  <ShieldAlert className="mr-1 size-3" />
                  {validations.filter((v) => !v.passed).length} issues
                </Badge>
              )}
              {expanded ? <ChevronDown className="size-4 text-[var(--dashboard-text-muted)]" /> : <ChevronRight className="size-4 text-[var(--dashboard-text-muted)]" />}
            </div>
          </div>
        </CardHeader>
      </button>

      {expanded && (
        <CardContent className="space-y-2 pt-0">
          <p className="text-xs text-[var(--dashboard-text-secondary)]">
            Policies that apply to this proposal:
          </p>
          <div className="space-y-2">
            {validations.map(({ rule, passed, message }) => (
              <div
                key={rule.name}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-2.5",
                  passed
                    ? "border-green-500/20 bg-green-500/5"
                    : "border-orange-500/20 bg-orange-500/5"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {passed ? (
                    <CheckCircle2 className="size-4 text-green-600" />
                  ) : (
                    <ShieldAlert className="size-4 text-orange-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-[var(--dashboard-text-primary)]">{rule.name}</p>
                    <Badge variant="outline" className="text-[9px]">
                      {rule.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--dashboard-text-secondary)]">{rule.description}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Info className="size-3 text-[var(--dashboard-text-muted)]" />
                    <p className={cn(
                      "text-[10px]",
                      passed ? "text-green-600" : "text-orange-600"
                    )}>
                      {message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--dashboard-text-muted)]">
            These checks run client-side for immediate feedback. Server-side validation is the authoritative gate.
          </p>
        </CardContent>
      )}
    </Card>
  )
}
