import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()
const review = readFileSync(join(repoRoot, "docs/archive/allura/INSTALL-DEPLOY-REVIEW.md"), "utf8")
const readme = readFileSync(join(repoRoot, "README.md"), "utf8")
const compose = readFileSync(join(repoRoot, "docker-compose.yml"), "utf8")
const envValidator = readFileSync(join(repoRoot, "scripts/validate-env.sh"), "utf8")

describe("install deploy review", () => {
  it("keeps release blocked until fresh deploy evidence exists", () => {
    expect(review).toContain("FRESH DEPLOY NOT VERIFIED")
    expect(review).toContain("does not claim a fresh deploy was")
    expect(review).toContain("fresh deploy transcript is still required")
  })

  it("documents the canonical env-file compose path", () => {
    const composePrefix = "docker compose --env-file .env --env-file .env.local"

    expect(review).toContain(`${composePrefix} build --no-cache`)
    expect(review).toContain(`${composePrefix} up -d`)
    expect(review).toContain("docker compose ps")
    expect(review).toContain("curl -f http://localhost:3100/api/health/live")
    expect(compose).toContain(composePrefix)
  })

  it("ties deploy readiness to the environment validator", () => {
    expect(review).toContain("bash scripts/validate-env.sh")
    expect(envValidator).toContain("POSTGRES_PASSWORD")
    expect(envValidator).toContain("NEO4J_PASSWORD")
    expect(envValidator).toContain("OLLAMA_API_KEY")
    expect(envValidator).toContain("RUVIX_CONTROL_PLANE_SECRET")
    expect(envValidator).toContain("missing=$((missing + 1))")
    expect(envValidator).not.toContain("((missing++))")
  })

  it("does not promote GHCR pull-deploy before verification", () => {
    expect(review).toContain("standalone pull-deploy is **not yet")
    expect(readme).toContain("not yet verified for standalone pull-deploy")
  })
})
