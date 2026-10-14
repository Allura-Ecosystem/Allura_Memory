import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()
// Historical reports are evidence, not live deployment authority (AD-65).
const architecture = readFileSync(join(repoRoot, "docs/allura/SOLUTION-ARCHITECTURE.md"), "utf8")
const requirements = readFileSync(join(repoRoot, "docs/allura/REQUIREMENTS-MATRIX.md"), "utf8")
const readme = readFileSync(join(repoRoot, "README.md"), "utf8")
const compose = readFileSync(join(repoRoot, "docker-compose.yml"), "utf8")
const envValidator = readFileSync(join(repoRoot, "scripts/validate-env.sh"), "utf8")

describe("install deploy review", () => {
  it("keeps release blocked until fresh deploy evidence exists", () => {
    expect(requirements).toMatch(/\| SEP-02 \|[^\n]+\| Pending \|/)
    expect(architecture).toContain("not a service cutover or a complete installer")
    expect(architecture).toContain("Fresh install, backup/restore, restart and upgrade/rollback need execution evidence")
  })

  it("documents the canonical env-file compose path", () => {
    const composePrefix = "docker compose --env-file .env --env-file .env.local"

    expect(compose).toContain(`${composePrefix} build --no-cache`)
    expect(compose).toContain(`${composePrefix} up -d`)
    expect(compose).toContain("docker compose ps")
    expect(architecture).toContain("`brain-stack.sh`, `first-run.sh` and `first-run-setup.sh`")
  })

  it("ties deploy readiness to the environment validator", () => {
    expect(architecture).toContain("`validate-env.sh`")
    expect(envValidator).toContain("POSTGRES_PASSWORD")
    expect(envValidator).toContain("Neo4j/GRAPH_DUAL_READ is retired")
    expect(envValidator).toContain("OLLAMA_API_KEY")
    expect(envValidator).toContain("RUVIX_CONTROL_PLANE_SECRET")
    expect(envValidator).toContain("missing=$((missing + 1))")
    expect(envValidator).not.toContain("((missing++))")
  })

  it("does not promote candidate packaging as a verified full installation", () => {
    expect(architecture).toContain("This is a packaging candidate under AD-69, not a replacement")
    expect(readme).toContain("Status: enterprise pilot in development.")
    expect(readme).toContain("not a complete company workspace installation")
    expect(readme).toContain("not yet verified")
  })
})
