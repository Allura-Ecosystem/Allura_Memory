import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.ALLURA_DASHBOARD_PORT ?? 3100)

export default defineConfig({
  testDir: "./tests/playwright",
  testMatch: "knowledge-map.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "test-results/knowledge-map-report", open: "never" }]],
  outputDir: "test-results/knowledge-map",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "en-US",
    timezoneId: "America/New_York",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "bun run dev",
    url: `http://127.0.0.1:${port}/dashboard/graph`,
    env: {
      ...process.env,
      ALLURA_DEV_AUTH_ENABLED: "true",
      ALLURA_DEMO_DEV_AUTH_FORCE: "true",
      ALLURA_DEV_AUTH_GROUP_ID: "allura-epic31-browser",
      ALLURA_DEV_AUTH_WORKSPACE_ID: "epic31-browser-workspace",
      ALLURA_DEV_AUTH_USER_ID: "epic31-browser-evidence",
      ALLURA_DEV_AUTH_EMAIL: "epic31-browser-evidence@allura.local",
      ALLURA_DEV_AUTH_ROLE: "viewer",
      ALLURA_GRAPH_V2_ENABLED: "true",
      ALLURA_GRAPH_CONTINUATION_SECRET: "epic31-browser-continuation-secret-material-v1",
    },
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
