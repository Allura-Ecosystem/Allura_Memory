"use client"

/**
 * Toast — individual notification card.
 *
 * Variants: success | error | warning | info
 * Each uses a colored left border and matching icon drawn with inline SVG
 * (no external icon dep required; lucide-react is already in the bundle so
 * we use it where convenient).
 *
 * Token authority: Tailwind bg-[var(--...)] syntax only. No inline style vars,
 * no raw hex.
 */

import { useEffect, useRef } from "react"
import type { Toast as ToastData } from "@/store/toast"
import { useToastStore } from "@/store/toast"

// ── Icons ────────────────────────────────────────────────────────────────────

function SuccessIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-[var(--dashboard-success)]"
    >
      <circle cx="9" cy="9" r="8.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5.5 9.25L7.75 11.5L12.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-[var(--tone-red-text)]"
    >
      <circle cx="9" cy="9" r="8.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M6 6L12 12M12 6L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-[var(--dashboard-accent)]"
    >
      <path d="M9 2L16.5 15H1.5L9 2Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M9 7V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="12.5" r="0.75" fill="currentColor" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-[var(--allura-blue)]"
    >
      <circle cx="9" cy="9" r="8.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M9 8V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="5.5" r="0.75" fill="currentColor" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ── Variant config ────────────────────────────────────────────────────────────

const VARIANT_CONFIG = {
  success: {
    icon: <SuccessIcon />,
    borderClass: "border-l-[var(--dashboard-success)]",
  },
  error: {
    icon: <ErrorIcon />,
    borderClass: "border-l-[var(--tone-red-text)]",
  },
  warning: {
    icon: <WarningIcon />,
    borderClass: "border-l-[var(--dashboard-accent)]",
  },
  info: {
    icon: <InfoIcon />,
    borderClass: "border-l-[var(--allura-blue)]",
  },
} as const

// ── Component ─────────────────────────────────────────────────────────────────

interface ToastItemProps {
  toast: ToastData
  isVisible: boolean
}

export function ToastItem({ toast, isVisible }: ToastItemProps) {
  const removeToast = useToastStore((s) => s.removeToast)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { icon, borderClass } = VARIANT_CONFIG[toast.type]
  const duration = toast.duration ?? 5000

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      removeToast(toast.id)
    }, duration)

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [toast.id, duration, removeToast])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        transition: "transform 200ms ease-out, opacity 200ms ease-out",
        transform: isVisible ? "translateY(0)" : "translateY(100%)",
        opacity: isVisible ? 1 : 0,
      }}
      className={[
        "relative flex items-start gap-3",
        "min-w-[300px] max-w-[420px] w-full",
        "rounded-lg bg-white",
        "border-l-4",
        borderClass,
        "p-4",
        "shadow-[0_4px_12px_rgba(0,0,0,0.1)]",
        "@media(prefers-reduced-motion:reduce) transition-none",
      ].join(" ")}
    >
      {/* Type icon */}
      <span className="mt-0.5">{icon}</span>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <p
          className="m-0 text-sm font-semibold leading-snug text-[var(--dashboard-text-primary)]"
          style={{ fontSize: "14px" }}
        >
          {toast.title}
        </p>
        {toast.message && (
          <p
            className="m-0 leading-snug text-[var(--dashboard-text-secondary)]"
            style={{ fontSize: "13px" }}
          >
            {toast.message}
          </p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action!.onClick()
              removeToast(toast.id)
            }}
            className="mt-1 self-start text-sm font-semibold text-[var(--allura-blue)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--allura-blue)] rounded"
            style={{ fontSize: "13px", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Dismiss button — 44x44 touch target */}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => removeToast(toast.id)}
        className="flex shrink-0 items-center justify-center rounded text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--allura-blue)]"
        style={{ width: 44, height: 44, margin: "-10px -10px 0 0", background: "none", border: "none", cursor: "pointer" }}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
