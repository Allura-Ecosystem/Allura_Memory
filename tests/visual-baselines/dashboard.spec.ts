import { test, expect } from "@playwright/test"

/**
 * Dashboard Visual Regression Baselines
 *
 * Run: npx playwright test tests/visual-baselines/dashboard.spec.ts
 * Update baselines: npx playwright test --update-snapshots
 *
 * Baseline images are stored alongside this file in __snapshots__/
 */

const ROUTES = [
  { path: "/dashboard", name: "dashboard" },
  { path: "/dashboard/memory-space", name: "memory-space" },
  { path: "/dashboard/agents", name: "agents" },
  { path: "/dashboard/insights", name: "insights" },
  { path: "/dashboard/skills", name: "skills" },
  { path: "/dashboard/memory", name: "memory" },
  { path: "/dashboard/review", name: "review" },
  { path: "/dashboard/settings", name: "settings" },
  { path: "/allura", name: "allura" },
]

const VIEWPORTS = [
  { width: 1280, height: 900, name: "desktop" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 375, height: 667, name: "mobile" },
]

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${route.name} @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(`http://localhost:3100${route.path}`, { waitUntil: "networkidle" })
      // Wait for hydration / skeletons to settle
      await page.waitForTimeout(2000)
      await expect(page).toHaveScreenshot(
        `${route.name}-${viewport.name}.png`,
        { maxDiffPixelRatio: 0.02 }
      )
    })
  }
}
