const FORBIDDEN_SURFACE_STATES = /data-surface-state=["'](?:degraded|error)["']/i
const UNSETTLED_SOURCE_STATES = /data-source-state=["'](?:loading|error)["']/i
const UNSETTLED_CURATOR_STATES = /data-shell-state=["'](?:loading|stale|partial|conflict|error|denied)["']/i
const DEGRADED_CURATOR_STATE = /data-shell-state=["']degraded["']/i
const OPTIONAL_MODULE_DISABLED_MARKER = "Bumblebee is currently unavailable."

const BUSINESS_FAILURE_MARKERS = [
  "Curator workflow access is unavailable because audit recording failed.",
  "Queue unavailable",
  "Data temporarily unavailable.",
  "This surface could not load.",
] as const

/**
 * Returns business-state reasons that make a dashboard screenshot ineligible.
 * A truthful `data-surface-state=empty` and the Curator's documented optional
 * Bumblebee-disabled state remain eligible: neither claims a healthy live
 * result nor leaves the operator surface unsettled.
 */
export function dashboardEvidenceFailures(snapshot: string): string[] {
  const failures: string[] = []
  if (!snapshot.trim()) failures.push("empty dashboard snapshot")
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Fail closed on unsuccessful commands and unsupported CLI response shapes. */
export function browserResponseData(output: string): Record<string, unknown> {
  const response: unknown = JSON.parse(output)
  if (!isRecord(response) || response.success !== true || !isRecord(response.data)) {
    throw new Error("agent-browser returned an unsuccessful or malformed JSON response")
  }
  return response.data
}

export function browserSnapshot(output: string): string {
  const { snapshot } = browserResponseData(output)
  if (typeof snapshot !== "string" || !snapshot.trim()) throw new Error("agent-browser returned an empty or malformed snapshot")
  return snapshot
}

export function browserDiagnosticErrors(output: string, source: "console" | "page"): string[] {
  const data = browserResponseData(output)
  const entries = data[source === "console" ? "messages" : "errors"]
  if (!Array.isArray(entries)) throw new Error(`agent-browser returned malformed ${source} diagnostics`)
  const errors: string[] = []
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.text !== "string" || (source === "console" && typeof entry.type !== "string")) {
      throw new Error(`agent-browser returned a malformed ${source} entry`)
    }
    if (source === "page" || entry.type === "error") errors.push(entry.text)
  }
  return errors
}
