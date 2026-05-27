"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { DASHBOARD_GROUP_ID } from "@/lib/dashboard/api"

// ── Types ───────────────────────────────────────────────────────────────────

type Tab = "general" | "agents" | "memory" | "integrations" | "notifications" | "security"

const TABS: { value: Tab; label: string }[] = [
  { value: "general",       label: "General"       },
  { value: "agents",        label: "Agents"        },
  { value: "memory",        label: "Memory"        },
  { value: "integrations",  label: "Integrations"  },
  { value: "notifications", label: "Notifications" },
  { value: "security",      label: "Security"      },
]

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-[var(--dashboard-border)] pb-3 mb-0">
      <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{label}</h3>
    </div>
  )
}

function FormRow({
  label,
  children,
  last = false,
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-4",
        !last && "border-b border-[var(--dashboard-border)]",
      )}
    >
      <span className="text-sm text-[var(--dashboard-text-secondary)]">{label}</span>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  defaultOn = false,
  last = false,
}: {
  label: string
  defaultOn?: boolean
  last?: boolean
}) {
  const [on, setOn] = useState(defaultOn)
  return (
    <FormRow label={label} last={last}>
      <div className="flex items-center gap-2">
        <Switch checked={on} onCheckedChange={setOn} />
        <span className="text-xs text-[var(--dashboard-text-secondary)] w-8">{on ? "On" : "Off"}</span>
      </div>
    </FormRow>
  )
}

// ── Tab panels ───────────────────────────────────────────────────────────────

function GeneralPanel() {
  const [teamName, setTeamName] = useState("Team Durham")
  const [groupId, setGroupId] = useState(DASHBOARD_GROUP_ID)
  const [model, setModel] = useState("opus")

  return (
    <div className="space-y-0">
      {/* Workspace */}
      <SectionHeader label="Workspace" />
      <FormRow label="Team Name">
        <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} className="h-9 w-52 text-sm" />
      </FormRow>
      <FormRow label="Group ID">
        <Input value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9 w-52 text-sm font-mono" />
      </FormRow>
      <FormRow label="Default Agent Model">
        <Input value={model} onChange={(e) => setModel(e.target.value)} className="h-9 w-52 text-sm" />
      </FormRow>

      {/* Memory */}
      <div className="pt-6">
        <SectionHeader label="Memory" />
      </div>
      <FormRow label="PostgreSQL Retention">
        <Input defaultValue="90 days" className="h-9 w-52 text-sm" />
      </FormRow>
      <FormRow label="Neo4j Promotion Threshold">
        <Input defaultValue="0.85" className="h-9 w-52 text-sm" />
      </FormRow>
      <ToggleRow label="Auto-archive Old Events" defaultOn={true} />

      {/* Agents */}
      <div className="pt-6">
        <SectionHeader label="Agents" />
      </div>
      <FormRow label="Kotler (Orchestrator)">
        <div className="flex items-center gap-2">
          <Switch />
          <span className="text-xs text-[var(--dashboard-text-secondary)]">Active</span>
        </div>
      </FormRow>
      <FormRow label="Aaker (Strategist)">
        <div className="flex items-center gap-2">
          <Switch />
          <span className="text-xs text-[var(--dashboard-text-secondary)]">Active</span>
        </div>
      </FormRow>
      <FormRow label="Glaser (Visual)" last>
        <div className="flex items-center gap-2">
          <Switch />
          <span className="text-xs text-[var(--dashboard-text-secondary)]">Active</span>
        </div>
      </FormRow>
    </div>
  )
}

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-[var(--dashboard-text-secondary)]">
      {label} settings coming soon.
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general")

  return (
    <div className="space-y-6">
      {/* Horizontal tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--dashboard-border)] pb-0 -mb-px">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap",
              activeTab === tab.value
                ? "bg-[var(--dashboard-cta-primary)] text-white"
                : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content card */}
      <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6">
        {activeTab === "general"       && <GeneralPanel />}
        {activeTab === "agents"        && <PlaceholderPanel label="Agents" />}
        {activeTab === "memory"        && <PlaceholderPanel label="Memory" />}
        {activeTab === "integrations"  && <PlaceholderPanel label="Integrations" />}
        {activeTab === "notifications" && <PlaceholderPanel label="Notifications" />}
        {activeTab === "security"      && <PlaceholderPanel label="Security" />}
      </div>
    </div>
  )
}
