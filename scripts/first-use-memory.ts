#!/usr/bin/env bun
/** Explicit, append-only first-use evaluation. No promotion and no write retries. */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
  GroupIdSchema,
  MemoryAddResponseSchema,
  MemorySearchResponseSchema,
} from "../packages/sdk/src/types";

if (typeof window !== "undefined") throw new Error("server-side only");

export interface FirstUseConfig {
  baseUrl: string;
  token: string;
  groupId: string;
}

export interface FirstUseSession {
  sessionId: string | undefined;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

type SessionFactory = (config: FirstUseConfig) => Promise<FirstUseSession>;
type Stage = "configuration" | "connect-save" | "save" | "connect-retrieve" | "retrieve";

export class FirstUseFailure extends Error {
  constructor(
    public readonly stage: Stage,
    public readonly code: string,
    public readonly savedMemoryId?: string,
    public readonly runId?: string,
  ) {
    super(code);
  }
}

/** Reject URL-embedded credentials and unknown scope before making a request. */
export function validateFirstUseConfig(config: FirstUseConfig): FirstUseConfig {
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new FirstUseFailure("configuration", "INVALID_BASE_URL");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new FirstUseFailure("configuration", "INVALID_BASE_URL");
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new FirstUseFailure("configuration", "BASE_URL_MUST_BE_ORIGIN");
  }
  if (url.port && Number(url.port) >= 3000 && Number(url.port) <= 3999) {
    throw new FirstUseFailure("configuration", "RESERVED_PORT_BAND");
  }
  if (!config.token.trim()) throw new FirstUseFailure("configuration", "MISSING_AUTH_TOKEN");
  if (!GroupIdSchema.safeParse(config.groupId).success) {
    throw new FirstUseFailure("configuration", "INVALID_AUTHORIZED_GROUP");
  }
  return { ...config, baseUrl: url.origin };
}

function toolPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') throw new Error("INVALID_TOOL_RESULT");
  const result = value as { isError?: boolean; structuredContent?: unknown; content?: Array<{ type?: string; text?: string }> };
  if (result.isError) throw new Error("TOOL_REJECTED");
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content?.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error("MISSING_TOOL_PAYLOAD");
  return JSON.parse(text) as unknown;
}

