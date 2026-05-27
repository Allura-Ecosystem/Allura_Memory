import { test } from "@playwright/test"

const BASE = "http://localhost:3100"

const shots = [
  { path: "/dashboard", name: "dashboard" },
  { path: "/dashboard/memory-space", name: "memory-space" },
  { path: "/allura", name: "allura" },
  { path: "/dashboard/insights", name: "insights" },
]

for (const s of shots) {
  test(s.name, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle" })
    await page.waitForTimeout(2500)
    await page.screenshot({
      path: `tests/visual-baselines/screenshots-2026-05-21/3100-${s.name}-post-iris-recovery.png`,
      fullPage: false,
    })
  })
}
