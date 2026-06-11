/**
 * POST /api/mcp-catalog/import
 *
 * Import tool candidates from Docker MCP catalog.
 * Creates ToolCandidate entries for each tool discovered.
 */

import { NextRequest, NextResponse } from "next/server"
import { withPermission } from "@/lib/auth/api-auth"
import { importCandidate } from "@/lib/mcp-catalog/registry"
import { captureException } from "@/lib/observability/sentry"

export async function POST(request: NextRequest) {
  const auth = await withPermission(request, "memory:write", "admin")
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { tools } = body

    if (!Array.isArray(tools) || tools.length === 0) {
      return NextResponse.json(
        { error: "tools array is required and must not be empty" },
        { status: 400 }
      )
    }

    const imported: string[] = []
    const errors: Array<{ tool: string; reason: string }> = []

    for (const tool of tools) {
      if (!tool.server || !tool.tool || !tool.description) {
        errors.push({ tool: tool.tool || "unknown", reason: "server, tool, and description are required" })
        continue
      }

      try {
        const candidate = await importCandidate({
          id: `${tool.server}::${tool.tool}`,
          server: tool.server,
          tool: tool.tool,
          description: tool.description,
          inputSchema: tool.inputSchema || {},
          discoveryMethod: tool.discoveryMethod || "catalog_scan",
        })
        imported.push(candidate.id)
      } catch (err) {
        errors.push({
          tool: `${tool.server}::${tool.tool}`,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      imported,
      imported_count: imported.length,
      errors,
      error_count: errors.length,
    })
  } catch (error) {
    captureException(error, { tags: { route: "/api/mcp-catalog/import", method: "POST" } })
    return NextResponse.json({ error: "Failed to import candidates" }, { status: 500 })
  }
}