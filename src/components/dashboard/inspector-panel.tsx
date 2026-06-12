"use client"

import { X } from "lucide-react"

import { useInspector } from "./inspector-context"
import type { InspectorView } from "./inspector-context"

// ─── Entity-type metadata ────────────────────────────────────────────────────

const ENTITY_LABELS: Record<InspectorView, string> = {
  run: "Run",
  "work-item": "Work Item",
  project: "Project",
  evidence: "Evidence",
  handoff: "Handoff",
  memory: "Memory",
}

const ENTITY_COLORS: Record<InspectorView, string> = {
  run: "var(--allura-blue)",
  "work-item": "var(--allura-orange)",
  project: "var(--allura-green)",
  evidence: "var(--allura-gold)",
  handoff: "var(--allura-gray-500)",
  memory: "var(--allura-blue)",
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InspectorPanel() {
  const { isOpen, entity, close } = useInspector()

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="inspector-backdrop"
          aria-hidden="true"
          onClick={close}
        />
      )}

      <aside
        className={`inspector-panel${isOpen ? " inspector-panel--open" : ""}`}
        aria-label="Inspector"
        aria-hidden={!isOpen}
        role="complementary"
      >
        {/* Header */}
        <div className="inspector-panel__header">
          <div className="inspector-panel__title">
            {entity ? (
              <>
                <span
                  className="inspector-panel__type-badge"
                  style={{ color: ENTITY_COLORS[entity.type] }}
                >
                  {ENTITY_LABELS[entity.type]}
                </span>
                {entity.label && (
                  <span className="inspector-panel__entity-label">{entity.label}</span>
                )}
              </>
            ) : (
              <span className="inspector-panel__type-badge" style={{ color: "var(--allura-gray-500)" }}>
                Inspector
              </span>
            )}
          </div>
          <button
            className="inspector-panel__close"
            onClick={close}
            aria-label="Close inspector"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="inspector-panel__body">
          {entity ? (
            <EntityPlaceholder type={entity.type} id={entity.id} />
          ) : (
            <EmptyState />
          )}
        </div>
      </aside>
    </>
  )
}

// ─── Placeholder content (replaced by entity-specific views in later stories) ─

function EntityPlaceholder({ type, id }: { type: InspectorView; id: string }) {
  const color = ENTITY_COLORS[type]
  const label = ENTITY_LABELS[type]

  return (
    <div className="inspector-placeholder">
      <div
        className="inspector-placeholder__icon"
        style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
        aria-hidden="true"
      >
        {label[0].toUpperCase()}
      </div>
      <p className="inspector-placeholder__type">{label}</p>
      <code className="inspector-placeholder__id">{id}</code>
      <p className="inspector-placeholder__hint">
        Detailed view for this {label.toLowerCase()} will be available in a future release.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="inspector-empty">
      <p className="inspector-empty__text">
        Select an item in the list to inspect its details here.
      </p>
    </div>
  )
}
