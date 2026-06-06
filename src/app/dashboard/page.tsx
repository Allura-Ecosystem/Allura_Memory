"use client"

import {
  Globe,
  LayoutGrid,
  MessageCircle,
  Moon,
  Network,
  Plus,
  Send,
  Shield,
  Sparkles,
  Star,
  Users,
} from "lucide-react"
import Link from "next/link"
import type { ComponentType, CSSProperties } from "react"

interface AgentCardData {
  title: string
  description: string
  href: string
  iconBg: string
  icon: ComponentType<{ size?: number; style?: CSSProperties }>
}

const agentCards: AgentCardData[] = [
  {
    title: "Memory Curator",
    description: "Promote episodic notes into semantic memory.",
    href: "/dashboard/curator",
    iconBg: "#2563eb",
    icon: Network,
  },
  {
    title: "Dream Runner",
    description: "Run consolidation, duplicate detection, and contradiction scans.",
    href: "/dashboard/dreams",
    iconBg: "#ea580c",
    icon: Moon,
  },
  {
    title: "Governance Auditor",
    description: "Check lineage, policy gates, and evidence chains.",
    href: "/dashboard/governance",
    iconBg: "#2563eb",
    icon: Shield,
  },
  {
    title: "Agent Contracts",
    description: "Review agent permissions and boundaries.",
    href: "/dashboard/agents",
    iconBg: "#16a34a",
    icon: Users,
  },
  {
    title: "Kanban Planner",
    description: "Plan and track work across your projects.",
    href: "/dashboard/kanban",
    iconBg: "#d97706",
    icon: LayoutGrid,
  },
  {
    title: "Insight Finder",
    description: "Surface patterns and recommend next steps.",
    href: "/dashboard/insights",
    iconBg: "#16a34a",
    icon: Sparkles,
  },
]

const agentPills = [
  { label: "Aion CLI", active: true },
  { label: "MC", color: "#2563eb" },
  { label: "DR", color: "#ea580c" },
  { label: "GA", color: "#16a34a" },
  { label: "AC", color: "#d97706" },
  { label: "KP", color: "#7c3aed" },
  { label: "IF", color: "#0891b2" },
]

export default function DashboardHomePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px 32px",
        background: "#f5f1e6",
      }}
    >
      {/* Header */}
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "#1a1a1a",
          margin: "0 0 8px",
          textAlign: "center",
          letterSpacing: "-0.02em",
        }}
      >
        Hi, what&apos;s your plan for today?
      </h1>

      {/* Agent picker */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 24,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {agentPills.map((pill) => {
          if (pill.active) {
            return (
              <button
                key={pill.label}
                type="button"
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "none",
                  background: "#1a1a1a",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {pill.label}
              </button>
            )
          }
          return (
            <button
              key={pill.label}
              type="button"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: pill.color ?? "#6b7280",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {pill.label}
            </button>
          )
        })}
        <button
          type="button"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "1.5px dashed #d1d5db",
            background: "transparent",
            color: "#9ca3af",
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-label="Add agent"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Chat textarea card */}
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
          border: "1px solid #e8e3d8",
          marginBottom: 32,
          overflow: "hidden",
        }}
      >
        <textarea
          placeholder="Send a message, upload files, open a folder, or create a scheduled task..."
          style={{
            width: "100%",
            minHeight: 96,
            padding: "16px 16px 0",
            border: "none",
            outline: "none",
            resize: "none",
            fontSize: 14,
            color: "#374151",
            background: "transparent",
            fontFamily: "inherit",
          }}
          aria-label="Message input"
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderTop: "1px solid #f3f4f6",
          }}
        >
          <button
            type="button"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#2563eb",
              border: "none",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="Attach"
          >
            <Plus size={14} />
          </button>

          {[
            { label: "Scope: Allura Memory" },
            { label: "Default Model" },
            { label: "Full Access" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                fontSize: 12,
                color: "#374151",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}

          <div style={{ flex: 1 }} />

          <button
            type="button"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#2563eb",
              border: "none",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      {/* Subtitle */}
      <p
        style={{
          fontSize: 13,
          color: "#6b7280",
          margin: "0 0 20px",
          textAlign: "center",
        }}
      >
        Select an assistant to start a task
      </p>

      {/* Agent cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          width: "100%",
          maxWidth: 680,
          marginBottom: 40,
        }}
      >
        {agentCards.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.href}
              href={card.href}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 16,
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e8e3d8",
                textDecoration: "none",
                transition: "box-shadow 0.15s",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: card.iconBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={18} style={{ color: "#fff" }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 3, lineHeight: 1.2 }}>
                  {card.title}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
                  {card.description}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Bottom secondary nav */}
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        {[MessageCircle, Star, Globe].map((Icon, i) => (
          <button
            key={i}
            type="button"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid #e8e3d8",
              background: "#fff",
              color: "#9ca3af",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>
    </div>
  )
}
