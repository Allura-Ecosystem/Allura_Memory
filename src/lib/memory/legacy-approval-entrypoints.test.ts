import { spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()
const disabledMessage = /legacy approval entrypoint is disabled/i

const cases: Array<{ script: string; args?: string[] }> = [
  { script: "scripts/batch-approve-proposals.ts" },
  { script: "scripts/curator-batch-triage.ts", args: ["--execute"] },
  { script: "scripts/approve-proposals-by-id.ts", args: ["--execute", "--decided-by=reviewer", "deadbeef"] },
  { script: "scripts/content-aware-curator-v2.ts" },
  { script: "scripts/content-aware-curator.ts" },
  { script: "scripts/e2e-validation-gate.ts" },
]

describe("legacy approval production entrypoints", () => {
  for (const entry of cases) {
    it(`${entry.script} fails closed before database access`, () => {
      const result = spawnSync("bun", [entry.script, ...(entry.args ?? [])], {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          POSTGRES_HOST: "127.0.0.1",
          POSTGRES_PORT: "1",
        },
      })
      const output = `${result.stdout}\n${result.stderr}`
      expect(result.status).not.toBe(0)
      expect(output).toMatch(disabledMessage)
      expect(output).not.toMatch(/ECONNREFUSED|password authentication|connect ECONN/i)
    })
  }
})