async function createSession(config: FirstUseConfig): Promise<FirstUseSession> {
  const transport = new StreamableHTTPClientTransport(new URL(`${config.baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
    reconnectionOptions: {
      maxReconnectionDelay: 1000, initialReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1, maxRetries: 0,
    },
  });
  const client = new Client({ name: "allura-first-use", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: 15_000 });
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
  return {
    sessionId: transport.sessionId,
    callTool: (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 }),
    close: () => client.close(),
  };
}

/** The factory seam permits offline negative checks; only a real invocation is live proof. */
export async function runFirstUse(
  rawConfig: FirstUseConfig,
  factory: SessionFactory = createSession,
): Promise<Record<string, unknown>> {
  const config = validateFirstUseConfig(rawConfig);
  const runId = randomUUID();
  const content = `Decision: We chose PostgreSQL for this project because our team needs relational queries and an inspectable decision history. First-use run: ${runId}.`;
  let stage: Stage = "connect-save";
  let session: FirstUseSession | undefined;
  let savedMemoryId: string | undefined;
  try {
    session = await factory(config);
    const saveSessionId = session.sessionId;
    if (!saveSessionId) throw new FirstUseFailure(stage, "SESSION_NOT_ESTABLISHED");
    stage = "save";
    const saved = MemoryAddResponseSchema.parse(toolPayload(await session.callTool("memory_add", {
      group_id: config.groupId,
      content,
      metadata: { source: "manual", conversation_id: runId },
    })));
    savedMemoryId = saved.id;
    await session.close();
    session = undefined;

    stage = "connect-retrieve";
    session = await factory(config);
    if (!session.sessionId || session.sessionId === saveSessionId) {
      throw new FirstUseFailure(stage, "SEPARATE_SESSION_NOT_ESTABLISHED", savedMemoryId);
    }
    stage = "retrieve";
    const search = MemorySearchResponseSchema.parse(toolPayload(await session.callTool("memory_search", {
      group_id: config.groupId, query: content, status: "all", include_global: false, limit: 10,
    })));
    const match = search.results.find((result) => result.id === saved.id && result.content === content);
    if (!match) throw new FirstUseFailure(stage, "EXACT_SAVED_RECORD_NOT_RETRIEVED", savedMemoryId);
    return {
      status: "passed", run_id: runId, checked_at: new Date().toISOString(),
      endpoint: config.baseUrl, group_id: config.groupId,
      separate_sessions: true, saved_memory_id: saved.id, content,
      saved_at: saved.created_at, stored: saved.stored,
      pending_review_at_save: saved.pending_review ?? "not_reported",
      retrieved_source: match.source, retrieved_provenance: match.provenance,
      retrieved_record_created_at: match.created_at,
      retrieved_at: new Date().toISOString(),
      retrieval_health: search.meta ? {
        degraded: search.meta.degraded,
        stores_used: search.meta.stores_used,
        stores_attempted: search.meta.stores_attempted,
        warning_count: search.meta.warnings?.length ?? 0,
      } : "not_reported",
      human_review_exercised: false,
      approval_status: "not_verified_by_this_check",
      scope_of_proof: "authenticated saved-record retrieval across two MCP client sessions; not clean installation or human usability",
    };
  } catch (error) {
    if (error instanceof FirstUseFailure) {
      throw new FirstUseFailure(error.stage, error.code, savedMemoryId, runId);
    }
    // Never echo server errors: they can contain credentials or unrelated data.
    throw new FirstUseFailure(stage, "REQUEST_OR_RESPONSE_CHECK_FAILED", savedMemoryId, runId);
  } finally {
    if (session) await session.close().catch(() => undefined);
  }
}

export async function firstUseMain(args = process.argv.slice(2)): Promise<number> {
  const outputIndex = args.indexOf('--output');
  const outputCandidate = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  const output = outputCandidate && !outputCandidate.startsWith('-') ? outputCandidate : undefined;
  let receipt: Record<string, unknown>;
  let exitCode = 0;
  try {
    if (!args.includes('--allow-write')) {
      throw new FirstUseFailure("configuration", "WRITE_ACKNOWLEDGMENT_REQUIRED");
    }
    if (outputIndex >= 0 && !output) {
      throw new FirstUseFailure("configuration", "OUTPUT_PATH_REQUIRED");
    }
    receipt = await runFirstUse({
      baseUrl: process.env.ALLURA_BASE_URL ?? '',
      token: process.env.ALLURA_AUTH_TOKEN ?? '',
      groupId: process.env.ALLURA_GROUP_ID ?? '',
    });
  } catch (error) {
    exitCode = 1;
    const failure = error instanceof FirstUseFailure ? error : new FirstUseFailure("configuration", "UNEXPECTED_FAILURE");
    receipt = {
      status: "failed", checked_at: new Date().toISOString(),
      stage: failure.stage, code: failure.code,
      run_id: failure.runId ?? null,
      saved_memory_id: failure.savedMemoryId ?? null,
      save_may_have_committed: failure.stage === "save" || Boolean(failure.savedMemoryId),
      human_review_exercised: false,
      next_action: "Inspect the authorized service and reconcile any uncertain save before rerunning. No automatic write retry was performed.",
    };
  }
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  process.stdout.write(json);
  if (output) await writeFile(output, json, { mode: 0o600 });
  return exitCode;
}

if (import.meta.main) {
  firstUseMain().then((code) => { process.exitCode = code; }).catch(() => {
    process.stderr.write("Unable to write first-use receipt. Check the selected output path.\n");
    process.exitCode = 1;
  });
}
