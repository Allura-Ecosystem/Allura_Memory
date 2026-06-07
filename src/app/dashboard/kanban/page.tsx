"use client"

import {
  CheckCircle,
  Flag,
  LayoutGrid,
  Moon,
  Network,
  Plus,
  Search,
  Shield,
} from "lucide-react"
import { useState } from "react"

type ColumnId = "todo" | "in-progress" | "review" | "completed"

interface KanbanTask {
  id: string
  title: string
  project: string
  tag: string
  avatar: string
  avatarColor: string
  date: string
  priority: "High" | "Medium" | "Low"
  icon: "moon" | "shield" | "network"
}

const columns: {
  id: ColumnId
  label: string
  dotColor: string
  count: number
  tasks: KanbanTask[]
}[] = [
  {
    id: "todo",
    label: "To Do",
    dotColor: "#9ca3af",
    count: 8,
    tasks: [
      { id: "t1", title: "Contradiction Scan", project: "Allura Memory", tag: "Analysis", avatar: "MC", avatarColor: "#2563eb", date: "Jun 8", priority: "High", icon: "moon" },
      { id: "t2", title: "Memory Consolidation", project: "Dream Runner", tag: "Batch", avatar: "DR", avatarColor: "#ea580c", date: "Jun 9", priority: "Medium", icon: "moon" },
      { id: "t3", title: "Agent Permission Update", project: "Governance", tag: "Contract", avatar: "GA", avatarColor: "#16a34a", date: "Jun 10", priority: "Low", icon: "shield" },
      { id: "t4", title: "Data Retention Policy Review", project: "Allura Ops", tag: "Policy", avatar: "AL", avatarColor: "#1a1a1a", date: "Jun 11", priority: "High", icon: "shield" },
    ],
  },
  {
    id: "in-progress",
    label: "In Progress",
    dotColor: "#2563eb",
    count: 5,
    tasks: [
      { id: "t5", title: "Duplicate Detection", project: "Dream Runner", tag: "Detection", avatar: "DR", avatarColor: "#ea580c", date: "Jun 7", priority: "High", icon: "moon" },
      { id: "t6", title: "Policy Gate Check", project: "Governance", tag: "Policy", avatar: "GA", avatarColor: "#16a34a", date: "Jun 7", priority: "Medium", icon: "shield" },
      { id: "t7", title: "Lineage Verification", project: "Allura Memory", tag: "Audit", avatar: "MC", avatarColor: "#2563eb", date: "Jun 6", priority: "High", icon: "network" },
      { id: "t8", title: "Evidence Chain Mapping", project: "Governance", tag: "Evidence", avatar: "GA", avatarColor: "#16a34a", date: "Jun 8", priority: "Medium", icon: "shield" },
    ],
  },
  {
    id: "review",
    label: "Review",
    dotColor: "#ea580c",
    count: 4,
    tasks: [
      { id: "t9", title: "New Memory Cluster Review", project: "Memory Curator", tag: "Review", avatar: "MC", avatarColor: "#2563eb", date: "Jun 6", priority: "High", icon: "moon" },
      { id: "t10", title: "Access Control Check", project: "Governance", tag: "Security", avatar: "GA", avatarColor: "#16a34a", date: "Jun 6", priority: "Medium", icon: "shield" },
      { id: "t11", title: "Governance Audit", project: "Allura Ops", tag: "Audit", avatar: "AL", avatarColor: "#1a1a1a", date: "Jun 5", priority: "High", icon: "shield" },
      { id: "t12", title: "Contradiction Review", project: "Dream Runner", tag: "Analysis", avatar: "DR", avatarColor: "#ea580c", date: "Jun 5", priority: "Low", icon: "moon" },
    ],
  },
  {
    id: "completed",
    label: "Completed",
    dotColor: "#16a34a",
    count: 12,
    tasks: [
      { id: "t13", title: "Promotion Finder Analysis", project: "Memory Curator", tag: "Analysis", avatar: "MC", avatarColor: "#2563eb", date: "Jun 4", priority: "Medium", icon: "moon" },
      { id: "t14", title: "Agent Boundary Review", project: "Governance", tag: "Contract", avatar: "GA", avatarColor: "#16a34a", date: "Jun 4", priority: "Low", icon: "shield" },
      { id: "t15", title: "Policy Exception Request", project: "Allura Ops", tag: "Policy", avatar: "AL", avatarColor: "#1a1a1a", date: "Jun 3", priority: "High", icon: "shield" },
      { id: "t16", title: "Session Deduplication", project: "Dream Runner", tag: "Batch", avatar: "DR", avatarColor: "#ea580c", date: "Jun 3", priority: "Medium", icon: "moon" },
    ],
  },
]

function PriorityFlag({ priority }: { priority: KanbanTask["priority"] }) {
  const colors: Record<KanbanTask["priority"], string> = {
    High: "#dc2626",
    Medium: "#ea580c",
    Low: "#16a34a",
  }
  return <Flag size={12} style={{ color: colors[priority] }} aria-label={`${priority} priority`} />
}

function TaskIcon({ icon }: { icon: KanbanTask["icon"] }) {
  if (icon === "moon") return <Moon size={12} style={{ color: "#ea580c" }} />
  if (icon === "shield") return <Shield size={12} style={{ color: "#2563eb" }} />
  return <Network size={12} style={{ color: "#7c3aed" }} />
}

