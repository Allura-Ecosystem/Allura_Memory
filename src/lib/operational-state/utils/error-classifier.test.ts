/**
 * Error Classifier — Unit Tests
 *
 * Usage: bun vitest run src/lib/operational-state/utils/error-classifier.test.ts
 */

import { describe, expect, it } from "vitest"
import { isConnectionError } from "./error-classifier"

describe("isConnectionError", () => {
  // ── True cases: connection-level failures ─────────────────────────────────

  it("returns true for ECONNREFUSED (OS: TCP refused)", () => {
    expect(isConnectionError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(true)
  })

  it("returns true for connection refused (human-readable form)", () => {
    expect(isConnectionError(new Error("connection refused to postgres server"))).toBe(true)
  })

  it("returns true for password authentication failure", () => {
    expect(isConnectionError(new Error("password authentication failed for user \"postgres\""))).toBe(
      true,
    )
  })

  it("returns true for 'authentication' keyword", () => {
    expect(isConnectionError(new Error("authentication failed"))).toBe(true)
  })

  it("returns true for getaddrinfo (DNS failure)", () => {
    expect(isConnectionError(new Error("getaddrinfo ENOTFOUND db.example.com"))).toBe(true)
  })

  it("returns true for ENOTFOUND (DNS name not found)", () => {
    expect(isConnectionError(new Error("ENOTFOUND db.internal"))).toBe(true)
  })

  it("returns true for ETIMEDOUT (TCP connect timeout)", () => {
    expect(isConnectionError(new Error("connect ETIMEDOUT 10.0.0.5:5432"))).toBe(true)
  })

  it("returns true for 'terminated unexpectedly' (pg: server crashed)", () => {
    expect(
      isConnectionError(new Error("server process (PID 1234) was terminated unexpectedly")),
    ).toBe(true)
  })

  it("returns true for 'pool is destroyed' (pg-pool shutdown)", () => {
    expect(isConnectionError(new Error("pool is destroyed"))).toBe(true)
  })

  it("returns true for 'Client was closed' (pg: client closed mid-query)", () => {
    expect(isConnectionError(new Error("Client was closed and is not queryable"))).toBe(true)
  })

  it("returns true for 'Connection terminated' (pg: connection terminated)", () => {
    expect(isConnectionError(new Error("Connection terminated unexpectedly"))).toBe(true)
  })

  it("handles non-Error objects by converting to string", () => {
    expect(isConnectionError("ECONNREFUSED")).toBe(true)
    expect(isConnectionError({ message: "ECONNREFUSED" })).toBe(false) // plain object toString
  })

  // ── False cases: legitimate query failures, not connection errors ─────────

  it("returns false for 'no rows returned' (query result, not connection failure)", () => {
    expect(isConnectionError(new Error("no rows returned"))).toBe(false)
  })

  it("returns false for missing relation (table does not exist)", () => {
    expect(
      isConnectionError(new Error('relation "canonical_proposals" does not exist')),
    ).toBe(false)
  })

  it("returns false for constraint violation", () => {
    expect(
      isConnectionError(
        new Error("duplicate key value violates unique constraint \"events_pkey\""),
      ),
    ).toBe(false)
  })

  it("returns false for syntax error in query", () => {
    expect(isConnectionError(new Error("syntax error at or near \"SELEKT\""))).toBe(false)
  })

  it("returns false for column does not exist", () => {
    expect(isConnectionError(new Error('column "nonexistent_col" does not exist'))).toBe(false)
  })

  it("returns false for generic 'connection pool' in a non-specific context (original over-broad token)", () => {
    // The word 'pool' alone in a non-specific message (e.g. "connection pool") must NOT trigger
    expect(isConnectionError(new Error("fetched from connection pool cache"))).toBe(false)
  })

  it("returns false for a message containing 'connection' without 'refused'", () => {
    // 'connection' alone must NOT trigger — only 'connection refused' should
    expect(isConnectionError(new Error("lost connection during query execution"))).toBe(false)
  })

  it("returns false for a message containing 'terminated' without 'unexpectedly'", () => {
    // 'terminated' alone must NOT trigger — only 'terminated unexpectedly' should
    expect(isConnectionError(new Error("transaction was terminated"))).toBe(false)
  })

  it("returns false for permission denied (query-level auth, not connection auth)", () => {
    expect(
      isConnectionError(new Error("permission denied for table events")),
    ).toBe(false)
  })
})
