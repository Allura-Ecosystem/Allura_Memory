import { chromium } from "playwright"

const ROUTES = [
  { path: "/dashboard", name: "dashboard-overview" },
  { path: "/dashboard/memory", name: "dashboard-memory" },
  { path: "/dashboard/memory/example-id", name: "dashboard-memory-detail" },
  { path: "/dashboard/review", name: "dashboard-review" },
  { path: "/dashboard/skills", name: "dashboard-skills" },
  { path: "/dashboard/evidence", name: "dashboard-evidence" },
  { path: "/dashboard/insights", name: "dashboard-insights" },
  { path: "/dashboard/settings", name: "dashboard-settings" },
]

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })

  for (const route of ROUTES) {
    try {
      await page.goto(`http://localhost:3100${route.path}`, {
        waitUntil: "networkidle",
        timeout: 30000,
      })
      await page.waitForTimeout(1500)
      await page.screenshot({
        path: `docs/archive/smoke-screenshots/${route.name}.png`,
        fullPage: false,
      })
      console.log(`✅ ${route.name}`)
    } catch (err) {
      console.log(`❌ ${route.name}: ${(err as Error).message.slice(0, 80)}`)
    }
  }

  await browser.close()
}

main()
