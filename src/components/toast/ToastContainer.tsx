"use client"

/**
 * ToastContainer — fixed bottom-right ARIA live region.
 *
 * Renders up to 3 toasts from the Zustand store.
 * The outer div carries role="region" + aria-live="polite" as the announcement
 * boundary; each ToastItem also carries role="status" for per-item announcements.
 *
 * Animation: slide-in from bottom (translateY(100%) → translateY(0)) 200ms ease-out.
 * prefers-reduced-motion: motion is suppressed; toast stays visible with no movement.
 */

import { useEffect, useState } from "react"
import { useToastStore } from "@/store/toast"
import { ToastItem } from "./Toast"

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  // Track which toast ids have been "entered" — drives the slide-in animation.
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (toasts.length === 0) return

    const latestId = toasts[toasts.length - 1]?.id
    if (!latestId || visibleIds.has(latestId)) return

    // Use rAF so the element is mounted before we apply the visible state
    const frame = requestAnimationFrame(() => {
      setVisibleIds((prev) => new Set([...prev, latestId]))
    })

    return () => cancelAnimationFrame(frame)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts])

  // Prune removed toasts from visibleIds
  useEffect(() => {
    const activeIds = new Set(toasts.map((t) => t.id))
    setVisibleIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (activeIds.has(id)) next.add(id)
      }
      return next
    })
  }, [toasts])

  if (toasts.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end"
      style={{ pointerEvents: "none" }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={toast} isVisible={visibleIds.has(toast.id)} />
        </div>
      ))}
    </div>
  )
}
