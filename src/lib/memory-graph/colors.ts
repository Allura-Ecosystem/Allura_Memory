/**
 * Status color mapping for memory nodes.
 * Colors work in both light and dark contexts.
 */

export const MEMORY_TYPE_COLORS: Record<string, { ring: string; fill: string; label: string }> = {
  raw: {
    ring: "#9ca3af",    // gray-400
    fill: "#f3f4f6",    // gray-100
    label: "Raw",
  },
  approved: {
    ring: "#3b82f6",    // blue-500
    fill: "#eff6ff",    // blue-50
    label: "Approved",
  },
  promoted: {
    ring: "#22c55e",    // green-500
    fill: "#f0fdf4",    // green-50
    label: "Promoted",
  },
  deprecated: {
    ring: "#ef4444",    // red-500
    fill: "#fef2f2",    // red-50
    label: "Deprecated",
  },
}

export const MEMORY_SOURCE_BADGE: Record<string, { color: string; label: string }> = {
  episodic: { color: "#8b5cf6", label: "EP" },   // violet
  semantic: { color: "#06b6d4", label: "SM" },   // cyan
  both:     { color: "#f59e0b", label: "BOTH" },  // amber
}

/**
 * Get opacity based on confidence score.
 * Low confidence = more transparent.
 */
export function getScoreOpacity(score: number): number {
  return 0.4 + score * 0.6 // 0.4–1.0
}
