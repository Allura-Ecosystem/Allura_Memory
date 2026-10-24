import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

export default defineConfig({
  // Pinned Vite 5 treats false as the root, so the pre-hook maps the disabled policy to an inert path.
  // @ts-expect-error -- Vite 5 types envDir as string even though this config's policy is disabled.
  envDir: false,
  plugins: [
    {
      name: "dev-safe-disable-vite-env-files",
      enforce: "pre",
      config: () => ({ envDir: resolve(process.cwd(), ".dev-safe-vite-env-disabled") }),
    },
  ],
  test: {
    environment: "node",
    pool: "forks",
    poolOptions: { forks: { execArgv: ["--no-env-file"] } },
    passWithNoTests: false,
    include: ["tests/scripts/dev-safe.test.ts"],
    testTimeout: 10_000,
  },
})
