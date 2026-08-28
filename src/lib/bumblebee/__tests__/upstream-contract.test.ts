import { describe, expect, it } from "vitest"

import { assertSupportedScanContract, BUMBLEBEE_UPSTREAM_PIN } from "../upstream-contract"

describe("Story 26.7 upstream compatibility contract", () => {
  it("pins the reviewed upstream source and emitted schema exactly", () => {
    expect(BUMBLEBEE_UPSTREAM_PIN).toEqual({
      repository: "perplexityai/bumblebee",
      tag: "v0.1.2",
      commit: "cc57710eeaf685e7b89924a36c8583cad0a378fe",
      tree: "985f57cf1749c15561c886c4476f10950ffa9cae",
      schemaVersion: "0.1.0",
      license: "Apache-2.0",
    })
    expect(Object.isFrozen(BUMBLEBEE_UPSTREAM_PIN)).toBe(true)
  })

  it("returns an immutable reviewed inventory contract", () => {
    const validated = assertSupportedScanContract({
      schemaVersion: "0.1.0",
      profile: "baseline",
      mode: "inventory",
      findingsEnabled: false,
      ecosystems: ["homebrew"],
    })

    expect(validated).toEqual({
      schemaVersion: "0.1.0",
      profile: "baseline",
      mode: "inventory",
      findingsEnabled: false,
      ecosystems: ["homebrew"],
    })
    expect(Object.isFrozen(validated)).toBe(true)
    expect(Object.isFrozen(validated.ecosystems)).toBe(true)
  })

  it("rejects agent-skill because the pinned emitted schemas omit it", () => {
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.1.0",
        profile: "baseline",
        mode: "inventory",
        findingsEnabled: false,
        ecosystems: ["agent-skill"],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_UNSUPPORTED_ECOSYSTEM")
  })

  it("rejects homebrew when findings are enabled because the finding schema omits it", () => {
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.1.0",
        profile: "baseline",
        mode: "findings-only",
        findingsEnabled: true,
        ecosystems: ["homebrew"],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_UNSUPPORTED_ECOSYSTEM")
  })

  it("uses the finding-schema intersection when inventory mode can emit findings", () => {
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.1.0",
        profile: "baseline",
        mode: "inventory",
        findingsEnabled: true,
        ecosystems: ["homebrew"],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_UNSUPPORTED_ECOSYSTEM")
  })

  it("rejects findings-only mode without a findings-enabled catalog binding", () => {
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.1.0",
        profile: "baseline",
        mode: "findings-only",
        findingsEnabled: false,
        ecosystems: ["npm"],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_FINDINGS_NOT_ENABLED")
  })

  it("rejects an ecosystem outside the reviewed inventory allowlist", () => {
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.1.0",
        profile: "baseline",
        mode: "inventory",
        findingsEnabled: false,
        ecosystems: ["unknown-ecosystem"],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_UNSUPPORTED_ECOSYSTEM")
  })

  it("does not reflect an unsupported ecosystem into the error message", () => {
    const canary = "secret-canary\nforged-log-line"
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.1.0",
        profile: "baseline",
        mode: "inventory",
        findingsEnabled: false,
        ecosystems: [canary],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_UNSUPPORTED_ECOSYSTEM")
  })

  it("rejects a schema version other than the immutable pin", () => {
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.2.0",
        profile: "baseline",
        mode: "inventory",
        findingsEnabled: false,
        ecosystems: ["npm"],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_UNSUPPORTED_SCHEMA")
  })

  it("rejects a scan mode outside the reviewed allowlist", () => {
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.1.0",
        profile: "baseline",
        mode: "inventory-and-execute",
        findingsEnabled: false,
        ecosystems: ["npm"],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_UNSUPPORTED_MODE")
  })

  it("rejects a profile outside the pinned scanner contract", () => {
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.1.0",
        profile: "unbounded",
        mode: "inventory",
        findingsEnabled: false,
        ecosystems: ["npm"],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_UNSUPPORTED_PROFILE")
  })

  it("rejects an empty ecosystem filter before upstream can expand it to all ecosystems", () => {
    expect(() =>
      assertSupportedScanContract({
        schemaVersion: "0.1.0",
        profile: "baseline",
        mode: "inventory",
        findingsEnabled: false,
        ecosystems: [],
      })
    ).toThrowError("BUMBLEBEE_CONTRACT_EMPTY_ECOSYSTEMS")
  })
})
