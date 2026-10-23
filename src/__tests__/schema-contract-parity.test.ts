import { readFileSync } from "node:fs"
import { join } from "node:path"
import Ajv from "ajv"
import { types } from "pg"
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

// PostgreSQL text-protocol OIDs used by node-postgres for the physical column types.
const INT8 = 20
const TIMESTAMPTZ = 1184
const NUMERIC = 1700

function parsePgText(oid: number, value: string | null) {
  return value === null ? null : types.getTypeParser(oid, "text")(value)
}

function jsonWireRow(row: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>
}

const completeEventRow = jsonWireRow({
  id: parsePgText(INT8, "9223372036854775807"),
  group_id: "allura-system",
  workspace_id: null,
  event_type: "DEVICE_ENROLL_REQUESTED",
  agent_id: "device-enrollment",
  workflow_id: null,
  step_id: null,
  parent_event_id: null,
  metadata: null,
  outcome: null,
  status: "completed",
  error_message: null,
  error_code: null,
  inserted_at: parsePgText(TIMESTAMPTZ, "2026-10-23 10:00:00.000+00"),
  evidence_ref: null,
  confidence: null,
  runtime: null,
  session_id: null,
  schema_version: 1,
  created_at: parsePgText(TIMESTAMPTZ, "2026-10-23 10:00:00.000+00"),
})

const completeProposalRow = jsonWireRow({
  id: "0f9d81ac-23f1-4a6f-8f31-e8488121e1d2",
  group_id: "allura-system",
  workspace_id: "workspace-a",
  proposal_version: parsePgText(INT8, "9223372036854775807"),
  approved_memory_id: null,
  content: "Keep approval evidence append-only.",
  score: parsePgText(NUMERIC, "0.910"),
  reasoning: null,
  tier: "mainstream",
  status: "pending",
  trace_ref: null,
  created_at: parsePgText(TIMESTAMPTZ, "2026-10-23 10:00:00.000+00"),
  decided_at: null,
  decided_by: null,
  rationale: null,
  witness_hash: null,
  notion_page_id: null,
  notion_synced_at: null,
})

describe("complete committed PostgreSQL-row JSON serialization contracts", () => {
  it("feeds every event column through actual pg parsers and JSON serialization into AJV", () => {
    const validate = validator("event.schema.json")
    const rowWithDriverScalars = {
      ...completeEventRow,
      parent_event_id: parsePgText(INT8, "9007199254740993"),
      confidence: parsePgText(NUMERIC, "0.875"),
    }

    expect(typeof completeEventRow.id).toBe("string")
    expect(typeof rowWithDriverScalars.parent_event_id).toBe("string")
    expect(typeof rowWithDriverScalars.confidence).toBe("string")
    expect(completeEventRow.created_at).toBe("2026-10-23T10:00:00.000Z")
    expect(validate(completeEventRow), JSON.stringify(validate.errors)).toBe(true)
    expect(validate(rowWithDriverScalars), JSON.stringify(validate.errors)).toBe(true)
    expect(validate({ ...completeEventRow, workspace_id: "workspace-a" }), JSON.stringify(validate.errors)).toBe(true)
  })

  it("feeds every proposal column through actual pg parsers and JSON serialization into AJV", () => {
    const validate = validator("canonical_proposals.schema.json")
    const rowWithTrace = {
      ...completeProposalRow,
      trace_ref: parsePgText(INT8, "9007199254740993"),
    }

    expect(typeof completeProposalRow.proposal_version).toBe("string")
    expect(typeof rowWithTrace.trace_ref).toBe("string")
    expect(typeof completeProposalRow.score).toBe("string")
    expect(completeProposalRow.created_at).toBe("2026-10-23T10:00:00.000Z")
    expect(validate(completeProposalRow), JSON.stringify(validate.errors)).toBe(true)
    expect(validate(rowWithTrace), JSON.stringify(validate.errors)).toBe(true)
    expect(validate({ ...completeProposalRow, workspace_id: null }), JSON.stringify(validate.errors)).toBe(true)
    expect(
      validate({ ...completeProposalRow, approved_memory_id: "57ad0fbb-8bdb-46af-94d7-9de3e2d6e21a" }),
      JSON.stringify(validate.errors),
    ).toBe(true)
  })

  it("requires every physical event column from an otherwise valid complete row", () => {
    const validate = validator("event.schema.json")

    expect(validate(completeEventRow), JSON.stringify(validate.errors)).toBe(true)
    for (const field of Object.keys(completeEventRow)) {
      const row = { ...completeEventRow }
      delete row[field]
      expect(validate(row), `event.${field} was not required`).toBe(false)
    }
  })

  it("requires every physical proposal column from an otherwise valid complete row", () => {
    const validate = validator("canonical_proposals.schema.json")

    expect(validate(completeProposalRow), JSON.stringify(validate.errors)).toBe(true)
    for (const field of Object.keys(completeProposalRow)) {
      const row = { ...completeProposalRow }
      delete row[field]
      expect(validate(row), `canonical_proposals.${field} was not required`).toBe(false)
    }
  })

  it("retains workspace quarantine and precision-safe application invariants", () => {
    const validateEvent = validator("event.schema.json")
    const validateProposal = validator("canonical_proposals.schema.json")

    expect(validateEvent({ ...completeEventRow, workspace_id: "" })).toBe(false)
    expect(validateEvent({ ...completeEventRow, id: 9007199254740992 })).toBe(false)
    expect(validateEvent({ ...completeEventRow, group_id: "allura-system-" })).toBe(false)
    expect(validateProposal({ ...completeProposalRow, workspace_id: "" })).toBe(false)
    expect(validateProposal({ ...completeProposalRow, score: 0.91 })).toBe(false)
    expect(validateProposal({ ...completeProposalRow, proposal_version: 1 })).toBe(false)
    expect(validateProposal({ ...completeProposalRow, proposal_version: "0" })).toBe(false)
    expect(validateProposal({ ...completeProposalRow, approved_memory_id: "not-a-uuid" })).toBe(false)
  })
})
