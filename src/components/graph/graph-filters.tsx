"use client"

import type { ReactElement, ReactNode } from "react"
import type { NodeCategory, EdgeRelationship, NodeStatus, RiskLevel } from "@/lib/graph/types"
import { CATEGORY_STYLES } from "@/lib/graph/types"

export interface GraphFilters {
  categories: Set<NodeCategory>
  statuses: Set<NodeStatus>
  riskLevels: Set<RiskLevel>
  relationships: Set<EdgeRelationship>
}

export function defaultFilters(): GraphFilters {
  return {
    categories: new Set<NodeCategory>(),
    statuses: new Set<NodeStatus>(),
    riskLevels: new Set<RiskLevel>(),
    relationships: new Set<EdgeRelationship>(),
  }
}

const ALL_CATEGORIES: NodeCategory[] = [
  "platform", "security", "memory", "agent", "policy", "audit", "ops", "methodology", "risk", "doc",
]

const ALL_STATUSES: NodeStatus[] = [
  "built", "in_progress", "planned", "proposed", "blocked", "deprecated",
]

const ALL_RISKS: RiskLevel[] = ["low", "medium", "high", "critical"]

interface Props {
  filters: GraphFilters
  onChange: (next: GraphFilters) => void
  availableCategories: Set<NodeCategory>
}

function toggle<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set)
  if (next.has(item)) next.delete(item)
  else next.add(item)
  return next
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--c-muted, #6b6e73)",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active: boolean
  color?: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 6px",
        border: "none",
        background: "transparent",
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: "var(--sans, 'IBM Plex Sans', sans-serif)",
        textAlign: "left",
        opacity: active ? 1 : 0.6,
        transition: "opacity 0.12s",
        width: "100%",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--c-bg, #f6f3ec)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <span
        style={{
          width: 11,
          height: 11,
          borderRadius: 3,
          background: color ?? "var(--c-muted, #6b6e73)",
          flexShrink: 0,
          opacity: active ? 1 : 0.5,
        }}
        aria-hidden="true"
      />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--c-ink, #1b1d21)" }}>
        {label}
      </span>
    </button>
  )
}

export function GraphFiltersPanel({ filters, onChange, availableCategories }: Props): ReactElement {
  const hasAnyFilter =
    filters.categories.size > 0 ||
    filters.statuses.size > 0 ||
    filters.riskLevels.size > 0

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        fontFamily: "var(--sans, 'IBM Plex Sans', sans-serif)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--c-muted, #6b6e73)",
          }}
        >
          Show categories
        </span>
        {hasAnyFilter && (
          <button
            onClick={() => onChange(defaultFilters())}
            style={{
              fontSize: 11,
              color: "var(--c-orange, #f2752e)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--sans, 'IBM Plex Sans', sans-serif)",
              padding: 0,
              fontWeight: 600,
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Category filter */}
      <Section title="Type">
        {ALL_CATEGORIES.filter((c) => availableCategories.has(c)).map((cat) => {
          const s = CATEGORY_STYLES[cat]
          return (
            <FilterChip
              key={cat}
              label={s.label}
              active={filters.categories.has(cat)}
              color={s.accent}
              onClick={() =>
                onChange({ ...filters, categories: toggle(filters.categories, cat) })
              }
            />
          )
        })}
      </Section>

      {/* Status filter */}
      <Section title="Status">
        {ALL_STATUSES.map((status) => (
          <FilterChip
            key={status}
            label={status.replace("_", " ")}
            active={filters.statuses.has(status)}
            onClick={() =>
              onChange({ ...filters, statuses: toggle(filters.statuses, status) })
            }
          />
        ))}
      </Section>

      {/* Risk filter */}
      <Section title="Risk">
        {ALL_RISKS.map((level) => (
          <FilterChip
            key={level}
            label={level}
            active={filters.riskLevels.has(level)}
            onClick={() =>
              onChange({ ...filters, riskLevels: toggle(filters.riskLevels, level) })
            }
          />
        ))}
      </Section>
    </div>
  )
}