export default function KanbanPage() {
  const [search, setSearch] = useState("")

  return (
    <div style={{ minHeight: "100vh", background: "#f5f1e6", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, padding: "32px 32px 100px" }}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "#d97706",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LayoutGrid size={18} style={{ color: "#fff" }} />
              </div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-0.02em" }}>
                Kanban Board
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
              Track and manage tasks across all Allura projects and agents.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontSize: 13,
                fontWeight: 500,
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Board Settings
            </button>
            <button
              type="button"
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontSize: 16,
                color: "#6b7280",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="More options"
            >
              ···
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
          {["All Projects", "All Assignees", "All Priorities"].map((filter) => (
            <button
              key={filter}
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 12px",
                borderRadius: 7,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontSize: 13,
                color: "#374151",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {filter}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 7,
              border: "1px solid #e5e7eb",
              background: "#fff",
              flex: 1,
              minWidth: 160,
              maxWidth: 240,
            }}
          >
            <Search size={13} style={{ color: "#9ca3af", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: 13,
                color: "#374151",
                background: "transparent",
                width: "100%",
                fontFamily: "inherit",
              }}
              aria-label="Search tasks"
            />
          </div>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            {["grid", "list", "chart"].map((view) => (
              <button
                key={view}
                type="button"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: view === "grid" ? "#eff6ff" : "#fff",
                  color: view === "grid" ? "#2563eb" : "#9ca3af",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                }}
                aria-label={`${view} view`}
              >
                {view === "grid" && <LayoutGrid size={14} />}
                {view === "list" && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
                {view === "chart" && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <rect x="1" y="8" width="3" height="5" fill="currentColor" rx="1" />
                    <rect x="5.5" y="5" width="3" height="8" fill="currentColor" rx="1" />
                    <rect x="10" y="2" width="3" height="11" fill="currentColor" rx="1" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Kanban grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, alignItems: "start" }}>
          {columns.map((col) => {
            const filteredTasks = col.tasks.filter(
              (t) =>
                search === "" ||
                t.title.toLowerCase().includes(search.toLowerCase()) ||
                t.project.toLowerCase().includes(search.toLowerCase())
            )
            return (
              <div key={col.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Column header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 4px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {col.id === "completed" ? (
                      <CheckCircle size={14} style={{ color: col.dotColor }} />
                    ) : (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: col.dotColor,
                          display: "inline-block",
                        }}
                      />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{col.label}</span>
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 10,
                        background: "#f3f4f6",
                        color: "#6b7280",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {col.count}
                    </span>
                  </div>
                  <button
                    type="button"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "1.5px solid #d1d5db",
                      background: "transparent",
                      color: "#9ca3af",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-label={`Add task to ${col.label}`}
                  >
                    <Plus size={11} />
                  </button>
                </div>

                {/* Task cards */}
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      background: "#fff",
                      borderRadius: 12,
                      border: "1px solid #e8e3d8",
                      padding: 14,
                      cursor: "grab",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {/* Top row: icon + title */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                      <span style={{ marginTop: 2, flexShrink: 0 }}>
                        <TaskIcon icon={task.icon} />
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3 }}>
                        {task.title}
                      </span>
                    </div>

                    {/* Project + tag */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{task.project}</span>
                      <span
                        style={{
                          padding: "1px 7px",
                          borderRadius: 10,
                          background: "#f3f4f6",
                          color: "#374151",
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {task.tag}
                      </span>
                    </div>

                    {/* Bottom row: avatar + date + priority */}
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: task.avatarColor,
                          color: "#fff",
                          fontSize: 9,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                        aria-label={task.avatar}
                      >
                        {task.avatar}
                      </div>
                      <span style={{ fontSize: 11, color: "#9ca3af", flex: 1 }}>{task.date}</span>
                      <PriorityFlag priority={task.priority} />
                    </div>
                  </div>
                ))}

                {/* Add task button */}
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1.5px dashed #d1d5db",
                    background: "transparent",
                    color: "#9ca3af",
                    fontSize: 13,
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  <Plus size={13} />
                  Add Task
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Stats bar */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          border: "1px solid #e8e3d8",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          zIndex: 10,
          whiteSpace: "nowrap",
        }}
        role="status"
        aria-label="Board statistics"
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151" }}>
          <Network size={14} style={{ color: "#2563eb" }} />
          <strong>29</strong> Total Tasks
        </span>
        <span style={{ width: 1, height: 16, background: "#e8e3d8" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1v3M7 10v3M1 7h3M10 7h3M3 3l2 2M9 9l2 2M3 11l2-2M9 5l2-2" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <strong>5</strong> In Progress
        </span>
        <span style={{ width: 1, height: 16, background: "#e8e3d8" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151" }}>
          <Moon size={14} style={{ color: "#ea580c" }} />
          <strong>4</strong> In Review
        </span>
        <span style={{ width: 1, height: 16, background: "#e8e3d8" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151" }}>
          <CheckCircle size={14} style={{ color: "#16a34a" }} />
          <strong>12</strong> Completed
        </span>
        <span style={{ width: 1, height: 16, background: "#e8e3d8" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151" }}>
          <Flag size={14} style={{ color: "#dc2626" }} />
          <strong>8</strong> Overdue
        </span>
      </div>
    </div>
  )
}
