"use client"

import { lazy, Suspense } from "react"
import { X } from "lucide-react"

import { useInspector } from "./inspector-context"
import type { InspectorView } from "./inspector-context"

// ── Lazy-loaded entity views ──────────────────────────────────────────────────

const RunView       = lazy(() => import("./inspector-views/run-view").then((m) => ({ default: m.RunView })))
const WorkItemView  = lazy(() => import("./inspector-views/work-item-view").then((m) => ({ default: m.WorkItemView })))
const ProjectView   = lazy(() => import("./inspector-views/project-view").then((m) => ({ default: m.ProjectView })))
const EvidenceView  = lazy(() => import("./inspector-views/evidence-view").then((m) => ({ default: m.EvidenceView })))
const HandoffView   = lazy(() => import("./inspector-views/handoff-view").then((m) => ({ default: m.HandoffView })))
const MemoryView    = lazy(() => import("./inspector-views/memory-view").then((m) => ({ default: m.MemoryView })))

// ── Entity-type metadata ──────────────────────────────────────────────────────

const ENTITY_LABELS: Record<InspectorView, string> = {
  run:         "Run",
  "work-item": "Work Item",
  project:     "Project",
  evidence:    "Evidence",
  handoff:     "Handoff",
  memory:      "Memory",
}

const ENTITY_COLORS: Record<InspectorView, string> = {
  run:         "var(--allura-blue)",
  "work-item": "var(--allura-orange)",
  project:     "var(--allura-green)",
  evidence:    "var(--allura-gold)",
  handoff:     "var(--allura-gray-500)",
  memory:      "var(--allura-blue)",
}

// ── Fallback skeleton shown while the view chunk loads ────────────────────────

function ViewLoadingSkeleton() {
  return (
    <div style={{ padding: "var(--allura-lg)" }} aria-busy="true" aria-label="Loading">
      {[80, 60, 100, 70, 90].map((w, i) => (
        <div
          key={i}
          style={{
            height: "14px",
            width: `${w}%`,
            borderRadius: "var(--allura-r-sm)",
            background: "var(--allura-gray-100, #f3f4f6)",
            marginBottom: "var(--allura-md)",
          }}
        />
      ))}
    </div>
  )
}

// ── Entity view router ────────────────────────────────────────────────────────

function EntityView({ type, id }: { type: InspectorView; id: string }) {
  return (
    <Suspense fallback={<ViewLoadingSkeleton />}>
      {type === "run"       && <RunView       entityId={id} />}
      {type === "work-item" && <WorkItemView  entityId={id} />}
      {type === "project"   && <ProjectView   entityId={id} />}
      {type === "evidence"  && <EvidenceView  entityId={id} />}
      {type === "handoff"   && <HandoffView   entityId={id} />}
      {type === "memory"    && <MemoryView    entityId={id} />}
    </Suspense>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

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
            <EntityView type={entity.type} id={entity.id} />
          ) : (
            <EmptyState />
          )}
        </div>
      </aside>
    </>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="inspector-empty">
      <p className="inspector-empty__text">
        Select an item in the list to inspect its details here.
      </p>
    </div>
  )
}
