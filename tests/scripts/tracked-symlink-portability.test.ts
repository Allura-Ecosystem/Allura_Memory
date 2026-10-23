import { lstat, readlink, realpath } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..")
const ASSET_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  ".opencode/skills/skill-creator/ai-guidelines-docs/assets",
)
const CANONICAL_TEMPLATE_DIRECTORY = path.join(REPOSITORY_ROOT, ".opencode/templates")
const TEMPLATE_NAMES = [
  "BLUEPRINT.template.md",
  "DATA-DICTIONARY.template.md",
  "DESIGN.template.md",
  "REQUIREMENTS-MATRIX.template.md",
  "RISKS-AND-DECISIONS.template.md",
  "SOLUTION-ARCHITECTURE.template.md",
] as const

describe("tracked documentation template symlinks", () => {
  for (const templateName of TEMPLATE_NAMES) {
    it(`${templateName} resolves portably to the canonical repository template`, async () => {
      const linkPath = path.join(ASSET_DIRECTORY, templateName)
      const expectedTarget = path.relative(ASSET_DIRECTORY, path.join(CANONICAL_TEMPLATE_DIRECTORY, templateName))

      expect((await lstat(linkPath)).isSymbolicLink()).toBe(true)
      expect(path.isAbsolute(await readlink(linkPath))).toBe(false)
      expect(await readlink(linkPath)).toBe(expectedTarget)
      expect(await realpath(linkPath)).toBe(await realpath(path.join(CANONICAL_TEMPLATE_DIRECTORY, templateName)))
    })
  }
})

// These optional, host-specific AionUI dependencies have no approved source
// targets. The owner authorized their retirement with recoverable link copies.
describe("retired unavailable AionUI integrations", () => {
  for (const skillName of ["aionui-skills", "cron", "office-cli"] as const) {
    it(`${skillName} is absent rather than a dangling symlink`, async () => {
      await expect(
        lstat(path.join(REPOSITORY_ROOT, ".opencode/skills", skillName)),
      ).rejects.toMatchObject({ code: "ENOENT" })
    })
  }
})
