import { getHealthMetrics, resolveDashboardGroupId } from "@/lib/dashboard/api"
import { loadCuratorQueue, loadPolicyEnforcement } from "@/lib/dashboard/queries"
import type { DashboardResult, DashboardWarning } from "@/lib/dashboard/types"

export type HonestPanelId = "system-truth" | "hygiene-actions" | "approvals"
export type HonestPanelState = "unknown" | "degraded" | "empty" | "failed" | "ready"

export interface HonestDashboardPanel {
  id: HonestPanelId
  label: string
  state: HonestPanelState
  summary: string
  action: string
  source: string
  count: number | null
  usesSampleData: false
  warnings: DashboardWarning[]
}

function warning(id: string, source: string, message: string, severity: DashboardWarning["severity"] = "warning"): DashboardWarning {
  return { id, source, message, severity }
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

export async function loadHonestDashboardPanels(groupId?: string): Promise<DashboardResult<HonestDashboardPanel[]>> {
  try {
    const scopedGroupId = resolveDashboardGroupId(groupId)
    const [health, policy, queue] = await Promise.allSettled([
      getHealthMetrics(scopedGroupId),
      loadPolicyEnforcement(scopedGroupId),
      loadCuratorQueue("pending", scopedGroupId),
    ])

    const warnings: DashboardWarning[] = []
    const panels: HonestDashboardPanel[] = []

    if (health.status === "rejected") {
      warnings.push(warning("system-truth-failed", "health-metrics", errorMessage(health.reason, "Health metrics unavailable"), "critical"))
      panels.push({
        id: "system-truth",
        label: "System truth",
        state: "failed",
        summary: errorMessage(health.reason, "System metrics unavailable."),
        action: "Retry health metrics before trusting runtime status.",
        source: "GET /api/health/metrics scoped by group_id",
        count: null,
        usesSampleData: false,
        warnings: [warnings[warnings.length - 1]],
      })
    } else if (!health.value.data) {
      panels.push({
        id: "system-truth",
        label: "System truth",
        state: "unknown",
        summary: "System metrics returned no payload.",
        action: "Check runtime health before making status claims.",
        source: "GET /api/health/metrics scoped by group_id",
        count: null,
        usesSampleData: false,
        warnings: health.value.warning ? [warning("system-truth-warning", "health-metrics", health.value.warning)] : [],
      })
    } else {
      const degradedSignals = Object.values(health.value.data.degraded).reduce((sum, value) => sum + Number(value ?? 0), 0)
      const isDegraded = health.value.degraded || degradedSignals > 0 || health.value.data.storage.neo4j.status === "degraded"
      const panelWarnings = health.value.warning ? [warning("system-truth-warning", "health-metrics", health.value.warning)] : []
      const degradedSummary = degradedSignals > 0
        ? `${degradedSignals} degraded runtime signal${degradedSignals === 1 ? "" : "s"} reported.`
        : "Runtime metrics are partial or warning-only degraded."
      warnings.push(...panelWarnings)
      panels.push({
        id: "system-truth",
        label: "System truth",
        state: isDegraded ? "degraded" : "ready",
        summary: isDegraded ? degradedSummary : "System metrics are available for this tenant.",
        action: isDegraded ? "Inspect runtime warnings before relying on dashboard counts." : "Use metrics as current tenant-scoped status.",
        source: "GET /api/health/metrics scoped by group_id",
        count: isDegraded && degradedSignals === 0 ? null : degradedSignals,
        usesSampleData: false,
        warnings: panelWarnings,
      })
    }

    if (policy.status === "rejected") {
      const item = warning("hygiene-actions-failed", "policy-events", errorMessage(policy.reason, "Policy event reads unavailable"), "critical")
      warnings.push(item)
      panels.push({
        id: "hygiene-actions",
        label: "Hygiene actions",
        state: "failed",
        summary: item.message,
        action: "Retry policy event reads before declaring hygiene resolved.",
        source: "Policy check and violation audit events scoped by group_id",
        count: null,
        usesSampleData: false,
        warnings: [item],
      })
    } else if (policy.value.error) {
      const item = warning("hygiene-actions-error", "policy-events", policy.value.error, "critical")
      warnings.push(item)
      panels.push({
        id: "hygiene-actions",
        label: "Hygiene actions",
        state: "failed",
        summary: policy.value.error,
        action: "Resolve audit read failure before claiming policy state.",
        source: "Policy check and violation audit events scoped by group_id",
        count: null,
        usesSampleData: false,
        warnings: [item, ...policy.value.warnings],
      })
    } else {
      const violationCount = policy.value.data?.violationCount ?? 0
      const checkCount = policy.value.data?.checkCount ?? 0
      const isEmpty = violationCount === 0 && checkCount === 0
      const state: HonestPanelState = policy.value.degraded ? "degraded" : isEmpty ? "empty" : violationCount > 0 ? "degraded" : "ready"
      warnings.push(...policy.value.warnings)
      panels.push({
        id: "hygiene-actions",
        label: "Hygiene actions",
        state,
        summary: isEmpty
          ? "No policy events returned for the current window."
          : `${violationCount} policy violation${violationCount === 1 ? "" : "s"} and ${checkCount} check${checkCount === 1 ? "" : "s"} returned.`,
        action: isEmpty ? "Treat hygiene as empty, not proven resolved." : "Review policy events and address violations.",
        source: "Policy check and violation audit events scoped by group_id",
        count: isEmpty ? 0 : violationCount,
        usesSampleData: false,
        warnings: policy.value.warnings,
      })
    }

    if (queue.status === "rejected") {
      const item = warning("approvals-failed", "curator-queue", errorMessage(queue.reason, "Approval queue unavailable"), "critical")
      warnings.push(item)
      panels.push({
        id: "approvals",
        label: "Approvals",
        state: "failed",
        summary: item.message,
        action: "Retry queue reads before saying approval work is empty.",
        source: "Curator proposal queue scoped by group_id",
        count: null,
        usesSampleData: false,
        warnings: [item],
      })
    } else if (queue.value.error) {
      const item = warning("approvals-error", "curator-queue", queue.value.error, "critical")
      warnings.push(item)
      panels.push({
        id: "approvals",
        label: "Approvals",
        state: "failed",
        summary: queue.value.error,
        action: "Fix curator queue access before presenting approval state.",
        source: "Curator proposal queue scoped by group_id",
        count: null,
        usesSampleData: false,
        warnings: [item, ...queue.value.warnings],
      })
    } else {
      const approvals = queue.value.data ?? []
      const healthPanel = panels.find((panel) => panel.id === "system-truth")
      const state: HonestPanelState = queue.value.degraded || healthPanel?.state === "degraded"
        ? "degraded"
        : approvals.length === 0
          ? "empty"
          : "ready"
      warnings.push(...queue.value.warnings)
      panels.push({
        id: "approvals",
        label: "Approvals",
        state,
        summary: approvals.length === 0
          ? "No pending proposals returned by the curator queue."
          : `${approvals.length} proposal${approvals.length === 1 ? "" : "s"} need curator review.`,
        action: approvals.length === 0 ? "Treat approvals as empty, not proof that future work is resolved." : "Review pending proposals with evidence before approval.",
        source: "Curator proposal queue scoped by group_id",
        count: approvals.length,
        usesSampleData: false,
        warnings: queue.value.warnings,
      })
    }

    return {
      data: panels,
      error: null,
      degraded: panels.some((panel) => panel.state === "degraded" || panel.state === "failed" || panel.state === "unknown"),
      warnings,
    }
  } catch (error) {
    return {
      data: null,
      error: errorMessage(error, "Honest dashboard panels failed to load"),
      degraded: true,
      warnings: [],
    }
  }
}
