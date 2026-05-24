/**
 * Dashboard Design Tokens
 *
 * Centralized CSS variable mappings and tone definitions.
 * Enables type-safe token selection across dashboard components.
 * Source of truth for governance dashboard color scheme.
 *
 * All values reference CSS variables defined in:
 * - src/styles/allura.css (primary tokens)
 * - src/styles/brand-tokens.css (CTA colors)
 */

/**
 * Tone types for dashboard components.
 * Each tone maps to a specific semantic meaning and color.
 */
export type DashboardTone = "green" | "red" | "orange" | "blue" | "charcoal"

/**
 * CSS variable names for dashboard colors and surfaces.
 * Use these to ensure consistency across components.
 */
export const DASHBOARD_CSS_VARIABLES = {
  // CTAs and Approvals
  ctaPrimary: "var(--dashboard-cta-primary)",       // Orange: #f97316
  ctaApproval: "var(--dashboard-cta-approval)",     // Green: #10b981

  // Accents
  accentSecondary: "var(--dashboard-accent-secondary)", // Blue
  accentTertiary: "var(--dashboard-accent-tertiary)",   // Purple

  // Text
  textPrimary: "var(--dashboard-text-primary)",         // Foreground color
  textSecondary: "var(--dashboard-text-secondary)",     // Dim text
  textMuted: "var(--dashboard-text-muted)",             // Minimal contrast
  textInverted: "var(--dashboard-text-inverted)",       // Light text on dark

  // Surfaces and Backgrounds
  surface: "var(--dashboard-surface)",               // Card backgrounds
  surfaceMuted: "var(--dashboard-surface-muted)",   // Secondary surfaces
  bg: "var(--dashboard-bg)",                         // Main background
  border: "var(--dashboard-border)",                 // Border color

  // Semantic
  blue: "var(--allura-blue)",                        // Informational
  orange: "var(--dashboard-cta-primary)",            // Warning/Attention
  red: "rgb(220, 38, 38)",                          // Error/Danger (red-600)
  green: "var(--dashboard-cta-approval)",            // Success
} as const

/**
 * Tone color mappings for icon colors.
 * Maps tone type to CSS color variable.
 */
export function getToneIconClass(tone: DashboardTone): string {
  switch (tone) {
    case "green":
      return "text-[var(--dashboard-cta-approval)]"
    case "red":
      return "text-red-600"
    case "orange":
      return "text-[var(--dashboard-cta-primary)]"
    case "blue":
      return "text-[var(--dashboard-accent-secondary)]"
    case "charcoal":
    default:
      return "text-[var(--dashboard-text-muted)]"
  }
}

/**
 * Tone color mappings for left border colors.
 * Used by MetricCard and similar components with accent borders.
 */
export function getToneBorderClass(tone: DashboardTone): string {
  switch (tone) {
    case "green":
      return "border-l-[var(--dashboard-cta-approval)]"
    case "red":
      return "border-l-red-500"
    case "orange":
      return "border-l-[var(--dashboard-cta-primary)]"
    case "blue":
      return "border-l-[var(--dashboard-accent-secondary)]"
    case "charcoal":
    default:
      return "border-l-[var(--dashboard-text-muted)]"
  }
}

/**
 * Tone color mappings for text colors.
 * Used for colored text that matches the tone.
 */
export function getToneTextClass(tone: DashboardTone): string {
  switch (tone) {
    case "green":
      return "text-green-600"
    case "red":
      return "text-red-600"
    case "orange":
      return "text-orange-600"
    case "blue":
      return "text-[var(--allura-blue)]"
    case "charcoal":
    default:
      return "text-[var(--dashboard-text-primary)]"
  }
}

/**
 * Background color variants for tone-based backgrounds.
 * Used for badge and alert backgrounds.
 */
export function getToneBackgroundClass(tone: DashboardTone, opacity: "10" | "20" = "10"): string {
  const opacityMap = {
    "10": "/10",
    "20": "/20",
  }
  const op = opacityMap[opacity]

  switch (tone) {
    case "green":
      return `bg-green-500${op}`
    case "red":
      return `bg-red-500${op}`
    case "orange":
      return `bg-orange-500${op}`
    case "blue":
      return `bg-blue-500${op}`
    case "charcoal":
    default:
      return `bg-gray-500${op}`
  }
}

/**
 * Badge border color variants for tone-based badges.
 * Complements background colors for consistent badge styling.
 */
export function getToneBadgeBorderClass(tone: DashboardTone): string {
  switch (tone) {
    case "green":
      return "border-green-500/20"
    case "red":
      return "border-red-500/20"
    case "orange":
      return "border-orange-500/20"
    case "blue":
      return "border-blue-500/20"
    case "charcoal":
    default:
      return "border-[var(--dashboard-border)]"
  }
}

/**
 * Semantic tone assignments for dashboard status values.
 * Maps event status and policy states to visual tones.
 */
export const TONE_ASSIGNMENTS = {
  status: {
    allowed: "green" as const,
    pass: "green" as const,
    approved: "green" as const,
    active: "green" as const,

    blocked: "red" as const,
    fail: "red" as const,
    rejected: "red" as const,
    error: "red" as const,

    warning: "orange" as const,
    pending: "orange" as const,
    proposed: "orange" as const,

    unknown: "charcoal" as const,
    degraded: "blue" as const,
  },
  eventType: {
    policy_check: "blue" as const,
    policy_violation: "red" as const,
    architecture_decision: "charcoal" as const,
  },
  severity: {
    critical: "red" as const,
    high: "orange" as const,
    medium: "blue" as const,
    low: "green" as const,
  },
} as const

/**
 * Get tone for a given status value.
 * Falls back to "charcoal" if status is not recognized.
 */
export function getToneForStatus(status: string): DashboardTone {
  const normalized = status.toLowerCase()
  return (TONE_ASSIGNMENTS.status[normalized as keyof typeof TONE_ASSIGNMENTS.status] ?? "charcoal") as DashboardTone
}

/**
 * Get tone for a given event type.
 * Falls back to "charcoal" if event type is not recognized.
 */
export function getToneForEventType(eventType: string): DashboardTone {
  const normalized = eventType.toLowerCase()
  return (TONE_ASSIGNMENTS.eventType[normalized as keyof typeof TONE_ASSIGNMENTS.eventType] ?? "charcoal") as DashboardTone
}
