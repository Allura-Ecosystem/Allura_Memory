import { readFileSync } from "node:fs"
import { join } from "node:path"
import Ajv from "ajv"
import { describe, expect, it } from "vitest"

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  formats: {
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "date-time": true,
  },
})

function validator(file: string) {
  const schema = JSON.parse(readFileSync(join(process.cwd(), "json-schema", file), "utf8"))
  return ajv.getSchema(schema.$id) ?? ajv.compile(schema)
}

const eventRow = {
  id: 41,
  group_id: "allura-system",
  event_type: "proposal_created",
  agent_id: "curator",
  status: "completed",
  created_at: "2026-10-23T10:00:00.000Z",
}

const proposalRow = {
  id: "0f9d81ac-23f1-4a6f-8f31-e8488121e1d2",
  group_id: "allura-system",
  content: "Keep approval evidence append-only.",
  score: 0.91,
  tier: "mainstream",
  status: "pending",
  created_at: "2026-10-23T10:00:00.000Z",
}

describe("committed migration 38-40 stored-row JSON contracts", () => {
  it("represents both quarantined legacy events and workspace-scoped events without accepting an omitted workspace column", () => {
    const validate = validator("event.schema.json")

    expect(validate({ ...eventRow, workspace_id: null }), JSON.stringify(validate.errors)).toBe(true)
    expect(validate({ ...eventRow, workspace_id: "workspace-a" }), JSON.stringify(validate.errors)).toBe(true)
    expect(validate(eventRow)).toBe(false)
    expect(validate({ ...eventRow, workspace_id: 7 })).toBe(false)
  })

  it("represents proposal workspace quarantine, decimal-string versions, and nullable approved memory UUIDs", () => {
    const validate = validator("canonical_proposals.schema.json")
    const currentRow = {
      ...proposalRow,
      workspace_id: "workspace-a",
      proposal_version: "1",
      approved_memory_id: null,
    }

    expect(validate(currentRow), JSON.stringify(validate.errors)).toBe(true)
    expect(validate({ ...currentRow, workspace_id: null }), JSON.stringify(validate.errors)).toBe(true)
    expect(validate({ ...currentRow, proposal_version: 1 })).toBe(false)
    expect(validate({ ...currentRow, proposal_version: "0" })).toBe(false)
    expect(validate({ ...currentRow, approved_memory_id: "not-a-uuid" })).toBe(false)
    expect(
      validate({ ...currentRow, approved_memory_id: "57ad0fbb-8bdb-46af-94d7-9de3e2d6e21a" }),
      JSON.stringify(validate.errors)
    ).toBe(true)
  })

  it("keeps physical non-null and migration-added proposal columns required", () => {
    const validate = validator("canonical_proposals.schema.json")

    expect(validate(proposalRow)).toBe(false)
    expect(validate({ ...proposalRow, tier: undefined })).toBe(false)
  })
})
