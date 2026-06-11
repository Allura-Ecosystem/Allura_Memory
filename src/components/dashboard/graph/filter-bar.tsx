"use client"

import type { EntityType } from "./node-card"

export type FilterType = EntityType | "all"

interface FilterOption {
  value: FilterType
  label: string
  dotColor: string
}

const FILTERS: FilterOption[] = [
  { value: "all",     label: "All",      dotColor: "var(--allura-charcoal)" },
  { value: "person",  label: "People",   dotColor: "var(--allura-blue)" },
  { value: "org",     label: "Orgs",     dotColor: "var(--allura-orange)" },
  { value: "memory",  label: "Memories", dotColor: "var(--allura-green)" },
  { value: "agent",   label: "Agents",   dotColor: "#7C3AED" },
  { value: "project", label: "Projects", dotColor: "var(--allura-gold)" },
]

interface FilterBarProps {
  active: FilterType
  onChange: (value: FilterType) => void
}

export function FilterBar({ active, onChange }: FilterBarProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        alignItems: "center",
        flexWrap: "wrap",
      }}
      role="group"
      aria-label="Filter by entity type"
    >
      {FILTERS.map((f) => {
        const isActive = active === f.value
        return (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            aria-pressed={isActive}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: 500,
              fontFamily: '"IBM Plex Sans", sans-serif',
              cursor: "pointer",
              transition: "all .15s",
              border: isActive
                ? "1px solid var(--allura-blue)"
                : "1px solid var(--dashboard-border)",
              background: isActive ? "var(--allura-blue)" : "var(--allura-paper)",
              color: isActive ? "#fff" : "var(--allura-charcoal)",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: isActive ? "#fff" : f.dotColor,
                flexShrink: 0,
              }}
            />
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
