/**
 * Vitest Config — Curator Lane
 *
 * Auto-Curator and curator proposal pipeline only.
 * Scoring, pattern detection, similarity, dedup, governance.
 */
import { config } from "dotenv"
import { defineConfig } from "vitest/config"
import path from "node:path"

config()

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    passWithNoTests: false,
    include: [
      "src/__tests__/auto-curator*.test.ts",
      "src/__tests__/curator-approve.test.ts",
      "src/__tests__/curator-reject.test.ts",
      "src/curator/**/*.test.ts",
    ],
    testTimeout: 10_000,
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
})