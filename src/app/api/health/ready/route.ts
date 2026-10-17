/**
 * Readiness Probe — GET /api/health/ready
 *
 * Kubernetes readiness check. Returns 200 when all dependencies are healthy
 * and the pod can serve traffic. Returns 503 when any dependency is unhealthy.
 *
 * Checks: PostgreSQL (with 4.5s timeout per dependency).
 * Does NOT check MCP or external services — those are best-effort.
 */

import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/health/probes";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await checkReadiness();

  const status = result.ready ? 200 : 503;

  return NextResponse.json(result, {
    status,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}