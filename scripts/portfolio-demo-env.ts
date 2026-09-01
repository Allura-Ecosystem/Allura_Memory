import { copyFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export type PortfolioEnvironmentResult = "created" | "existing"

/**
 * Creates the ignored demo environment from its checked-in non-secret example.
 * It intentionally returns status instead of environment content so callers
 * never print database credentials.
 */
export function ensurePortfolioEnvironment(projectDir = process.cwd()): PortfolioEnvironmentResult {
  const example = join(projectDir, ".env.portfolio.example")
  const target = join(projectDir, ".env.portfolio")

  if (existsSync(target)) return "existing"
  if (!existsSync(example)) {
    throw new Error("Missing .env.portfolio.example; cannot initialize the portfolio demo environment")
  }

  copyFileSync(example, target, 0)
  return "created"
}
