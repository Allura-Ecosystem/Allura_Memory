import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  // The authoring skill trees are only meaningful in a developer checkout.
  // `/api/skills` tolerates their absence and returns an empty list, so tracing
  // them into the public portal image adds private tooling and stale paths.
  outputFileTracingExcludes: {
    "/api/skills": ["./.opencode/skills/**/*", "./.claude/skills/**/*"],
  },
  // The portfolio evidence runner drives the local development server through
  // http://127.0.0.1. Declare that loopback origin explicitly so Next dev does
  // not block HMR/font/client-hydration resources during browser proof.
  allowedDevOrigins: ["127.0.0.1"],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
}

export default nextConfig
