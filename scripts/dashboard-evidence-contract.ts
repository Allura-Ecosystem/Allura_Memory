const FORBIDDEN_SURFACE_STATES = /data-surface-state=["'](?:degraded|error)["']/i
const UNSETTLED_SOURCE_STATES = /data-source-state=["'](?:loading|error)["']/i
const UNSETTLED_CURATOR_STATES = /data-shell-state=["'](?:loading|stale|partial|conflict|error|denied)["']/i
const DEGRADED_CURATOR_STATE = /data-shell-state=["']degraded["']/i
const OPTIONAL_MODULE_DISABLED_MARKER = "Bumblebee is currently unavailable."

const BUSINESS_FAILURE_MARKERS = [
  "Curator workflow access is unavailable because audit recording failed.",
  "Queue unavailable",
] as const

/**
 * Returns business-state reasons that make a dashboard screenshot ineligible.
 * A truthful `data-surface-state=empty` and the Curator's documented optional
 * Bumblebee-disabled state remain eligible: neither claims a healthy live
 * result nor leaves the operator surface unsettled.
 */
export function dashboardEvidenceFailures(snapshot: string): string[] {
  const failures: string[] = []
  if (FORBIDDEN_SURFACE_STATES.test(snapshot)) failures.push("dashboard data surface is degraded or errored")
  if (UNSETTLED_SOURCE_STATES.test(snapshot)) failures.push("curator proposal queue did not settle")
  if (UNSETTLED_CURATOR_STATES.test(snapshot)) failures.push("curator module state did not settle")
  if (DEGRADED_CURATOR_STATE.test(snapshot) && !snapshot.includes(OPTIONAL_MODULE_DISABLED_MARKER)) {
    failures.push("curator module is degraded for a reason other than the documented optional-module disablement")
  }
  if (snapshot.includes("Loading the governed proposal queue…")) failures.push("curator proposal queue is still loading")
  for (const marker of BUSINESS_FAILURE_MARKERS) {
    if (snapshot.includes(marker)) failures.push(`business state: ${marker}`)
  }
  return failures
}

export function isSettledDashboardSnapshot(snapshot: string): boolean {
  return dashboardEvidenceFailures(snapshot).length === 0
}
