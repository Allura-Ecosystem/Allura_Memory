/**
 * Status color mapping for memory nodes.
 * Colors work in both light and dark contexts.
 */

export const MEMORY_TYPE_COLORS: Record<string, { ring: string; fill: string; label: string }> = {
  raw: {
    ring: "var(--allura-gray-400)",
    fill: "var(--allura-gray-100)",
    label: "Raw",
  },
  approved: {
    ring: "var(--allura-blue)",
    fill: "var(--dashboard-surface-muted)",
    label: "Approved",
  },
  promoted: {
    ring: "var(--allura-green)",
    fill: "var(--dashboard-success-bg)",
    label: "Promoted",
  },
  deprecated: {
    ring: "var(--dashboard-danger)",
    fill: "var(--dashboard-danger-bg)",
    label: "Deprecated",
  },
}

export const MEMORY_SOURCE_BADGE: Record<string, { color: string; label: string }> = {
  episodic: { color: "var(--dashboard-evidence)", label: "EP" },
  semantic: { color: "var(--dashboard-info)", label: "SM" },
  both:     { color: "var(--dashboard-warning)", label: "BOTH" },
}

/**
 * Get opacity based on confidence score.
 * Low confidence = more transparent.
 */
export function getScoreOpacity(score: number): number {
  return 0.4 + score * 0.6 // 0.4–1.0
}
