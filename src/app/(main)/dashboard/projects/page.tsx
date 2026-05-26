"use client"

import { CheckCircle2, Circle, Clock, GitBranch, Layers, RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// ─── static sprint data (sourced from _bmad/bmm/stories/sprint-status.yaml) ──

interface Story {
  id: string
  title: string
  status: "done" | "in-progress" | "review" | "ready-for-dev" | "backlog"
}

interface Epic {
  id: string
  title: string
  status: "done" | "in-progress" | "backlog"
  stories: Story[]
}

const EPICS: Epic[] = [
  {
    id: "epic-1",
    title: "Persistent Knowledge Capture",
    status: "done",
    stories: [
      { id: "1-1", title: "Verify group scope enforcement baseline", status: "done" },
      { id: "1-2", title: "Harden Team RAM source of truth and routing contracts", status: "done" },
      { id: "1-3", title: "Create BMAD sprint status and story lifecycle gate", status: "done" },
      { id: "1-4", title: "Add Allura drift gate to story readiness", status: "done" },
      { id: "1-5", title: "Define review and validation evidence packets", status: "done" },
    ],
  },
  {
    id: "epic-2",
    title: "Memory Retrieval & Search",
    status: "done",
    stories: [
      { id: "2-1", title: "RuVector hybrid search (vector + BM25 RRF)", status: "done" },
      { id: "2-2", title: "Memory API schema hardening", status: "done" },
      { id: "2-3", title: "Dashboard empty and degraded states", status: "done" },
      { id: "2-4", title: "Preserve Allura separation and cutover boundaries", status: "done" },
    ],
  },
  {
    id: "epic-3",
    title: "Memory Space Dashboard",
    status: "done",
    stories: [
      { id: "3-1", title: "Scoped memory search and listing", status: "done" },
      { id: "3-2", title: "Memory detail and evidence chain", status: "done" },
      { id: "3-3", title: "Preserve provenance on copy", status: "done" },
    ],
  },
  {
    id: "epic-4",
    title: "Curator & HITL Pipeline",
    status: "done",
    stories: [
      { id: "4-1", title: "Curator proposal scoring engine", status: "done" },
      { id: "4-2", title: "HITL promotion lock policy", status: "done" },
      { id: "4-3", title: "Approval audit trail", status: "done" },
    ],
  },
  {
    id: "epic-5",
    title: "Mission Control Cutover",
    status: "in-progress",
    stories: [
      { id: "5-1", title: "Governed dashboard and Team RAM contracts", status: "done" },
      { id: "5-2", title: "Governance log page", status: "done" },
      { id: "5-3", title: "Cutover gate verification (3100→6420)", status: "in-progress" },
      { id: "5-4", title: "Team RAM retrospective and closeout", status: "done" },
    ],
  },
]

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  done: { label: "Done", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500" },
  "in-progress": { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  review: { label: "Review", color: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  "ready-for-dev": { label: "Ready", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-400" },
  backlog: { label: "Backlog", color: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-300" },
}

function StoryRow({ story }: { story: Story }) {
  const cfg = STATUS_CONFIG[story.status]
  const isDone = story.status === "done"
  const isActive = story.status === "in-progress"
  return (
    <div className="flex items-center justify-between py-2.5 px-4 border-b border-[var(--dashboard-border)] last:border-0 hover:bg-[var(--dashboard-hover)] transition-colors">
      <div className="flex items-center gap-3">
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        ) : isActive ? (
          <RefreshCw className="h-4 w-4 text-blue-500 shrink-0 animate-spin" style={{ animationDuration: "3s" }} />
        ) : (
          <Circle className="h-4 w-4 text-[var(--dashboard-text-secondary)] opacity-40 shrink-0" />
        )}
        <span
          className={cn(
            "text-sm",
            isDone
              ? "text-[var(--dashboard-text-secondary)] line-through"
              : "text-[var(--dashboard-text-primary)]"
          )}
        >
          {story.title}
        </span>
      </div>
      <Badge variant="outline" className={cn("text-xs shrink-0 ml-4", cfg.color)}>
        {cfg.label}
      </Badge>
    </div>
  )
}

function EpicCard({ epic }: { epic: Epic }) {
  const cfg = STATUS_CONFIG[epic.status]
  const doneCount = epic.stories.filter((s) => s.status === "done").length
  const total = epic.stories.length
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  return (
    <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("h-2 w-2 rounded-full shrink-0", cfg.dot)} />
            <CardTitle className="text-sm font-semibold text-[var(--dashboard-text-primary)]">
              {epic.id.toUpperCase()} — {epic.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-[var(--dashboard-text-secondary)]">
              {doneCount}/{total}
            </span>
            <Badge variant="outline" className={cn("text-xs", cfg.color)}>
              {cfg.label}
            </Badge>
          </div>
        </div>
        {/* progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-[var(--dashboard-border)]">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              epic.status === "done" ? "bg-green-500" : "bg-[var(--dashboard-cta-primary)]"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-2">
        {epic.stories.map((s) => (
          <StoryRow key={s.id} story={s} />
        ))}
      </CardContent>
    </Card>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const allStories = EPICS.flatMap((e) => e.stories)
  const totalStories = allStories.length
  const doneStories = allStories.filter((s) => s.status === "done").length
  const activeEpics = EPICS.filter((e) => e.status === "in-progress").length
  const doneEpics = EPICS.filter((e) => e.status === "done").length

  const metrics = [
    { label: "Total Epics", value: String(EPICS.length), icon: Layers },
    { label: "Epics Done", value: String(doneEpics), icon: CheckCircle2 },
    { label: "Active Epics", value: String(activeEpics), icon: RefreshCw },
    { label: "Stories Done", value: `${doneStories}/${totalStories}`, icon: Clock },
  ]

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Projects</h1>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            Allura Memory — BMAD sprint board
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--dashboard-text-secondary)]">
          <GitBranch className="h-4 w-4" />
          <span>dashboard-memory-space</span>
        </div>
      </div>

      {/* summary strip */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <Card key={m.label} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-[var(--dashboard-text-secondary)]" />
                  <span className="text-xs text-[var(--dashboard-text-secondary)]">{m.label}</span>
                </div>
                <p className="text-2xl font-bold text-[var(--dashboard-text-primary)]">{m.value}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* epic cards */}
      <div className="space-y-4">
        {EPICS.map((epic) => (
          <EpicCard key={epic.id} epic={epic} />
        ))}
      </div>

      <p className="text-xs text-[var(--dashboard-text-secondary)] text-center pt-2">
        Canonical tracking: Notion Work Board — this view reads from{" "}
        <code className="font-mono">_bmad/bmm/stories/sprint-status.yaml</code>
      </p>
    </div>
  )
}
