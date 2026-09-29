/**
 * Date formatting utilities — single source of truth for Allura.
 *
 * Consolidates relative-time formatting, group headers, and provenance dates.
 */

import { format, isToday, isYesterday } from "date-fns"

/**
 * Format a date string as relative time (e.g. "5 minutes ago").
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins} minutes ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

/**
 * Format a date string as a day-group label (Today / Yesterday / EEEE, MMMM d).
 * Used by the audit log to group events by day.
 */
export function formatGroupHeader(dateString: string): string {
  const date = new Date(dateString)
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  return format(date, "EEEE, MMMM d")
}

/**
 * Format a date string for provenance display (human-readable locale string).
 */
export function formatProvenanceDate(dateString: string): string {
  return new Date(dateString).toLocaleString()
}
