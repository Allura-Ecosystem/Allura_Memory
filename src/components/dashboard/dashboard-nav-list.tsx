"use client"

import Link from "next/link"
import { useState } from "react"

import styles from "./dashboard-shell.module.css"
import { DASHBOARD_ROUTES } from "./dashboard-shell"

/**
 * Renders the primary navigation links plus a compact disclosure toggle.
 *
 * At <=760px the sidebar collapses into a single row and the full route list
 * used to overflow horizontally (clipping routes off-screen, see
 * dashboard-shell.module.css history). This renders every route inside a
 * `<ul>` that CSS hides by default on narrow viewports; the toggle button
 * (native `<button>`, `aria-expanded`/`aria-controls`) exposes it as a
 * vertical, non-overflowing menu. Desktop layout is untouched — the toggle
 * is hidden above the 760px breakpoint and the list is always visible.
 */
export function DashboardNavList({ activePath }: { activePath?: string }): React.ReactElement {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={styles.navToggle}
        aria-expanded={open}
        aria-controls="dashboard-nav-list"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">☰</span> Menu
      </button>
      <ul id="dashboard-nav-list" className={styles.navList} data-open={open}>
        {DASHBOARD_ROUTES.map((route) => (
          <li key={route.href}>
            <Link href={route.href} aria-current={activePath === route.href ? "page" : undefined}>
              {route.label}<span aria-hidden="true">{route.href === "/portal" ? "↗" : ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
