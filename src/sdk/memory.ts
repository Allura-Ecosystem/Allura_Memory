/**
 * @allura/sdk — Memory Client
 * Story 12.3: HTTP client for governed memory CRUD operations.
 *
 * Sends requests to the Allura Memory REST API at /api/memory/*.
 * All operations validate group_id client-side before sending any request.
 *
 * This module is environment-agnostic (no server-only guards).
 */

import type { AlluraClientConfig } from "./client"
import { AlluraSDKError, type MemoryResult } from "./types"
import { requireField, validateGroupId } from "./validation"

// ── Response Shapes ───────────────────────────────────────────────────────────

/** Raw shape returned from POST /api/memory */
interface RawMemoryAddResponse {
  id: string
  content?: string
  user_id?: string
  group_id?: string
  created_at?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

/** Raw shape of a single memory record from the API */
interface RawMemoryRecord {
  id: string
  content: string
  user_id?: string
  userId?: string
  group_id?: string
  groupId?: string
  score?: number
  source?: string
  status?: string
  created_at?: string
  createdAt?: string
  metadata?: Record<string, unknown>
}

// ── Normalizer ────────────────────────────────────────────────────────────────

function normalizeMemory(raw: RawMemoryRecord): MemoryResult {
  return {
    id: raw.id,
    content: raw.content,
    userId: raw.userId ?? raw.user_id ?? "",
    groupId: raw.groupId ?? raw.group_id ?? "",
    score: raw.score,
    source: raw.source,
    status: raw.status,
    createdAt: raw.createdAt ?? raw.created_at ?? "",
    metadata: raw.metadata,
  }
}

// ── MemoryClient ──────────────────────────────────────────────────────────────

export class MemoryClient {
  private readonly baseUrl: string
  private readonly groupId: string
  private readonly headers: Record<string, string>
  private readonly timeout: number
  private readonly fetcher: typeof fetch

  constructor(config: AlluraClientConfig, fetcher: typeof fetch) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "") // strip trailing slash
    this.groupId = config.groupId
    this.timeout = config.timeout ?? 30_000
    this.fetcher = fetcher

    this.headers = {
      "Content-Type": "application/json",
      "x-allura-group-id": config.groupId,
    }

    if (config.apiKey) {
      this.headers["Authorization"] = `Bearer ${config.apiKey}`
    }
  }

  // ── Internal Request Helper ───────────────────────────────────────────────

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await this.fetcher(url, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`
        try {
          const errorBody = (await response.json()) as { error?: string }
          if (errorBody.error) errorMessage = errorBody.error
        } catch {
          // ignore JSON parse failure — use default message
        }
        throw new AlluraSDKError(errorMessage, response.status, `HTTP_${response.status}`)
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof AlluraSDKError) throw error
      if (error instanceof Error && error.name === "AbortError") {
        throw new AlluraSDKError(
          `Request timed out after ${this.timeout}ms`,
          408,
          "REQUEST_TIMEOUT",
        )
      }
      throw new AlluraSDKError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0,
        "NETWORK_ERROR",
      )
    } finally {
      clearTimeout(timer)
    }
  }

  // ── memory_add ────────────────────────────────────────────────────────────

  /**
   * Add a new memory to Allura Brain.
   *
   * POST /api/memory
   */
  async add(params: {
    content: string
    userId: string
    metadata?: Record<string, unknown>
  }): Promise<MemoryResult> {
    validateGroupId(this.groupId)
    requireField(params.content, "content")
    requireField(params.userId, "userId")

    const raw = await this.request<RawMemoryAddResponse>("POST", "/api/memory", {
      group_id: this.groupId,
      user_id: params.userId,
      content: params.content,
      metadata: params.metadata,
    })

    return {
      id: raw.id,
      content: raw.content ?? params.content,
      userId: (raw.user_id as string | undefined) ?? params.userId,
      groupId: (raw.group_id as string | undefined) ?? this.groupId,
      createdAt: (raw.created_at as string | undefined) ?? new Date().toISOString(),
      metadata: raw.metadata,
    }
  }

  // ── memory_search ─────────────────────────────────────────────────────────

  /**
   * Semantic + hybrid search over Allura Brain memories.
   *
   * GET /api/memory?query=...
   */
  async search(params: {
    query: string
    userId?: string
    limit?: number
  }): Promise<MemoryResult[]> {
    validateGroupId(this.groupId)
    requireField(params.query, "query")

    const qs = new URLSearchParams({
      group_id: this.groupId,
      query: params.query,
    })
    if (params.userId) qs.set("user_id", params.userId)
    if (params.limit !== undefined) qs.set("limit", String(params.limit))

    const raw = await this.request<{ memories?: RawMemoryRecord[] } | RawMemoryRecord[]>(
      "GET",
      `/api/memory?${qs.toString()}`,
    )

    const records = Array.isArray(raw) ? raw : (raw as { memories?: RawMemoryRecord[] }).memories ?? []
    return records.map(normalizeMemory)
  }

  // ── memory_get ────────────────────────────────────────────────────────────

  /**
   * Fetch a single memory by ID.
   *
   * GET /api/memory/[id]
   */
  async get(id: string): Promise<MemoryResult | null> {
    validateGroupId(this.groupId)
    requireField(id, "id")

    try {
      const raw = await this.request<RawMemoryRecord>(
        "GET",
        `/api/memory/${encodeURIComponent(id)}?group_id=${encodeURIComponent(this.groupId)}`,
      )
      return normalizeMemory(raw)
    } catch (error) {
      if (error instanceof AlluraSDKError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  // ── memory_list ───────────────────────────────────────────────────────────

  /**
   * List memories for a user, paginated.
   *
   * GET /api/memory?user_id=...
   */
  async list(params: {
    userId: string
    limit?: number
    offset?: number
  }): Promise<MemoryResult[]> {
    validateGroupId(this.groupId)
    requireField(params.userId, "userId")

    const qs = new URLSearchParams({
      group_id: this.groupId,
      user_id: params.userId,
    })
    if (params.limit !== undefined) qs.set("limit", String(params.limit))
    if (params.offset !== undefined) qs.set("offset", String(params.offset))

    const raw = await this.request<{ memories?: RawMemoryRecord[] } | RawMemoryRecord[]>(
      "GET",
      `/api/memory?${qs.toString()}`,
    )

    const records = Array.isArray(raw) ? raw : (raw as { memories?: RawMemoryRecord[] }).memories ?? []
    return records.map(normalizeMemory)
  }

  // ── memory_delete ─────────────────────────────────────────────────────────

  /**
   * Soft-delete a memory by ID (30-day recovery window).
   *
   * DELETE /api/memory/[id]
   */
  async delete(id: string): Promise<{ deleted: boolean }> {
    validateGroupId(this.groupId)
    requireField(id, "id")

    await this.request<unknown>(
      "DELETE",
      `/api/memory/${encodeURIComponent(id)}?group_id=${encodeURIComponent(this.groupId)}`,
    )

    return { deleted: true }
  }
}
