/**
 * Story 26.4 Slice B — hardened outbound fetch boundary.
 *
 * Mocks global fetch so these are pure unit tests (no live network calls in
 * the test suite itself; real shapes were confirmed manually against the
 * actual APIs during development, per the story's Implementation Status).
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { assertSafeIdentifier, safeFetchJson, SafeFetchError, ALLOWED_HOSTS } from "../safe-fetch"

const originalFetch = global.fetch

function mockJsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const text = JSON.stringify(body)
  const encoder = new TextEncoder()
  const bytes = encoder.encode(text)
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    statusText: init.status && init.status >= 400 ? "Error" : "OK",
    headers: new Headers(init.headers ?? {}),
    body: {
      getReader: () => {
        let sent = false
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined }
            sent = true
            return { done: false, value: bytes }
          },
          cancel: async () => {},
        }
      },
    },
  } as unknown as Response
}

describe("Story 26.4 Slice B — safeFetchJson", () => {
  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("rejects a host not on the allowlist", async () => {
    await expect(safeFetchJson("https://evil.example.com/steal")).rejects.toThrow(SafeFetchError)
    await expect(safeFetchJson("https://evil.example.com/steal")).rejects.toThrow(/allowlist/i)
  })

  it("rejects a non-https URL even for an allowlisted host", async () => {
    await expect(safeFetchJson(`http://${ALLOWED_HOSTS[0]}/`)).rejects.toThrow(/https/i)
  })

  it("rejects a malformed URL", async () => {
    await expect(safeFetchJson("not a url")).rejects.toThrow(SafeFetchError)
  })

  it("returns parsed JSON for an allowlisted host with a clean 2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({ hello: "world" })) as unknown as typeof fetch
    const result = await safeFetchJson(`https://${ALLOWED_HOSTS[0]}/v1/query`)
    expect(result).toEqual({ hello: "world" })
  })

  it("rejects a non-2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({ error: "rate limited" }, { status: 429 })) as unknown as typeof fetch
    await expect(safeFetchJson(`https://${ALLOWED_HOSTS[0]}/v1/query`)).rejects.toThrow(/429/)
  })

  it("rejects a response declaring a content-length over the size cap", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockJsonResponse({ ok: true }, { headers: { "content-length": String(10 * 1024 * 1024) } }),
    ) as unknown as typeof fetch
    await expect(safeFetchJson(`https://${ALLOWED_HOSTS[0]}/v1/query`)).rejects.toThrow(/exceeds/i)
  })

  it("rejects a response with no readable body", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), body: null } as unknown as Response) as unknown as typeof fetch
    await expect(safeFetchJson(`https://${ALLOWED_HOSTS[0]}/v1/query`)).rejects.toThrow(/no readable body/i)
  })

  it("rejects a response body that is not valid JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: {
        getReader: () => {
          let sent = false
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined }
              sent = true
              return { done: false, value: new TextEncoder().encode("<html>not json</html>") }
            },
            cancel: async () => {},
          }
        },
      },
    } as unknown as Response) as unknown as typeof fetch
    await expect(safeFetchJson(`https://${ALLOWED_HOSTS[0]}/v1/query`)).rejects.toThrow(/valid JSON/i)
  })

  it("times out a hanging request", async () => {
    global.fetch = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("aborted")
            err.name = "AbortError"
            reject(err)
          })
        }),
    ) as unknown as typeof fetch
    await expect(safeFetchJson(`https://${ALLOWED_HOSTS[0]}/v1/query`, { timeoutMs: 10 })).rejects.toThrow(/did not respond within/i)
  })
})

describe("Story 26.4 Slice B — assertSafeIdentifier", () => {
  it("accepts a plausible package name", () => {
    expect(assertSafeIdentifier("lodash", "package name")).toBe("lodash")
    expect(assertSafeIdentifier("@scope/pkg-name", "package name")).toBe("@scope/pkg-name")
  })

  it("rejects an empty string", () => {
    expect(() => assertSafeIdentifier("", "package name")).toThrow(SafeFetchError)
  })

  it("rejects a value over 256 characters", () => {
    expect(() => assertSafeIdentifier("a".repeat(300), "package name")).toThrow(SafeFetchError)
  })

  it("rejects characters that could inject into a URL or header", () => {
    expect(() => assertSafeIdentifier("lodash\r\nX-Injected: true", "package name")).toThrow(SafeFetchError)
    expect(() => assertSafeIdentifier("lodash; rm -rf /", "package name")).toThrow(SafeFetchError)
  })
})
