"use client"

/**
 * useToast — convenience hook wrapping the toast store.
 *
 * Usage:
 *   const { toast } = useToast()
 *   toast.success("Memory saved")
 *   toast.error("Failed to connect", { message: "Check your network." })
 *   toast.warning("Rate limit near", { action: { label: "Upgrade", onClick: () => router.push("/billing") } })
 *   toast.info("Sync in progress")
 *
 * All shorthand methods accept a title as the first argument and an optional
 * partial ToastInput as the second for duration / message / action overrides.
 */

import { useToastStore } from "@/store/toast"
import type { ToastInput } from "@/store/toast"

type ToastOptions = Omit<ToastInput, "type" | "title">

interface ToastShorthands {
  success: (title: string, options?: ToastOptions) => string
  error: (title: string, options?: ToastOptions) => string
  warning: (title: string, options?: ToastOptions) => string
  info: (title: string, options?: ToastOptions) => string
  dismiss: (id: string) => void
  clearAll: () => void
}

export function useToast(): { toast: ToastShorthands } {
  const addToast = useToastStore((s) => s.addToast)
  const removeToast = useToastStore((s) => s.removeToast)
  const clearAll = useToastStore((s) => s.clearAll)

  const toast: ToastShorthands = {
    success: (title, options) => addToast({ type: "success", title, ...options }),
    error: (title, options) => addToast({ type: "error", title, ...options }),
    warning: (title, options) => addToast({ type: "warning", title, ...options }),
    info: (title, options) => addToast({ type: "info", title, ...options }),
    dismiss: (id) => removeToast(id),
    clearAll,
  }

  return { toast }
}
