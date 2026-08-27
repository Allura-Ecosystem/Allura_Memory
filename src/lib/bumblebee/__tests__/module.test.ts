/**
 * Story 26.7 AC-3/AC-6 — module fail-closed behaviour and rollback.
 */

import { afterEach, describe, expect, it } from "vitest"
import {
  assertCapabilities,
  assertCompatible,
  BUMBLEBEE_ENABLED_ENV_VAR,
  BUMBLEBEE_MODULE,
  BUMBLEBEE_REQUIRED_CAPABILITIES,
  isBumblebeeEnabled,
} from "../module"

describe("Story 26.7 AC-6 — rollback via feature flag", () => {
  afterEach(() => {
    delete process.env[BUMBLEBEE_ENABLED_ENV_VAR]
  })

  it("is disabled by default", () => {
    expect(isBumblebeeEnabled()).toBe(false)
  })

  it("enables only on the exact string 'true'", () => {
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"
    expect(isBumblebeeEnabled()).toBe(true)

    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "1"
    expect(isBumblebeeEnabled()).toBe(false)

    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "TRUE"
    expect(isBumblebeeEnabled()).toBe(false)
  })

  it("is read fresh, so a flag flip takes effect without a restart of this module", () => {
    expect(isBumblebeeEnabled()).toBe(false)
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"
    expect(isBumblebeeEnabled()).toBe(true)
  })
})

describe("Story 26.7 AC-3 — fail closed on capabilities", () => {
  it("accepts a host granting every required capability", () => {
    expect(() => assertCapabilities([...BUMBLEBEE_REQUIRED_CAPABILITIES])).not.toThrow()
  })

  it("rejects a host missing any capability, naming what is missing", () => {
    expect(() => assertCapabilities(["read:inventory"])).toThrow(/read:exposures/)
  })

  it("rejects a host granting nothing", () => {
    expect(() => assertCapabilities([])).toThrow(/capabilities not granted/i)
  })

  it("does not accept an unrelated capability as a substitute", () => {
    expect(() => assertCapabilities(["write:everything", "admin:all"])).toThrow()
  })
})

describe("Story 26.7 AC-3 — fail closed on compatibility", () => {
  it("accepts its own descriptor", () => {
    expect(() => assertCompatible(BUMBLEBEE_MODULE)).not.toThrow()
  })

  it("accepts a compatible minor/patch version", () => {
    expect(() => assertCompatible({ id: "bumblebee", version: "1.4.2" })).not.toThrow()
  })

  it("rejects an unknown module id", () => {
    expect(() => assertCompatible({ id: "not-bumblebee", version: "1.0.0" })).toThrow(/unknown module id/i)
  })

  it("rejects an incompatible major version", () => {
    expect(() => assertCompatible({ id: "bumblebee", version: "2.0.0" })).toThrow(/incompatible/i)
  })
})

describe("Story 26.7 AC-6 — rollback leaves the rest of the system intact", () => {
  it("is imported by nothing except its own route", async () => {
    // The rollback guarantee is structural, not behavioural: disabling
    // Bumblebee can only be safe if nothing else depends on it. A grep run
    // once by hand proves that today; this test keeps it true tomorrow.
    const { execSync } = await import("node:child_process")
    const output = execSync(
      "grep -rl 'lib/bumblebee\\|components/bumblebee' src --include=*.ts --include=*.tsx || true",
      { encoding: "utf8" },
    )

    const foreign = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(
        (file) =>
          !file.startsWith("src/lib/bumblebee/") &&
          !file.startsWith("src/components/bumblebee/") &&
          !file.startsWith("src/__tests__/") &&
          file !== "src/app/dashboard/bumblebee/page.tsx",
      )

    expect(foreign).toEqual([])
  })
})

describe("Story 26.7 — module descriptor", () => {
  it("declares exactly the five surfaces the story requires", () => {
    expect([...BUMBLEBEE_MODULE.surfaces]).toEqual([
      "sources",
      "exposures",
      "policy-drafts",
      "incidents",
      "receipts",
    ])
  })

  it("declares itself read-only and requests no write capability", () => {
    expect(BUMBLEBEE_MODULE.readOnly).toBe(true)
    for (const capability of BUMBLEBEE_MODULE.requiredCapabilities) {
      expect(capability.startsWith("read:")).toBe(true)
    }
  })
})
