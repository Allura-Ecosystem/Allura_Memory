/**
 * @allura/sdk — AlluraClient
 * Story 12.3: Main entry point for the @allura/sdk package.
 *
 * Provides governed access to memory and process operations via a single
 * typed client. Designed to be environment-agnostic (works in Node.js,
 * Bun, Deno, and browser contexts — subject to server-only guards in
 * the process engine for DSL helpers).
 *
 * @example
 * const client = new AlluraClient({
 *   baseUrl: "http://localhost:3100",
 *   apiKey: process.env.ALLURA_API_KEY,
 *   groupId: "allura-system",
 * })
 *
 * const mem = await client.memory.add({
 *   content: "Session started: processing story 12.3",
 *   userId: "woz-builder",
 * })
 */

import { MemoryClient } from "./memory"
import { ProcessClient } from "./process"
import { validateGroupId } from "./validation"

// ── Config ────────────────────────────────────────────────────────────────────

export interface AlluraClientConfig {
  /** Base URL of the Allura Memory server, e.g. "http://localhost:3100" */
  baseUrl: string
  /** API key for Authorization header (optional in dev with DevAuthProvider) */
  apiKey?: string
  /** Default group_id for all operations — must match ^allura-[a-z0-9-]+$ */
  groupId: string
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
}

// ── AlluraClient ──────────────────────────────────────────────────────────────

export class AlluraClient {
  /** Memory CRUD operations — backed by the Allura Memory REST API */
  readonly memory: MemoryClient

  /** Process DSL helpers and (future) HTTP process execution */
  readonly process: ProcessClient

  constructor(config: AlluraClientConfig) {
    // Validate group_id at construction time so callers get a clear error immediately
    validateGroupId(config.groupId)

    // Allow injecting a custom fetch implementation for testability.
    // Defaults to the global fetch available in Node 18+, Bun, Deno, and browsers.
    const fetcher = globalThis.fetch.bind(globalThis)

    this.memory = new MemoryClient(config, fetcher)
    this.process = new ProcessClient(config)
  }
}
