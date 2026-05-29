import withBundleAnalyzer from "@next/bundle-analyzer"
import { type NextConfig } from "next"

import { env } from "./env.mjs"

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",

  allowedDevOrigins: ["127.0.0.1"],

  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  outputFileTracingExcludes: {
    "/api/skills": [
      ".opencode/skills/aionui-skills/**/*",
      ".opencode/skills/cron/**/*",
      ".opencode/skills/office-cli/**/*",
      ".opencode/skills/templates/**/*",
    ],
  },

  // Health check aliases
  rewrites: async () => [
    { source: "/healthz", destination: "/api/health/live" },
    { source: "/api/healthz", destination: "/api/health/live" },
    { source: "/health", destination: "/api/health/live" },
    { source: "/ping", destination: "/api/health/live" },
  ],
}

export default env.ANALYZE ? withBundleAnalyzer({ enabled: env.ANALYZE })(config) : config
