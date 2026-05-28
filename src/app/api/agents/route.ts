/**
 * GET /api/agents
 *
 * Returns agent roster derived from .opencode/agent/**\/*.md definition files
 * merged with PostgreSQL activity data from the events table.
 *
 * Graceful degradation: if PG is unavailable, returns file-based data
 * with eventCount=0 and status="offline".
 */

import { NextResponse } from "next/server"
import path from "path"
import { getPool } from "@/lib/postgres/connection"

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("agents route can only be used server-side")
}

export interface Agent {
  id: string
  name: string
  model: string
  description: string
  skills: string[]
  eventCount: number
  lastActive: string | null
  status: "active" | "idle" | "offline"
}

/**
 * Parse YAML frontmatter from markdown string.
 * Returns key-value pairs for string fields only.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const result: Record<string, string> = {}
  const lines = match[1]!.split("\n")

  for (const line of lines) {
    const colon = line.indexOf(":")
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const raw = line.slice(colon + 1).trim()
    if (!raw || raw.startsWith("{") || raw.startsWith("[")) continue
    // Strip surrounding quotes
    result[key] = raw.replace(/^["']|["']$/g, "")
  }

  return result
}

/**
 * Determine status from lastActive ISO timestamp.
 * active  = event within last 5 minutes
 * idle    = event within last 24 hours
 * offline = older or no events
 */
function deriveStatus(lastActive: string | null): "active" | "idle" | "offline" {
  if (!lastActive) return "offline"
  const ms = Date.now() - new Date(lastActive).getTime()
  if (ms < 5 * 60 * 1000) return "active"
  if (ms < 24 * 60 * 60 * 1000) return "idle"
  return "offline"
}

/**
 * Read and parse all agent definition files from .opencode/agent/
 */
async function readAgentFiles(): Promise<
  Array<{ id: string; name: string; model: string; description: string }>
> {
  const fs = await import("fs/promises")
  const agentDir = path.join(process.cwd(), ".opencode", "agent")

  const agents: Array<{ id: string; name: string; model: string; description: string }> = []

  async function walk(dir: string): Promise<void> {
    let entries: import("fs").Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const content = await fs.readFile(full, "utf-8")
          const fm = parseFrontmatter(content)

          // Derive id from filename stem
          const id = path.basename(entry.name, ".md").toLowerCase()

          // name: prefer persona field, fallback to name field, fallback to id
          const name = fm["persona"] ?? fm["name"] ?? id

          const model = fm["model"] ?? ""
          const description = fm["description"] ?? ""

          agents.push({ id, name, model, description })
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walk(agentDir)
  return agents
}

export async function GET(): Promise<NextResponse<Agent[]>> {
  // Step 1: load agent files
  const fileAgents = await readAgentFiles()

  if (fileAgents.length === 0) {
    return NextResponse.json([])
  }

  const agentIds = fileAgents.map((a) => a.id)

  // Step 2: query PG for activity — graceful degradation on error
  type PgRow = { agent_id: string; event_count: string; last_active: string | null }
  let pgRows: PgRow[] = []

  try {
    const pool = getPool()
    const result = await pool.query<PgRow>(
      `SELECT agent_id, COUNT(*)::text AS event_count, MAX(created_at)::text AS last_active
       FROM events
       WHERE group_id = 'allura-system' AND agent_id = ANY($1)
       GROUP BY agent_id`,
      [agentIds]
    )
    pgRows = result.rows
  } catch {
    // DB unavailable — proceed with file-only data
  }

  // Build activity map keyed by agent_id
  const activity = new Map<string, { eventCount: number; lastActive: string | null }>()
  for (const row of pgRows) {
    activity.set(row.agent_id, {
      eventCount: parseInt(row.event_count, 10),
      lastActive: row.last_active ?? null,
    })
  }

  // Step 3: merge
  const agents: Agent[] = fileAgents.map((fa) => {
    const act = activity.get(fa.id)
    const lastActive = act?.lastActive ?? null
    return {
      id: fa.id,
      name: fa.name,
      model: fa.model,
      description: fa.description,
      skills: [],
      eventCount: act?.eventCount ?? 0,
      lastActive,
      status: deriveStatus(lastActive),
    }
  })

  return NextResponse.json(agents)
}
