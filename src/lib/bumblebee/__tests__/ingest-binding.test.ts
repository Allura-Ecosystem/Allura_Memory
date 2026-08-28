import { describe, expect, it } from "vitest"

import { assertIngestPopulationBinding, type IngestPopulationBindingInput } from "../ingest-decision"

const base: IngestPopulationBindingInput = {
  lease: {
    profile: "baseline",
    mode: "inventory",
    endpointDeviceId: "device-1",
    ecosystems: ["npm", "pypi"],
    catalogRevisionId: "catalog-1",
  },
  run: {
    runId: "0123456789abcdef0123456789abcdef",
    profile: "baseline",
    deviceId: "device-1",
    ecosystems: ["npm"],
    hasFindings: true,
  },
  existingRunId: null,
}

describe("Story 26.7 source/lease population binding", () => {
  it("accepts only a run exactly inside the server-bound population", () => {
    expect(() => assertIngestPopulationBinding(base)).not.toThrow()
    expect(() => assertIngestPopulationBinding({ ...base, existingRunId: base.run.runId })).not.toThrow()
  })

  it.each([
    { run: { ...base.run, profile: "project" } },
    { run: { ...base.run, deviceId: "forged-device" } },
    { run: { ...base.run, ecosystems: ["go"] } },
    { run: { ...base.run, hasFindings: true }, lease: { ...base.lease, catalogRevisionId: null } },
    { existingRunId: "abcdefabcdefabcdefabcdefabcdefab" },
  ])("rejects forged, unbound, or mixed-run input without reflecting it: %#", (override) => {
    const input = {
      ...base,
      ...override,
      lease: { ...base.lease, ...override.lease },
      run: { ...base.run, ...override.run },
    } as IngestPopulationBindingInput
    expect(() => assertIngestPopulationBinding(input)).toThrow("BUMBLEBEE_INGEST_RECORD_CONFLICT")
  })
})
