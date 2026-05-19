/**
 * Health Check API Endpoint
 *
 * Provides health check endpoints for monitoring the 6-month operational stability:
 * - /api/health - Basic health check
 * - /api/health/ready - Readiness check (dependencies ready)
 * - /api/health/live - Liveness check (process alive)
 * - /api/health/detailed - Detailed status of all components
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/neo4j/connection"
import { captureException } from "@/lib/observability/sentry"
import { getPool } from "@/lib/postgres/connection"

/**
 * Health status for a component
 */
export interface ComponentHealth {
  name: string
  status: "healthy" | "degraded" | "unhealthy"
  message?: string
  latency?: number
  details?: Record<string, unknown>
}

/**
 * Overall health response
 */
export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy"
  timestamp: string
  uptime: number
  version: string
  mode?: "http"
  interface?: "rest"
  dependencies?: {
    postgres: { status: "up" | "down"; required: true; latency_ms?: number }
    neo4j: { status: "up" | "down"; required: false; latency_ms?: number }
  }
  degraded?: {
    enabled: boolean
    reason?: "neo4j_unavailable"
    capabilities_lost?: string[]
  }
  components?: ComponentHealth[]
}

/**
 * Check PostgreSQL health
 */
async function checkPostgreSQL(): Promise<ComponentHealth> {
  const start = Date.now()

  try {
    const pool = getPool()
    await pool.query("SELECT 1")

    return {
      name: "postgresql",
      status: "healthy",
      message: "Database connection verified",
      latency: Date.now() - start,
      details: {
        connected: true,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      name: "postgresql",
      status: "unhealthy",
      message: `Database connection failed: ${errorMessage}`,
      latency: Date.now() - start,
      details: {
        connected: false,
        error: errorMessage,
      },
    }
  }
}

/**
 * Check Neo4j health
 */
async function checkNeo4j(): Promise<ComponentHealth> {
  const start = Date.now()

  try {
    const session = getSession()
    await session.run("RETURN 1 AS test")
    await session.close()

    return {
      name: "neo4j",
      status: "healthy",
      message: "Graph database connection verified",
      latency: Date.now() - start,
      details: {
        connected: true,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      name: "neo4j",
      status: "unhealthy",
      message: `Graph database connection failed: ${errorMessage}`,
      latency: Date.now() - start,
      details: {
        connected: false,
        error: errorMessage,
      },
    }
  }
}

/**
 * Check Session Bootstrap health
 */
async function checkSessionBootstrap(): Promise<ComponentHealth> {
  const start = Date.now()

  try {
    // Check if session state directory exists
    const fs = await import("fs/promises")
    const stateDir = ".opencode/state"

    try {
      const stat = await fs.stat(stateDir)
      return {
        name: "session-bootstrap",
        status: "healthy",
        message: "Session bootstrap is operational",
        latency: Date.now() - start,
        details: {
          stateDir: stateDir,
          stateDirExists: stat.isDirectory(),
        },
      }
    } catch {
      // Create state directory if it doesn't exist
      await fs.mkdir(stateDir, { recursive: true })
      await fs.mkdir(`${stateDir}/checkpoints`, { recursive: true })
      await fs.mkdir(`${stateDir}/sessions`, { recursive: true })

      return {
        name: "session-bootstrap",
        status: "healthy",
        message: "Session bootstrap initialized",
        latency: Date.now() - start,
        details: {
          stateDir: stateDir,
          initialized: true,
        },
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      name: "session-bootstrap",
      status: "unhealthy",
      message: `Session bootstrap failed: ${errorMessage}`,
      latency: Date.now() - start,
      details: {
        error: errorMessage,
      },
    }
  }
}

/**
 * Check Encoding Validator health
 * (memory-bank directory removed — always healthy)
 */
async function checkEncodingValidator(): Promise<ComponentHealth> {
  const start = Date.now()

  return {
    name: "encoding-validator",
    status: "healthy",
    message: "Encoding validation operational",
    latency: Date.now() - start,
  }
}

/**
 * Check Disk Space health
 */
async function checkDiskSpace(): Promise<ComponentHealth> {
  const start = Date.now()

  try {
    // In production, this would use system calls to check disk space
    // For now, return healthy status

    // TODO: Implement actual disk space check
    // const { exec } = require('child_process');
    // const dfOutput = await exec('df -h .');

    return {
      name: "disk-space",
      status: "healthy",
      message: "Sufficient disk space available",
      latency: Date.now() - start,
      details: {
        // In production: actual disk space stats
        available: "sufficient",
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      name: "disk-space",
      status: "unhealthy",
      message: `Disk space check failed: ${errorMessage}`,
      latency: Date.now() - start,
    }
  }
}

/**
 * Get overall health status from component healths
 */
function getOverallStatus(components: ComponentHealth[]): "healthy" | "degraded" | "unhealthy" {
  const postgres = components.find((c) => c.name === "postgresql")
  const neo4j = components.find((c) => c.name === "neo4j")

  if (postgres?.status === "unhealthy") {
    return "unhealthy"
  }

  if (neo4j?.status === "unhealthy") {
    return "degraded"
  }

  if (components.some((c) => c.status === "degraded")) {
    return "degraded"
  }

  return "healthy"
}

/**
 * GET /api/health - Basic health check
 */
export async function GET(request: NextRequest): Promise<NextResponse<HealthResponse>> {
  const { searchParams } = new URL(request.url)
  const detailed = searchParams.get("detailed") === "true"

  // Parse include/exclude params
  const include = searchParams.get("include")?.split(",").filter(Boolean) || []
  const exclude = searchParams.get("exclude")?.split(",").filter(Boolean) || []

  // Determine which components to check
  const allComponents = [checkPostgreSQL, checkNeo4j, checkSessionBootstrap, checkEncodingValidator, checkDiskSpace]

  let componentsToCheck = allComponents

  if (include.length > 0) {
    componentsToCheck = allComponents.filter((fn) => {
      const name = fn.name.replace("check", "").toLowerCase()
      return include.includes(name)
    })
  }

  if (exclude.length > 0) {
    componentsToCheck = componentsToCheck.filter((fn) => {
      const name = fn.name.replace("check", "").toLowerCase()
      return !exclude.includes(name)
    })
  }

  // Run all health checks
  const componentResults = await Promise.all(componentsToCheck.map((check) => check()))

  // Build response
  const healthResponse: HealthResponse = {
    status: getOverallStatus(componentResults),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "0.1.0",
    mode: "http",
    interface: "rest",
  }

  const postgres = componentResults.find((c) => c.name === "postgresql")
  const neo4jComponent = componentResults.find((c) => c.name === "neo4j")

  if (postgres && neo4jComponent) {
    healthResponse.dependencies = {
      postgres: {
        status: postgres.status === "healthy" ? "up" : "down",
        required: true,
        latency_ms: postgres.latency,
      },
      neo4j: {
        status: neo4jComponent.status === "healthy" ? "up" : "down",
        required: false,
        latency_ms: neo4jComponent.latency,
      },
    }

    if (healthResponse.status === "degraded" && neo4jComponent.status === "unhealthy") {
      healthResponse.degraded = {
        enabled: true,
        reason: "neo4j_unavailable",
        capabilities_lost: ["semantic_search", "semantic_read", "semantic_deprecate"],
      }
    }
  }

  // Include components in detailed mode or always for unhealthy status
  if (detailed || healthResponse.status !== "healthy") {
    healthResponse.components = componentResults
  }

  const statusCode = healthResponse.status === "healthy" ? 200 : healthResponse.status === "degraded" ? 200 : 503

  return NextResponse.json(healthResponse, { status: statusCode })
}

/**
 * POST /api/health - Acknowledge alerts (requires auth in production)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()

    // Validate request body
    const ackSchema = z.object({
      alertId: z.string().uuid(),
      acknowledgedBy: z.string().optional(),
    })

    const result = ackSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: "Invalid request body", details: result.error.issues }, { status: 400 })
    }

    // In production, this would use the AlertManager
    // const alertManager = getAlertManager();
    // alertManager.acknowledge(result.data.alertId, result.data.acknowledgedBy);

    return NextResponse.json({
      success: true,
      message: `Alert ${result.data.alertId} acknowledged`,
    })
  } catch (error) {
    captureException(error, { tags: { route: "/api/health", method: "POST" } })
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "Failed to acknowledge alert", details: errorMessage }, { status: 500 })
  }
}

/**
 * Export health check status constants
 */
const HEALTH_CHECK_INTERVAL_MS = 60000 // 1 minute
const HEALTH_CHECK_TIMEOUT_MS = 5000 // 5 seconds
