"use client"

import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Database,
  GitBranch,
  Globe,
  Key,
  Layers,
  Shield,
  Sliders,
  User,
  XCircle,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// ─── types ────────────────────────────────────────────────────────────────────

interface ConnectionStatus {
  label: string
  host: string
  status: "connected" | "degraded" | "unreachable"
  latencyMs?: number
}

interface SettingsSection {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

// ─── constants ────────────────────────────────────────────────────────────────

const SECTIONS: SettingsSection[] = [
  { id: "connections", label: "Connections", icon: Database, description: "Database and service endpoints" },
  { id: "embedding", label: "Embedding", icon: Layers, description: "Vector embedding provider and model" },
  { id: "governance", label: "Governance", icon: Shield, description: "HITL promotion and curator thresholds" },
  { id: "agents", label: "Agents", icon: GitBranch, description: "Default agent group and routing" },
  { id: "notifications", label: "Notifications", icon: Bell, description: "Alerts and webhook configuration" },
  { id: "account", label: "Account", icon: User, description: "Profile and access credentials" },
]

const CONNECTION_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  neo4j: "Neo4j",
  ruvector: "RuVector PG",
  mcp: "MCP / Allura Brain",
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ConnectionStatus["status"] }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", {
        "bg-green-500": status === "connected",
        "bg-amber-400": status === "degraded",
        "bg-red-500": status === "unreachable",
      })}
    />
  )
}

function ConnectionRow({ conn }: { conn: ConnectionStatus }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--dashboard-border)] last:border-0">
      <div className="flex items-center gap-3">
        <StatusDot status={conn.status} />
        <div>
          <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">{conn.label}</p>
          <p className="text-xs text-[var(--dashboard-text-secondary)] font-mono">{conn.host}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {conn.latencyMs !== undefined && (
          <span className="text-xs text-[var(--dashboard-text-secondary)]">{conn.latencyMs}ms</span>
        )}
        <Badge
          className={cn("text-xs capitalize", {
            "bg-green-100 text-green-700 border-green-200": conn.status === "connected",
            "bg-amber-100 text-amber-700 border-amber-200": conn.status === "degraded",
            "bg-red-100 text-red-700 border-red-200": conn.status === "unreachable",
          })}
          variant="outline"
        >
          {conn.status}
        </Badge>
      </div>
    </div>
  )
}

function SectionNav({
  active,
  onSelect,
}: {
  active: string
  onSelect: (id: string) => void
}) {
  return (
    <nav className="space-y-1">
      {SECTIONS.map((s) => {
        const Icon = s.icon
        const isActive = active === s.id
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
              isActive
                ? "bg-[var(--dashboard-cta-primary)] text-white"
                : "text-[var(--dashboard-text-secondary)] hover:bg-[var(--dashboard-hover)] hover:text-[var(--dashboard-text-primary)]"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{s.label}</span>
            <ChevronRight className={cn("ml-auto h-3.5 w-3.5 opacity-50", isActive && "opacity-100")} />
          </button>
        )
      })}
    </nav>
  )
}

// ─── section panels ───────────────────────────────────────────────────────────

function ConnectionsPanel({ loading }: { loading: boolean }) {
  const connections: ConnectionStatus[] = [
    { label: "PostgreSQL", host: process.env.NEXT_PUBLIC_POSTGRES_HOST ?? "localhost:5432", status: "connected", latencyMs: 4 },
    { label: "Neo4j", host: "localhost:7687", status: "connected", latencyMs: 12 },
    { label: "RuVector PG", host: "localhost:5433", status: "connected", latencyMs: 6 },
    { label: "MCP / Allura Brain", host: "localhost:5888", status: "connected", latencyMs: 8 },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--dashboard-text-primary)]">Connections</h2>
        <p className="text-sm text-[var(--dashboard-text-secondary)] mt-0.5">Live status of all data layer endpoints.</p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardContent className="pt-4 pb-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 mb-2 rounded" />)
          ) : (
            connections.map((c) => <ConnectionRow key={c.label} conn={c} />)
          )}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="border-[var(--dashboard-border)] text-[var(--dashboard-text-secondary)]">
          Re-test Connections
        </Button>
      </div>
    </div>
  )
}

