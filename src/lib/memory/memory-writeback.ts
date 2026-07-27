/**
 * Memory Writeback Helper — Story 20.5
 *
 * Structured helper for agents to write task outcomes to Allura Brain.
 * Produces a structured content string and metadata that the trajectory
 * engine, curator pipeline, and genesis engine can parse.
 *
 * The content format is:
 *   "Task: {summary} | Outcome: {outcome} | Files: {files} | Decisions: {decisions}"
 *
 * The metadata includes:
 *   { type: "task_outcome", agent_id, files_changed, outcome, key_decisions }
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

import { memory_add } from "@/mcp/canonical-tools";
import type { MemoryAddResponse, GroupId } from "@/lib/memory/canonical-contracts";
import { validateGroupId } from "@/lib/validation/group-id";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskOutcome = "pass" | "fail" | "partial";

export interface TaskOutcomeParams {
  /** Required: Short summary of the task */
  task_summary: string;
  /** Required: Tenant namespace (format: allura-*) */
  group_id: string;
  /** Required: Agent identifier */
  agent_id: string;
  /** Required: Outcome status */
  outcome: TaskOutcome;
  /** Optional: User identifier within tenant (defaults to agent_id) */
  user_id?: string;
  /** Optional: Files changed during the task */
  files_changed?: string[];
  /** Optional: Key decisions made during the task */
  key_decisions?: string[];
  /** Optional: Conversation ID for traceability */
  conversation_id?: string;
}

export interface TaskOutcomeResult {
  /** The memory_add response */
  memory: MemoryAddResponse;
  /** The structured content string that was written */
  content: string;
  /** The metadata that was attached */
  metadata: Record<string, unknown>;
}

// ── Content Builder ───────────────────────────────────────────────────────────

/**
 * Build the structured content string for a task outcome.
 *
 * Format: "Task: {summary} | Outcome: {outcome} | Files: {files} | Decisions: {decisions}"
 */
export function buildTaskOutcomeContent(params: TaskOutcomeParams): string {
  const parts: string[] = [];

  parts.push(`Task: ${params.task_summary}`);
  parts.push(`Outcome: ${params.outcome}`);

  if (params.files_changed && params.files_changed.length > 0) {
    parts.push(`Files: ${params.files_changed.join(", ")}`);
  } else {
    parts.push(`Files: (none)`);
  }

  if (params.key_decisions && params.key_decisions.length > 0) {
    parts.push(`Decisions: ${params.key_decisions.join("; ")}`);
  } else {
    parts.push(`Decisions: (none)`);
  }

  return parts.join(" | ");
}

/**
 * Build the metadata object for a task outcome.
 */
export function buildTaskOutcomeMetadata(params: TaskOutcomeParams): Record<string, unknown> {
  return {
    type: "task_outcome",
    agent_id: params.agent_id,
    files_changed: params.files_changed ?? [],
    outcome: params.outcome,
    key_decisions: params.key_decisions ?? [],
    ...(params.conversation_id ? { conversation_id: params.conversation_id } : {}),
  };
}

// ── Main Helper ───────────────────────────────────────────────────────────────

/**
 * Write a task outcome to Allura Brain.
 *
 * Calls memory_add with a structured content string and metadata so the
 * trajectory engine, curator pipeline, and genesis engine can parse it.
 *
 * @param params - Task outcome parameters
 * @returns The memory_add response + the content/metadata that were written
 * @throws GroupIdValidationError if group_id format is invalid
 */
export async function writeTaskOutcome(
  params: TaskOutcomeParams
): Promise<TaskOutcomeResult> {
  // Validate group_id format (fail fast)
  const validatedGroupId = validateGroupId(params.group_id);

  // Validate required fields
  if (!params.task_summary || params.task_summary.trim().length === 0) {
    throw new Error("task_summary is required and cannot be empty");
  }
  if (!params.agent_id || params.agent_id.trim().length === 0) {
    throw new Error("agent_id is required and cannot be empty");
  }
  if (!["pass", "fail", "partial"].includes(params.outcome)) {
    throw new Error(`outcome must be 'pass', 'fail', or 'partial' — got '${params.outcome}'`);
  }

  const content = buildTaskOutcomeContent(params);
  const metadata = buildTaskOutcomeMetadata(params);

  const memory = await memory_add({
    group_id: validatedGroupId as unknown as GroupId,
    user_id: params.user_id ?? params.agent_id,
    content,
    metadata: {
      ...metadata,
      source: "conversation",
    },
  });

  return { memory, content, metadata };
}

// ── MCP Tool Wrapper ──────────────────────────────────────────────────────────

export interface MemoryWritebackToolRequest {
  task_summary: string;
  group_id: string;
  agent_id: string;
  outcome: TaskOutcome;
  files_changed?: string[];
  key_decisions?: string[];
  user_id?: string;
  conversation_id?: string;
}

export interface MemoryWritebackToolResponse {
  data: { memory_id: string; content: string; metadata: Record<string, unknown> } | null;
  meta: { contract_version: string; degraded: boolean; warnings: string[] };
  error: string | null;
}

/**
 * MCP tool wrapper for memory_writeback.
 * Returns a standard response envelope.
 */
export async function memory_writeback_tool(
  request: MemoryWritebackToolRequest
): Promise<MemoryWritebackToolResponse> {
  try {
    const result = await writeTaskOutcome(request);
    return {
      data: {
        memory_id: result.memory.id,
        content: result.content,
        metadata: result.metadata,
      },
      meta: { contract_version: "v1", degraded: false, warnings: [] },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: null,
      meta: { contract_version: "v1", degraded: false, warnings: [] },
      error: message,
    };
  }
}