/**
 * @allura/sdk — Unit Tests
 * Story 12.3: Validates AlluraClient, MemoryClient, validation, and error handling.
 *
 * Uses vi.stubGlobal to mock fetch — no real network calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { AlluraClient, AlluraSDKError, MemoryClient } from "./index"
import { validateGroupId, requireField } from "./validation"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetch(response: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
  }) as unknown as typeof fetch
}

function makeErrorFetch(status: number, errorMessage: string): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: errorMessage }),
  }) as unknown as typeof fetch
}

const VALID_CONFIG = {
  baseUrl: "http://localhost:3100",
  groupId: "allura-system",
  apiKey: "test-key",
}

// ── validateGroupId ────────────────────────────────────────────────────────────

describe("validateGroupId", () => {
  it("accepts valid group_ids", () => {
    expect(() => validateGroupId("allura-system")).not.toThrow()
    expect(() => validateGroupId("allura-my-project")).not.toThrow()
    expect(() => validateGroupId("allura-abc123")).not.toThrow()
    expect(() => validateGroupId("allura-a")).not.toThrow()
    expect(() => validateGroupId("allura-project-v2")).not.toThrow()
  })

  it("rejects invalid group_ids with AlluraSDKError", () => {
    const invalid = [
      "roninclaw-system",  // deprecated prefix
      "allura-",           // trailing dash only
      "ALLURA-system",     // uppercase
      "allura",            // no suffix
      "system",            // no prefix
      "",                  // empty
      "allura--double",    // double dash
    ]

    for (const id of invalid) {
      expect(() => validateGroupId(id)).toThrow(AlluraSDKError)
    }
  })

  it("throws with INVALID_GROUP_ID code", () => {
    try {
      validateGroupId("roninclaw-system")
      expect.fail("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(AlluraSDKError)
      expect((err as AlluraSDKError).code).toBe("INVALID_GROUP_ID")
      expect((err as AlluraSDKError).status).toBe(400)
    }
  })
})

// ── requireField ──────────────────────────────────────────────────────────────

describe("requireField", () => {
  it("returns the value when non-empty", () => {
    expect(requireField("hello", "field")).toBe("hello")
  })

  it("throws on empty string", () => {
    expect(() => requireField("", "content")).toThrow(AlluraSDKError)
  })

  it("throws on whitespace-only string", () => {
    expect(() => requireField("   ", "content")).toThrow(AlluraSDKError)
  })

  it("throws on undefined", () => {
    expect(() => requireField(undefined, "userId")).toThrow(AlluraSDKError)
  })

  it("throws with MISSING_REQUIRED_FIELD code", () => {
    try {
      requireField("", "userId")
      expect.fail("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(AlluraSDKError)
      expect((err as AlluraSDKError).code).toBe("MISSING_REQUIRED_FIELD")
    }
  })
})

// ── AlluraSDKError ────────────────────────────────────────────────────────────

describe("AlluraSDKError", () => {
  it("is an instanceof Error", () => {
    const err = new AlluraSDKError("test", 400, "TEST_CODE")
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AlluraSDKError)
  })

  it("has correct name and properties", () => {
    const err = new AlluraSDKError("test message", 500, "SOME_CODE")
    expect(err.name).toBe("AlluraSDKError")
    expect(err.message).toBe("test message")
    expect(err.status).toBe(500)
    expect(err.code).toBe("SOME_CODE")
  })

  it("works without code", () => {
    const err = new AlluraSDKError("oops", 503)
    expect(err.code).toBeUndefined()
    expect(err.status).toBe(503)
  })
})

// ── AlluraClient ──────────────────────────────────────────────────────────────

describe("AlluraClient", () => {
  it("constructs with valid config", () => {
    expect(() => new AlluraClient(VALID_CONFIG)).not.toThrow()
  })

  it("throws on invalid group_id at construction", () => {
    expect(
      () => new AlluraClient({ ...VALID_CONFIG, groupId: "roninclaw-system" }),
    ).toThrow(AlluraSDKError)
  })

  it("exposes memory and process clients", () => {
    const client = new AlluraClient(VALID_CONFIG)
    expect(client.memory).toBeDefined()
    expect(client.process).toBeDefined()
  })
})

// ── MemoryClient ──────────────────────────────────────────────────────────────

describe("MemoryClient", () => {
  let fetcher: ReturnType<typeof vi.fn>
  let client: MemoryClient

  beforeEach(() => {
    fetcher = vi.fn()
    client = new MemoryClient(VALID_CONFIG, fetcher as unknown as typeof fetch)
  })

  // ── add ───────────────────────────────────────────────────────────────────

  describe("add", () => {
    it("posts to /api/memory with correct body", async () => {
      const mockResponse = {
        id: "mem-123",
        content: "Test content",
        user_id: "woz-builder",
        group_id: "allura-system",
        created_at: "2026-06-11T00:00:00Z",
      }
      fetcher.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.add({ content: "Test content", userId: "woz-builder" })

      expect(fetcher).toHaveBeenCalledWith(
        "http://localhost:3100/api/memory",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-allura-group-id": "allura-system",
            "Authorization": "Bearer test-key",
          }),
          body: JSON.stringify({
            group_id: "allura-system",
            user_id: "woz-builder",
            content: "Test content",
            metadata: undefined,
          }),
        }),
      )

      expect(result.id).toBe("mem-123")
      expect(result.content).toBe("Test content")
      expect(result.userId).toBe("woz-builder")
      expect(result.groupId).toBe("allura-system")
    })

    it("throws AlluraSDKError when content is empty", async () => {
      await expect(
        client.add({ content: "", userId: "woz-builder" }),
      ).rejects.toBeInstanceOf(AlluraSDKError)
    })

    it("throws AlluraSDKError when userId is empty", async () => {
      await expect(
        client.add({ content: "Test", userId: "" }),
      ).rejects.toBeInstanceOf(AlluraSDKError)
    })

    it("throws AlluraSDKError on HTTP 400", async () => {
      fetcher.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid group_id" }),
      })

      await expect(
        client.add({ content: "Test", userId: "woz" }),
      ).rejects.toMatchObject({ status: 400, code: "HTTP_400" })
    })

    it("throws AlluraSDKError on HTTP 503", async () => {
      fetcher.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: "Service unavailable" }),
      })

      await expect(
        client.add({ content: "Test", userId: "woz" }),
      ).rejects.toMatchObject({ status: 503 })
    })

    it("forwards metadata in the request body", async () => {
      const metadata = { source: "test", tags: ["story-12-3"] }
      fetcher.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "mem-456", content: "Test", user_id: "woz", group_id: "allura-system", created_at: "2026-06-11T00:00:00Z", metadata }),
      })

      const result = await client.add({ content: "Test", userId: "woz", metadata })

      const callBody = JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string)
      expect(callBody.metadata).toEqual(metadata)
      expect(result.metadata).toEqual(metadata)
    })
  })

  // ── search ────────────────────────────────────────────────────────────────

  describe("search", () => {
    it("sends GET to /api/memory with query params", async () => {
      fetcher.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ memories: [] }),
      })

      await client.search({ query: "process engine" })

      const url: string = fetcher.mock.calls[0]![0] as string
      expect(url).toContain("/api/memory?")
      expect(url).toContain("query=process+engine")
      expect(url).toContain("group_id=allura-system")
    })

    it("returns normalized MemoryResult array", async () => {
      fetcher.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          memories: [
            {
              id: "mem-1",
              content: "Match 1",
              user_id: "woz",
              group_id: "allura-system",
              score: 0.9,
              source: "ruvector",
              created_at: "2026-06-11T00:00:00Z",
            },
          ],
        }),
      })

      const results = await client.search({ query: "match" })

      expect(results).toHaveLength(1)
      expect(results[0]!.id).toBe("mem-1")
      expect(results[0]!.score).toBe(0.9)
      expect(results[0]!.userId).toBe("woz")
    })

    it("handles flat array response shape", async () => {
      fetcher.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { id: "mem-2", content: "Flat array", user_id: "woz", group_id: "allura-system", created_at: "2026-06-11T00:00:00Z" },
        ],
      })

      const results = await client.search({ query: "flat" })
      expect(results).toHaveLength(1)
      expect(results[0]!.id).toBe("mem-2")
    })

    it("throws when query is empty", async () => {
      await expect(client.search({ query: "" })).rejects.toBeInstanceOf(AlluraSDKError)
    })
  })

  // ── get ───────────────────────────────────────────────────────────────────

  describe("get", () => {
    it("returns null on 404", async () => {
      fetcher.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "not found" }),
      })

      const result = await client.get("nonexistent-id")
      expect(result).toBeNull()
    })

    it("returns MemoryResult on success", async () => {
      fetcher.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "mem-789",
          content: "Found memory",
          user_id: "woz",
          group_id: "allura-system",
          created_at: "2026-06-11T00:00:00Z",
        }),
      })

      const result = await client.get("mem-789")
      expect(result).not.toBeNull()
      expect(result!.id).toBe("mem-789")
    })

    it("throws on empty id", async () => {
      await expect(client.get("")).rejects.toBeInstanceOf(AlluraSDKError)
    })

    it("re-throws non-404 errors", async () => {
      fetcher.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "internal" }),
      })

      await expect(client.get("mem-123")).rejects.toMatchObject({ status: 500 })
    })
  })

  // ── list ──────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("sends GET with user_id and pagination params", async () => {
      fetcher.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ memories: [] }),
      })

      await client.list({ userId: "woz-builder", limit: 10, offset: 20 })

      const url: string = fetcher.mock.calls[0]![0] as string
      expect(url).toContain("user_id=woz-builder")
      expect(url).toContain("limit=10")
      expect(url).toContain("offset=20")
    })

    it("throws when userId is empty", async () => {
      await expect(client.list({ userId: "" })).rejects.toBeInstanceOf(AlluraSDKError)
    })
  })

  // ── delete ────────────────────────────────────────────────────────────────

  describe("delete", () => {
    it("sends DELETE and returns { deleted: true }", async () => {
      fetcher.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      })

      const result = await client.delete("mem-to-delete")
      expect(result).toEqual({ deleted: true })

      const [url, init] = fetcher.mock.calls[0]! as [string, RequestInit]
      expect((init as RequestInit).method).toBe("DELETE")
      expect(url).toContain("mem-to-delete")
    })

    it("throws on empty id", async () => {
      await expect(client.delete("")).rejects.toBeInstanceOf(AlluraSDKError)
    })
  })

  // ── timeout ───────────────────────────────────────────────────────────────

  describe("timeout handling", () => {
    it("throws AlluraSDKError with REQUEST_TIMEOUT on abort", async () => {
      fetcher.mockImplementation(
        (_url: unknown, options: { signal?: AbortSignal }) =>
          new Promise<never>((_resolve, reject) => {
            const signal = options?.signal
            if (signal) {
              signal.addEventListener("abort", () => {
                const err = new Error("The operation was aborted")
                err.name = "AbortError"
                reject(err)
              })
            }
          }),
      )

      const shortTimeoutClient = new MemoryClient(
        { ...VALID_CONFIG, timeout: 1 },
        fetcher as unknown as typeof fetch,
      )

      await expect(
        shortTimeoutClient.add({ content: "Test", userId: "woz" }),
      ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" })
    })
  })
})
