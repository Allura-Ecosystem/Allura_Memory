import { defineConfig } from "vitest/config"
import live from "./vitest.config.live-db"

// Own inventory: do not merge include arrays and accidentally run the 5432 lane.
export default defineConfig({ ...live, test: { ...live.test,
  include: ["src/__tests__/digital-brain-read-isolation.e2e.test.ts"],
  hookTimeout: 90_000,
} })
