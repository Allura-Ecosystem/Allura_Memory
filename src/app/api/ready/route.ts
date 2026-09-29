/**
 * Readiness Probe API Endpoint — GET /api/ready
 *
 * Kubernetes readiness probe. Returns 200 if the pod can serve traffic
 * (all required dependencies are healthy), 503 otherwise.
 *
 * Required: PostgreSQL, MCP server initialized
 * Optional: RuVector semantic layer (degraded mode if down)
 *
 * No auth required — this is a health endpoint.
 */

import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/health/probes";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await checkReadiness();

  const statusCode = result.ready ? 200 : 503;
  return NextResponse.json(result, { status: statusCode });
}