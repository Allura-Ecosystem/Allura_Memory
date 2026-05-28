import { loadGraph } from "@/lib/dashboard/queries"
import type { GraphNodeType } from "@/lib/dashboard/types"

// ── Data-vis color exception ────────────────────────────────────────────────
// Node type colors are hardcoded per Figma spec because they encode semantic
// meaning in a dark canvas context where CSS custom properties cannot be
// resolved by SVG stroke attributes. Token aliases would require JS-side
// resolution anyway (no Tailwind utility spans a full hex for arbitrary SVG).
// Documented as DD-graph-001.
const NODE_COLORS: Record<GraphNodeType, string> = {
  system:   "#1d4ed8", // blue  — Allura Brain / system
  event:    "#b45309", // amber — Events
  outcome:  "#dc2626", // red   — Decisions / outcomes
  agent:    "#16a34a", // green — Agents
  insight:  "#2563eb", // blue  — Insights (lighter)
  memory:   "#dc2626", // red   — Memory
  evidence: "#b45309", // gold  — Tasks / evidence
  project:  "#b45309", // gold  — Projects (same as evidence)
}

// Node diameter in px (used for positioning and SVG edge endpoints)
const NODE_SIZES: Record<GraphNodeType, number> = {
  system:   80,
  event:    64,
  outcome:  64,
  agent:    64,
  insight:  64,
  memory:   64,
  evidence: 64,
  project:  64,
}

// Static canvas layout — positions expressed as [left%, top%] within the canvas.
// Matches the Figma spec for a 1200×700 canvas.
type StaticCluster = {
  type: GraphNodeType
  label: string
  left: number // percent
  top: number  // percent
}

const STATIC_CLUSTERS: StaticCluster[] = [
  { type: "system",   label: "Allura Brain", left: 50, top: 55 },
  { type: "event",    label: "Events",       left: 38, top: 30 },
  { type: "outcome",  label: "Decisions",    left: 75, top: 30 },
  { type: "agent",    label: "Agents",       left: 32, top: 58 },
  { type: "insight",  label: "Insights",     left: 82, top: 58 },
  { type: "evidence", label: "Tasks",        left: 44, top: 78 },
  { type: "memory",   label: "Memory",       left: 72, top: 78 },
]

// Edges between static clusters (by index into STATIC_CLUSTERS)
// Brain = 0, Events = 1, Decisions = 2, Agents = 3, Insights = 4, Tasks = 5, Memory = 6
const STATIC_EDGES: Array<[number, number]> = [
  [0, 1], // Brain ↔ Events
  [0, 2], // Brain ↔ Decisions
  [0, 3], // Brain ↔ Agents
  [0, 4], // Brain ↔ Insights
  [0, 5], // Brain ↔ Tasks
  [0, 6], // Brain ↔ Memory
  [1, 2], // Events ↔ Decisions
  [3, 4], // Agents ↔ Insights
]

// Fixed starfield dot positions [left%, top%] — pseudo-random but deterministic
const STARFIELD_DOTS: Array<[number, number]> = [
  [3, 8], [8, 18], [14, 5], [20, 92], [6, 72],
  [88, 12], [94, 28], [91, 65], [97, 82], [85, 90],
  [22, 14], [30, 88], [68, 6], [75, 93], [48, 4],
  [60, 96], [10, 45], [90, 48], [35, 3], [55, 97],
]

export default async function GraphPage() {
  // Server-side data load — fall back gracefully on error
  const graphResult = await loadGraph("allura-system")
  const nodes = graphResult.data?.nodes ?? []

  // Count nodes per type for enriched labels
  const countByType = nodes.reduce<Partial<Record<GraphNodeType, number>>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1
    return acc
  }, {})

  // Build display labels with counts when data is available
  const clusters = STATIC_CLUSTERS.map((cluster) => {
    const count = countByType[cluster.type]
    const label = count != null && count > 0 ? `${cluster.label} (${count})` : cluster.label
    return { ...cluster, displayLabel: label }
  })

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Page title — sits on the cream sidebar background above the canvas */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--allura-charcoal)]">Memory Graph</h1>
        <p className="text-sm text-[var(--allura-text-2)] mt-1">
          Knowledge graph — nodes and relationships across your memory system
        </p>
      </div>

      {/* Dark canvas — takes remaining height */}
      <div
        className="relative flex-1 rounded-xl overflow-hidden"
        style={{ backgroundColor: "#0a0a0a", minHeight: "600px" }}
      >
        {/* Starfield dots */}
        {STARFIELD_DOTS.map(([left, top], i) => (
          <span
            key={i}
            className="absolute size-1 rounded-full"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              backgroundColor: "rgba(255,255,255,0.4)",
            }}
          />
        ))}

        {/* SVG edge overlay — drawn behind nodes */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          {STATIC_EDGES.map(([aIdx, bIdx], i) => {
            const a = clusters[aIdx]
            const b = clusters[bIdx]
            // Convert percent positions to "%" string for SVG — SVG supports % in x/y
            return (
              <line
                key={i}
                x1={`${a.left}%`}
                y1={`${a.top}%`}
                x2={`${b.left}%`}
                y2={`${b.top}%`}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )
          })}
        </svg>

        {/* Node circles — absolutely positioned */}
        {clusters.map((cluster) => {
          const size = NODE_SIZES[cluster.type]
          const color = NODE_COLORS[cluster.type]
          return (
            <div
              key={cluster.type}
              className="absolute flex items-center justify-center rounded-full text-white text-center"
              style={{
                width: size,
                height: size,
                backgroundColor: color,
                left: `${cluster.left}%`,
                top: `${cluster.top}%`,
                transform: "translate(-50%, -50%)",
                fontSize: "10px",
                fontWeight: 500,
                lineHeight: "1.2",
                padding: "4px",
                boxShadow: `0 0 0 2px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.4)`,
              }}
            >
              {cluster.displayLabel}
            </div>
          )
        })}

        {/* Graph Controls overlay card — top-left inside canvas */}
        <div
          className="absolute top-4 left-4 rounded-xl bg-white shadow-lg p-4"
          style={{ width: "200px", zIndex: 10 }}
        >
          <p className="text-sm font-semibold text-[var(--allura-charcoal)] mb-3">
            Graph Controls
          </p>
          <ul className="flex flex-col gap-2">
            {(["Zoom In", "Zoom Out", "Reset View", "Filter Nodes"] as const).map(
              (action) => (
                <li key={action}>
                  <button
                    type="button"
                    className="w-full text-left text-xs text-[var(--allura-charcoal)] hover:text-[var(--allura-blue)] transition-colors py-1 px-2 rounded hover:bg-[var(--allura-blue-8)]"
                  >
                    {action}
                  </button>
                </li>
              )
            )}
          </ul>

          {/* Degraded state indicator */}
          {graphResult.degraded && (
            <p className="mt-3 text-[10px] text-[var(--allura-text-2)]">
              Live data unavailable — showing static layout
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
