/**
 * Toast store — Zustand slice for the dashboard notification system.
 *
 * Rules:
 * - Max 3 toasts visible at once; oldest removed first when 4th arrives.
 * - Auto-dismiss timer is managed per-toast in the UI layer (ToastContainer).
 * - No raw DB error messages or stack traces may be stored in `message`.
 *   Callers must sanitize to human-readable text before calling addToast.
 */

import { create } from "zustand"

// ── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "info"

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  action?: ToastAction
  /** Auto-dismiss duration in ms. Default: 5000. */
  duration?: number
  createdAt: number
}

export type ToastInput = Omit<Toast, "id" | "createdAt">

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 3
const DEFAULT_DURATION = 5000

// ── Store ────────────────────────────────────────────────────────────────────

interface ToastState {
  toasts: Toast[]
  addToast: (input: ToastInput) => string
  removeToast: (id: string) => void
  clearAll: () => void
}

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (input: ToastInput): string => {
    const id = generateId()
    const toast: Toast = {
      ...input,
      id,
      duration: input.duration ?? DEFAULT_DURATION,
      createdAt: Date.now(),
    }
    set((state) => {
      const next = [...state.toasts, toast]
      // If over the limit, drop the oldest entries
      const trimmed = next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
      return { toasts: trimmed }
    })
    return id
  },

  removeToast: (id: string): void => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clearAll: (): void => {
    set({ toasts: [] })
  },
}))
