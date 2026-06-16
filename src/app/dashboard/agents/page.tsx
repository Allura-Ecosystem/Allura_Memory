import type { Metadata } from "next"
import { headers } from "next/headers"
import { getPool } from "@/lib/postgres/connection"
import { listTenantAgents } from "@/lib/agents/tenant-roster"
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id"
import type { TenantAgent } from "@/lib/agents/tenant-roster"

export const metadata: Metadata = {
  title: "Agent Registry — Allura Memory",
}

export const dynamic = "force-dynamic"

// ── Components ────────────────────────────────────────────────────────────────

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: active ? "#16a34a" : "#9ca3af",
        flexShrink: 0,
      }}
    />
  )
}

function AgentRow({ agent }: { agent: TenantAgent }) {
  const lastUsed = agent.lastUsed
    ? new Date(agent.lastUsed).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "never"

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e8e3d8",
        borderRadius: 10,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <StatusDot active={agent.active} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#1a1a1a",
            marginBottom: 3,
          }}
        >
          {agent.name}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>
            <span style={{ color: "#9ca3af" }}>workspace: </span>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{agent.workspaceId}</span>
          </span>
          <span>
            <span style={{ color: "#9ca3af" }}>scopes: </span>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{agent.scopes}</span>
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontWeight: 600, color: agent.active ? "#16a34a" : "#9ca3af", marginBottom: 2 }}>
          {agent.active ? "Active" : "Revoked"}
        </div>
        <div>last used: {lastUsed}</div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentsPage() {
  const headersList = await headers()
  const rawGroupId = headersList.get("x-allura-group-id") ?? "allura-system"

  let groupId = "allura-system"
  try {
    groupId = validateGroupId(rawGroupId)
  } catch (e) {
    if (!(e instanceof GroupIdValidationError)) throw e
  }

  let agents: TenantAgent[] = []
  let error: string | null = null
  let source = "postgres:mcp_tokens"

  try {
    const pool = getPool()
    agents = await listTenantAgents(pool, groupId)
  } catch {
    error = "PostgreSQL unavailable — agent list cannot be loaded."
    source = "degraded"
  }

  const active = agents.filter((a) => a.active)
  const revoked = agents.filter((a) => !a.active)

  return (
    <div
      style={{
        padding: "32px",
        fontFamily: '"IBM Plex Sans", sans-serif',
        background: "#faf7f0",
        minHeight: "100%",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#2563eb",
            margin: "0 0 4px",
          }}
        >
          Agents
        </p>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#1a1a1a",
            margin: "0 0 6px",
            letterSpacing: "-0.02em",
          }}
        >
          Agent Registry
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
          Live roster from <span style={{ fontFamily: '"IBM Plex Mono", monospace' }}>mcp_tokens</span> for{" "}
          <strong style={{ color: "#374151" }}>{groupId}</strong> ·{" "}
          <span style={{ color: source === "degraded" ? "#ef4444" : "#16a34a" }}>
            {source === "degraded" ? "Degraded" : "Live"}
          </span>
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 10,
            padding: "14px 18px",
            fontSize: 13,
            color: "#ef4444",
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {agents.length === 0 && !error && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e8e3d8",
            borderRadius: 12,
            padding: "40px",
            textAlign: "center",
            maxWidth: 440,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
            No agents registered
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            Register an MCP token via the Allura Guard console to add agents to{" "}
            <span style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{groupId}</span>.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#16a34a", marginBottom: 10 }}>
            Active — {active.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map((a) => <AgentRow key={a.id} agent={a} />)}
          </div>
        </section>
      )}

      {revoked.length > 0 && (
        <section>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9ca3af", marginBottom: 10 }}>
            Revoked — {revoked.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {revoked.map((a) => <AgentRow key={a.id} agent={a} />)}
          </div>
        </section>
      )}

      <div
        style={{
          marginTop: 28,
          fontSize: 11,
          color: "#9ca3af",
          fontFamily: '"IBM Plex Mono", monospace',
        }}
      >
        group_id: {groupId} · source: {source} · fetched: {new Date().toISOString()}
      </div>
    </div>
  )
}