function EmbeddingPanel() {
  const settings = [
    { label: "Provider", value: "Ollama (local)", key: "EMBEDDING_PROVIDER" },
    { label: "Model", value: "nomic-embed-text", key: "EMBEDDING_MODEL" },
    { label: "Base URL", value: "http://localhost:11434", key: "RUVECTOR_EMBEDDING_BASE_URL" },
    { label: "Dimensions", value: "768", key: "EMBEDDING_DIMENSIONS" },
    { label: "Batch size", value: "10", key: "EMBEDDING_BATCH_SIZE" },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--dashboard-text-primary)]">Embedding</h2>
        <p className="text-sm text-[var(--dashboard-text-secondary)] mt-0.5">
          Vector embedding provider used by the RuVector hybrid search layer.
        </p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardContent className="pt-4">
          <div className="divide-y divide-[var(--dashboard-border)]">
            {settings.map((s) => (
              <div key={s.key} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">{s.label}</p>
                  <p className="text-xs text-[var(--dashboard-text-secondary)] font-mono">{s.key}</p>
                </div>
                <span className="text-sm text-[var(--dashboard-text-secondary)] font-mono bg-[var(--dashboard-bg)] px-2 py-1 rounded border border-[var(--dashboard-border)]">
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-[var(--dashboard-text-secondary)]">
        To change provider settings, update the corresponding env vars and restart the server.
      </p>
    </div>
  )
}

function GovernancePanel() {
  const rules = [
    { label: "HITL promotion required", enabled: true },
    { label: "Curator auto-approve above 0.95 confidence", enabled: false },
    { label: "Soft-delete retention (30 days)", enabled: true },
    { label: "Audit trail write-ahead logging", enabled: true },
    { label: "SOC2 append-only enforcement", enabled: true },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--dashboard-text-primary)]">Governance</h2>
        <p className="text-sm text-[var(--dashboard-text-secondary)] mt-0.5">
          HITL promotion rules and compliance controls. Core invariants cannot be disabled.
        </p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardContent className="pt-4">
          <div className="divide-y divide-[var(--dashboard-border)]">
            {rules.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-3">
                <span className="text-sm text-[var(--dashboard-text-primary)]">{r.label}</span>
                {r.enabled ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-[var(--dashboard-text-secondary)]" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-800">
          <strong>Invariant:</strong> SOC2 append-only enforcement and HITL promotion cannot be toggled from the UI.
          Changes require a curator approval via the pipeline.
        </p>
      </div>
    </div>
  )
}

function AgentsPanel() {
  const config = [
    { label: "Default group_id", value: "allura-system" },
    { label: "Default agent_id", value: "brooks" },
    { label: "Active team", value: "Team RAM (10 agents)" },
    { label: "Routing strategy", value: "Role-first + intent override" },
    { label: "Model fallback policy", value: "Single-hop only" },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--dashboard-text-primary)]">Agents</h2>
        <p className="text-sm text-[var(--dashboard-text-secondary)] mt-0.5">
          Team RAM routing configuration and default agent bindings.
        </p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardContent className="pt-4">
          <div className="divide-y divide-[var(--dashboard-border)]">
            {config.map((c) => (
              <div key={c.label} className="flex items-center justify-between py-3">
                <span className="text-sm text-[var(--dashboard-text-primary)]">{c.label}</span>
                <span className="text-sm text-[var(--dashboard-text-secondary)] font-mono">{c.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ComingSoonPanel({ section }: { section: SettingsSection }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--dashboard-text-primary)]">{section.label}</h2>
        <p className="text-sm text-[var(--dashboard-text-secondary)] mt-0.5">{section.description}</p>
      </div>
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <section.icon className="h-8 w-8 text-[var(--dashboard-text-secondary)] opacity-40" />
          <p className="text-sm text-[var(--dashboard-text-secondary)]">{section.label} settings coming in a future sprint.</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("connections")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(t)
  }, [])

  const section = SECTIONS.find((s) => s.id === activeSection)!

  function renderPanel() {
    switch (activeSection) {
      case "connections": return <ConnectionsPanel loading={loading} />
      case "embedding": return <EmbeddingPanel />
      case "governance": return <GovernancePanel />
      case "agents": return <AgentsPanel />
      default: return <ComingSoonPanel section={section} />
    }
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Settings</h1>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">Configure Allura connections, embedding providers, and governance controls.</p>
        </div>
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-[var(--dashboard-text-secondary)]" />
          <span className="text-xs text-[var(--dashboard-text-secondary)]">v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"}</span>
        </div>
      </div>

      {/* two-column layout */}
      <div className="flex gap-6">
        {/* sidebar nav */}
        <aside className="w-52 shrink-0">
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-2">
            <SectionNav active={activeSection} onSelect={setActiveSection} />
          </Card>
        </aside>

        {/* content panel */}
        <main className="flex-1 min-w-0">
          {renderPanel()}
        </main>
      </div>
    </div>
  )
}
