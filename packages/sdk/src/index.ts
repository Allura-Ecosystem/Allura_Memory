/**
 * @allura/sdk — Public TypeScript SDK for Allura
 * Story 24.7 AC-1: typed clients without importing server internals
 */

// Health/Readiness client
export interface HealthResponse {
  ready: boolean;
  checks: {
    postgres: { healthy: boolean };
    mcp: { healthy: boolean };
  };
}

export async function checkHealth(url: string): Promise<HealthResponse> {
  const res = await fetch(`${url.replace(/\/mcp$/, "")}/ready`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

// Governed memory client
export interface MemoryAddParams {
  group_id: string;
  user_id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchParams {
  group_id: string;
  query: string;
  include_global?: boolean;
  limit?: number;
}

export class AlluraClient {
  constructor(private url: string) {}

  async health(): Promise<HealthResponse> {
    return checkHealth(this.url);
  }

  async addMemory(params: MemoryAddParams): Promise<{ id: string }> {
    // MCP tool call via HTTP
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory_add", arguments: params } }),
    });
    const data = await res.json();
    return data.result;
  }

  async searchMemory(params: MemorySearchParams): Promise<{ results: Array<{ id: string; content: string; score: number }> }> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory_search", arguments: params } }),
    });
    const data = await res.json();
    return data.result;
  }
}

// Scenario execution client
export interface ScenarioRunResult {
  status: "completed" | "failed";
  receipt: { scenario_digest: string; tool_calls: unknown[] };
}

// Evaluation client
export interface EvalRunResult {
  overall_status: "pass" | "fail";
  metrics: Array<{ name: string; value: number; status: string }>;
}

// Evidence inspection client
export interface EvidenceManifest {
  artifacts: Array<{ name: string; hash: string }>;
}