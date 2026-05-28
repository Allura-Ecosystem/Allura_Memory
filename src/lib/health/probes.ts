/**
 * Health Probes — Readiness and Liveness checks for Kubernetes/Docker
 *
 * Readiness (/ready): Can this pod serve traffic? Checks all dependencies.
 * Liveness (/live):  Is the process alive? No dependency checks.
 *
 * Design principles:
 * - Readiness checks must complete in < 5 seconds (timeout on deps)
 * - Liveness is a simple process heartbeat (no deps)
 * - Both return JSON with timestamp for observability
 */

import { isDriverHealthy } from "@/lib/neo4j/connection";
import { isPoolHealthy } from "@/lib/postgres/connection";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DependencyCheck {
  name: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

export interface ReadinessResult {
  ready: boolean;
  checks: Record<string, DependencyCheck>;
  timestamp: string;
}

export interface LivenessResult {
  alive: boolean;
  uptime: number;
  timestamp: string;
}

// ── Dependency Check Timeout ──────────────────────────────────────────────────

const DEPENDENCY_CHECK_TIMEOUT_MS = 4500; // 4.5s to leave margin under 5s total

/**
 * Run a dependency check with a timeout.
 * Returns unhealthy if the check exceeds the timeout.
 */
async function checkWithTimeout(
  name: string,
  checkFn: () => Promise<boolean>,
  timeoutMs: number = DEPENDENCY_CHECK_TIMEOUT_MS,
): Promise<DependencyCheck> {
  const start = Date.now();

  try {
    const result = await Promise.race([
      checkFn(),
      new Promise<boolean>((_resolve, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

    return {
      name,
      healthy: result,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name,
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Readiness Probe ───────────────────────────────────────────────────────────

/**
 * MCP server initialization state.
 * Set to true once the MCP server has connected its transport.
 */
let mcpInitialized = false;

/**
 * Mark the MCP server as initialized.
 * Called from canonical-http-gateway.ts after server.connect(transport).
 */
export function markMcpInitialized(): void {
  mcpInitialized = true;
}

/**
 * Check if the MCP server is initialized.
 */
function isMcpInitialized(): boolean {
  return mcpInitialized;
}

async function isMcpHealthy(): Promise<boolean> {
  if (isMcpInitialized()) {
    return true;
  }

  const baseUrl = process.env.ALLURA_MCP_BASE_URL;
  if (!baseUrl) {
    return false;
  }

  const response = await fetch(new URL("/ready", baseUrl), {
    signal: AbortSignal.timeout(DEPENDENCY_CHECK_TIMEOUT_MS),
  });

  return response.ok;
}

/**
 * Readiness probe — checks all dependencies.
 * Returns 200 if all required deps are healthy, 503 otherwise.
 *
 * Required: PostgreSQL (primary data store)
 * Optional: Neo4j (semantic memory — degraded but ready if down)
 * Required: MCP server initialized
 */
export async function checkReadiness(): Promise<ReadinessResult> {
  const checks: Record<string, DependencyCheck> = {};

  // Check PostgreSQL (required)
  checks.postgres = await checkWithTimeout("postgres", isPoolHealthy);

  // Check Neo4j (optional — degraded mode if down)
  checks.neo4j = await checkWithTimeout("neo4j", isDriverHealthy);

  // Check MCP server initialization or configured HTTP gateway (required)
  checks.mcp = await checkWithTimeout("mcp", isMcpHealthy);

  // Ready if PostgreSQL and MCP are healthy (Neo4j is optional)
  const ready = checks.postgres.healthy && checks.mcp.healthy;

  return {
    ready,
    checks,
    timestamp: new Date().toISOString(),
  };
}

// ── Liveness Probe ────────────────────────────────────────────────────────────

/**
 * Liveness probe — simple process heartbeat.
 * No dependency checks. If this returns, the process is alive.
 */
export function checkLiveness(): LivenessResult {
  return {
    alive: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}
