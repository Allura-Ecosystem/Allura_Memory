/**
 * Minimal MCP client for the Allura Brain Streamable-HTTP gateway.
 *
 * Mirrors the transport handling in `src/lib/brain-client.ts` (session init,
 * SSE framing, JSON-RPC envelope) but is intentionally standalone so the
 * benchmark harness has no compile-time coupling to application code, can call
 * ANY tool (not just the read subset brain-client exposes), and can capture
 * tool-level errors without throwing.
 *
 * Every call is wall-clock timed at the fetch boundary so latency numbers
 * reflect what a real client would observe over the wire.
 */

const DEFAULT_URL = "http://localhost:5888/mcp"

/** Resolve the gateway URL from env, falling back to the canonical local port. */
export function resolveBrainUrl(): string {
  return process.env.BENCHMARK_BRAIN_URL ?? process.env.ALLURA_BRAIN_URL ?? DEFAULT_URL
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0"
  id: number
  result?: { content?: Array<{ type: string; text: string }>; isError?: boolean }
  error?: { code: number; message: string }
}

/** Result of a tool call that may have failed at the tool layer (not transport). */
export interface ToolCallResult<T> {
  /** True when the tool executed without an `isError`/`error` payload. */
  ok: boolean
  /** Parsed tool payload (present on success, and on tool errors that return JSON). */
  data?: T
  /** Error message when the tool reported a failure. */
  error?: string
  /** Round-trip wall-clock latency in milliseconds. */
  latencyMs: number
}

export class BrainClient {
  private readonly url: string
  private readonly timeoutMs: number
  private sessionId: string | null = null
  private requestId = 0

  constructor(opts?: { url?: string; timeoutMs?: number }) {
    this.url = opts?.url ?? resolveBrainUrl()
    this.timeoutMs = opts?.timeoutMs ?? 15_000
  }

  get endpoint(): string {
    return this.url
  }

  private nextId(): number {
    return ++this.requestId
  }

  private async fetchWithTimeout(body: unknown): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      }
      const authToken = process.env.BENCHMARK_AUTH_TOKEN
      if (authToken) headers.Authorization = `Bearer ${authToken}`
      if (this.sessionId) headers["mcp-session-id"] = this.sessionId
      return await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  /** Establish (and cache) an MCP session. Idempotent. */
  async init(): Promise<void> {
    if (this.sessionId) return
    const res = await this.fetchWithTimeout({
      jsonrpc: "2.0",
      id: this.nextId(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "allura-benchmark-harness", version: "1.0" },
      },
    })
    const sid = res.headers.get("mcp-session-id")
    if (sid) this.sessionId = sid
    await res.text() // drain to complete the request
  }

  /** Parse a Streamable-HTTP response body (handles both SSE and plain JSON). */
  private parseEnvelope<T>(text: string): JsonRpcResponse<T> {
    if (text.includes("data: ")) {
      let lastData = ""
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ")) lastData = line.slice(6)
      }
      if (lastData) return JSON.parse(lastData) as JsonRpcResponse<T>
    }
    return JSON.parse(text) as JsonRpcResponse<T>
  }

  /**
   * Call a tool, capturing tool-level errors instead of throwing. Transport
   * failures (network, abort, malformed envelope) still reject — those mean the
   * gateway is unreachable, which a benchmark should surface loudly.
   */
  async tryCall<T = unknown>(name: string, args: Record<string, unknown>): Promise<ToolCallResult<T>> {
    await this.init()
    const start = performance.now()
    const res = await this.fetchWithTimeout({
      jsonrpc: "2.0",
      id: this.nextId(),
      method: "tools/call",
      params: { name, arguments: args },
    })
    const text = await res.text()
    const latencyMs = performance.now() - start

    const parsed = this.parseEnvelope<T>(text)
    if (parsed.error) {
      return { ok: false, error: parsed.error.message, latencyMs }
    }
    const content = parsed.result?.content?.[0]
    if (content?.type === "text") {
      let payload: unknown
      try {
        payload = JSON.parse(content.text)
      } catch {
        return { ok: false, error: `non-JSON tool payload: ${content.text.slice(0, 200)}`, latencyMs }
      }
      // Tools signal validation failures with isError + an { error } body.
      const isError =
        parsed.result?.isError === true ||
        (typeof payload === "object" && payload !== null && "error" in payload)
      if (isError) {
        const errMsg =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "tool reported isError"
        return { ok: false, error: errMsg, data: payload as T, latencyMs }
      }
      return { ok: true, data: payload as T, latencyMs }
    }
    return { ok: false, error: "unexpected MCP response format", latencyMs }
  }

  /** Call a tool, throwing on any tool-level or transport failure. */
  async call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.tryCall<T>(name, args)
    if (!result.ok || result.data === undefined) {
      throw new Error(`tool ${name} failed: ${result.error ?? "unknown error"}`)
    }
    return result.data
  }

  /** Lightweight reachability probe used for preflight. */
  async ping(groupId: string): Promise<{ reachable: boolean; latencyMs: number; detail?: string }> {
    try {
      const r = await this.tryCall("audit_health_report", { group_id: groupId })
      return { reachable: r.ok || r.data !== undefined, latencyMs: r.latencyMs, detail: r.error }
    } catch (err) {
      return { reachable: false, latencyMs: 0, detail: err instanceof Error ? err.message : String(err) }
    }
  }
}
