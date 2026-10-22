"use client"

import { type KeyboardEvent, type PointerEvent, useEffect, useId, useMemo, useRef, useState } from "react"
import type { KnowledgeGraph, KnowledgeNode } from "@/lib/dashboard/read-model"
import styles from "./knowledge-graph.module.css"

interface Point { x: number; y: number }
const WIDTH = 1000
const HEIGHT = 700
const INITIAL_VIEW = { x: 0, y: 0, scale: 1 }

/** Layout is for legibility only. Distance never represents semantic similarity. */
function positionNodes(nodes: KnowledgeNode[]): Map<string, Point> {
  const points = new Map<string, Point>()
  nodes.forEach((node, index) => {
    if (nodes.length === 1) {
      points.set(node.id, { x: WIDTH / 2, y: HEIGHT / 2 })
      return
    }
    const ring = index < 8 ? 0 : index < 24 ? 1 : 2
    const start = ring === 0 ? 0 : ring === 1 ? 8 : 24
    const capacity = ring === 0 ? 8 : ring === 1 ? 16 : 26
    const count = Math.min(capacity, nodes.length - start)
    const angle = ((index - start) / count) * Math.PI * 2 - Math.PI / 2 + ring * .12
    const radius = nodes.length <= 8 ? 210 : [105, 205, 295][ring]
    points.set(node.id, { x: WIDTH / 2 + Math.cos(angle) * radius * 1.2, y: HEIGHT / 2 + Math.sin(angle) * radius })
  })
  return points
}
function shortLabel(label: string): string { return label.length > 27 ? `${label.slice(0, 26)}…` : label }

export function KnowledgeGraphView({ data }: { data: KnowledgeGraph }): React.ReactElement {
  const uid = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeRefs = useRef(new Map<string, SVGGElement>())
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(data.focusNodeId)
  const [mode, setMode] = useState<"graph" | "list">("graph")
  const initialLayoutChosen = useRef(false)
  const userChoseMode = useRef(false)
  function chooseMode(next: "graph" | "list"): void {
    userChoseMode.current = true
    setMode(next)
  }
  const [relationship, setRelationship] = useState("")
  const [neighborhood, setNeighborhood] = useState(false)
  const [view, setView] = useState(INITIAL_VIEW)
  const [canvasSize, setCanvasSize] = useState({ width: WIDTH, height: HEIGHT })
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // SVG world coordinates stay stable for pan/zoom. Compensate node marks and
  // labels for the actual viewport scale, so they remain usable on a phone.
  useEffect(() => {
    const canvas = svgRef.current
    if (!canvas || typeof ResizeObserver === "undefined") return
    const measure = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (width > 0 && height > 0) {
        setCanvasSize(prior => prior.width === width && prior.height === height ? prior : { width, height })
        if (!initialLayoutChosen.current) {
          initialLayoutChosen.current = true
          if (!userChoseMode.current && width < 560 && data.nodes.length > 12) setMode("list")
        }
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [mode, data.nodes.length])
  const viewportScale = Math.min(canvasSize.width / WIDTH, canvasSize.height / HEIGHT)
  const markScale = 1 / (viewportScale * view.scale)
  const compact = canvasSize.width < 560
  const showAllLabels = !compact && data.nodes.length <= 12
  const selected = data.nodes.find(node => node.id === selectedId)
  const focused = data.nodes.find(node => node.id === (focusedId ?? hoveredId))
  const namedNode = focused ?? selected
  const positions = useMemo(() => positionNodes(data.nodes), [data.nodes])
  const nodeIds = new Set(data.nodes.map(node => node.id))
  // The server authorizes the DTO; this additionally avoids drawing dangling endpoints.
  const edges = data.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  const relationshipTypes = [...new Set(edges.map(edge => edge.relationship))].sort()
  const selectedEdges = edges.filter(edge => edge.source === selected?.id || edge.target === selected?.id)
  const neighborIds = new Set(selectedEdges.flatMap(edge => [edge.source, edge.target]))
  if (selected) neighborIds.add(selected.id)
  const filteredEdges = edges.filter(edge => (!relationship || edge.relationship === relationship) && (!neighborhood || !selected || (edge.source === selected.id || edge.target === selected.id)))
  const filteredIds = new Set(filteredEdges.flatMap(edge => [edge.source, edge.target]))
  const nodes = data.nodes.filter(node => (!neighborhood || !selected || neighborIds.has(node.id)) && (!relationship || filteredIds.has(node.id) || selected?.id === node.id))

  function zoom(factor: number): void {
    setView(current => {
      const scale = Math.min(3, Math.max(.5, current.scale * factor))
      const ratio = scale / current.scale
      return { scale, x: WIDTH / 2 - (WIDTH / 2 - current.x) * ratio, y: HEIGHT / 2 - (HEIGHT / 2 - current.y) * ratio }
    })
  }
  function canvasKey(event: KeyboardEvent<SVGSVGElement>): void {
    if (event.target !== event.currentTarget) return
    const movement: Record<string, Point> = { ArrowLeft: { x: 40, y: 0 }, ArrowRight: { x: -40, y: 0 }, ArrowUp: { x: 0, y: 40 }, ArrowDown: { x: 0, y: -40 } }
    if (movement[event.key]) {
      event.preventDefault()
      const delta = movement[event.key]
      setView(current => ({ ...current, x: current.x + delta.x, y: current.y + delta.y }))
    } else if (["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault()
      if (event.key === "0") setView(INITIAL_VIEW)
      else zoom(event.key === "-" ? 1 / 1.2 : 1.2)
    }
  }
  function startPan(event: PointerEvent<SVGSVGElement>): void {
    if (event.button !== 0 || (event.target as Element).closest("[data-graph-node]")) return
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function pan(event: PointerEvent<SVGSVGElement>): void {
    const prior = drag.current
    if (!prior || prior.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(bounds.width / WIDTH, bounds.height / HEIGHT)
    if (!ratio) return
    setView(current => ({ ...current, x: current.x + (event.clientX - prior.x) / ratio, y: current.y + (event.clientY - prior.y) / ratio }))
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }
  function nodeKey(event: KeyboardEvent<SVGGElement>, node: KnowledgeNode, index: number): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setSelectedId(node.id)
    } else if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault()
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1
      nodeRefs.current.get(nodes[(index + direction + nodes.length) % nodes.length].id)?.focus()
    }
  }

  return (
    <section className={styles.graph} aria-label="Knowledge graph explorer">
      <div className={styles.toolbar}>
        <div className={styles.modes} aria-label="Graph display">
          <button type="button" aria-pressed={mode === "graph"} onClick={() => chooseMode("graph")}>Graph</button>
          <button type="button" aria-pressed={mode === "list"} onClick={() => chooseMode("list")}>List</button>
        </div>
        <label className={styles.filter}>Relationship
          <select value={relationship} onChange={event => setRelationship(event.target.value)}>
            <option value="">All stored types</option>
            {relationshipTypes.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <button type="button" disabled={!selected} aria-pressed={neighborhood} onClick={() => setNeighborhood(value => !value)}>Selected neighborhood</button>
      </div>
      <div className={styles.scope}>
        <p role="status" aria-label="Loaded graph scope">{nodes.length} of {data.nodes.length} loaded nodes · {filteredEdges.length} stored relationships shown</p>
        <p>Read limits: {data.nodeLimit} nodes / {data.edgeLimit} relationships. {data.nodesTruncated || data.edgesTruncated ? "Partial graph: the read limit was reached. Open a node’s neighborhood to explore further." : "This is a bounded workspace view."}</p>
        <p>Positions are arranged for readability; distance does not indicate similarity.</p>
      </div>
      <div className={styles.workspace}>
        <div className={styles.visual}>
          {mode === "graph" ? <>
            {compact && <div className={styles.canvasName} role="status" aria-label="Canvas node name">
              <span>{focused ? "Focused node" : selected ? "Selected node" : "Explore a node"}</span>
              <strong>{namedNode?.label ?? "Select a dot or use List to read every node name."}</strong>
            </div>}
            <svg ref={svgRef} className={styles.canvas} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} tabIndex={0} role="group" aria-label="Memory relationship canvas" aria-describedby={`${uid}-instructions`} onKeyDown={canvasKey} onPointerDown={startPan} onPointerMove={pan} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}>
              <defs><marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={6 * markScale} markerHeight={6 * markScale} markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrow} /></marker></defs>
              <g data-graph-scene transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
                {filteredEdges.map(edge => {
                  const source = positions.get(edge.source)!
                  const target = positions.get(edge.target)!
                  const dx = target.x - source.x, dy = target.y - source.y
                  const length = Math.hypot(dx, dy) || 1
                  const active = selected?.id === edge.source || selected?.id === edge.target
                  return <g key={edge.id} data-graph-edge={edge.id} className={active ? styles.activeEdge : styles.edge}>
                    <title>{edge.source} → {edge.relationship} → {edge.target}</title>
                    {edge.source === edge.target
                      ? <path d={`M ${source.x - 8} ${source.y - 12} C ${source.x - 65} ${source.y - 85}, ${source.x + 65} ${source.y - 85}, ${source.x + 8} ${source.y - 16}`} markerEnd={`url(#${uid}-arrow)`} />
                      : <line x1={source.x + dx / length * 10 * markScale} y1={source.y + dy / length * 10 * markScale} x2={target.x - dx / length * 12 * markScale} y2={target.y - dy / length * 12 * markScale} markerEnd={`url(#${uid}-arrow)`} />}
                    {!compact && (active || filteredEdges.length <= 8) && <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - (edge.source === edge.target ? 65 : 9)} className={styles.edgeLabel} style={{ fontSize: 12 * markScale }}>{edge.relationship}</text>}
                  </g>
                })}
                {nodes.map((node, index) => {
                  const point = positions.get(node.id)!
                  const active = selected?.id === node.id
                  const showLabel = !compact && (showAllLabels || active || focusedId === node.id || hoveredId === node.id)
                  return <g key={node.id} ref={element => { if (element) nodeRefs.current.set(node.id, element); else nodeRefs.current.delete(node.id) }} data-graph-node={node.id} className={`${styles.node} ${active ? styles.selected : ""}`} transform={`translate(${point.x} ${point.y})`} tabIndex={0} role="button" aria-label={`Inspect ${node.label}${node.lifecycle === "superseded" ? " (superseded version)" : ""}`} aria-pressed={active} onClick={() => setSelectedId(node.id)} onFocus={() => setFocusedId(node.id)} onBlur={() => setFocusedId(null)} onPointerEnter={() => setHoveredId(node.id)} onPointerLeave={() => setHoveredId(null)} onKeyDown={event => nodeKey(event, node, index)}>
                    <title>{node.label} · {node.kind} · {node.recordId}</title>
                    <g data-node-mark transform={`scale(${markScale})`}>
                      <circle r={22} className={styles.hitTarget} />
                      <circle r={11} className={styles.focusRing} />
                      <circle r={node.kind === "memory" ? 6 : 5} className={styles.dot} />
                      {showLabel && <text y={26} textAnchor="middle" className={styles.nodeLabel}>{shortLabel(node.label)}</text>}
                      {active && !compact && <text y={40} textAnchor="middle" className={styles.selectedLabel}>Selected</text>}
                    </g>
                  </g>
                })}
              </g>
            </svg>
            <div className={styles.canvasControls} aria-label="Canvas controls">
              <button type="button" aria-label="Zoom in" onClick={() => zoom(1.2)}>+</button>
              <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>−</button>
              <button type="button" onClick={() => setView(INITIAL_VIEW)}>Fit</button>
              <output aria-label="Zoom level">{Math.round(view.scale * 100)}%</output>
            </div>
            {compact && data.nodes.length > 12 && <p className={styles.notice}>Dense graph: touch targets overlap when zoomed out. Zoom in before selecting, or use List for reliable record selection.</p>}
            <p id={`${uid}-instructions`} className={styles.instructions}>Drag the canvas to pan. Focus it and use arrow keys to pan, +/− to zoom, or 0 to fit. Tab to a node; Enter selects it. Arrow keys move between nodes. {compact ? "The focused or selected name appears above the canvas; use List for all names." : !showAllLabels && "Labels appear on selected, focused, or hovered nodes; use List for all names."}</p>
          </> : <ul className={styles.nodeList} aria-label="Loaded graph nodes">
            {nodes.map(node => <li key={node.id}><button type="button" aria-pressed={selected?.id === node.id} onClick={() => setSelectedId(node.id)}><strong>{node.label}</strong><span>{node.kind} · {node.lifecycle === "superseded" ? "Superseded version · " : ""}{node.recordId}</span></button></li>)}
          </ul>}
          {!nodes.length && <p className={styles.empty}>No nodes match this relationship filter.</p>}
          {!edges.length && <p className={styles.notice}>No stored relationships were returned in this bounded view. No connections have been inferred.</p>}
          <div className={styles.legend}><span><i className={styles.legendDot} />Memory / structural node</span><span><i className={styles.legendSelected} />Selected</span><span>Arrow → stored relationship direction</span></div>
        </div>
        <aside className={styles.inspector} aria-label="Selected memory inspector" aria-live="polite">
          {selected ? <>
            <p className={styles.eyebrow}>{selected.kind === "memory" ? "Memory" : "Structural node"}</p>
            <h2>{selected.label}</h2>
            <dl className={styles.metadata}>
              <div><dt>Record ID</dt><dd>{selected.recordId}</dd></div>
              <div><dt>Version</dt><dd>{selected.version ?? "Unknown"}</dd></div>
              <div><dt>Lifecycle</dt><dd>{selected.lifecycle === "superseded" ? "Superseded version" : selected.lifecycle === "active" ? "Active" : "Not applicable"}</dd></div>
              <div><dt>Created</dt><dd>{selected.createdAt || "Unknown"}</dd></div>
              <div><dt>Provenance</dt><dd>{selected.provenance ?? "Not recorded"}</dd></div>
            </dl>
            <h3>Content</h3><p className={styles.content}>{selected.content || "No text returned for this node."}</p>
            <h3>Loaded relationships ({selectedEdges.length})</h3>
            {selectedEdges.length ? <ul className={styles.relationships}>{selectedEdges.map(edge => {
              const outgoing = edge.source === selected.id
              const peer = data.nodes.find(node => node.id === (outgoing ? edge.target : edge.source))!
              return <li key={edge.id}><span>{outgoing ? "Outgoing" : "Incoming"} · {edge.relationship}</span><button type="button" onClick={() => setSelectedId(peer.id)}>{peer.label}</button><small>Source: {edge.sourceTable}</small></li>
            })}</ul> : <p>No stored relationships loaded for this node.</p>}
            <a className={styles.explore} href={`/dashboard/graph?focusNodeId=${encodeURIComponent(selected.id)}`}>Explore this node’s neighborhood →</a>
            <p className={styles.hint}>Requests a new bounded read with your current workspace permissions.</p>
          </> : <><p className={styles.eyebrow}>Memory inspector</p><h2>Follow a connection</h2><p>Select a node to inspect its content, provenance, and stored relationships.</p><p>Use List for a text-based view of the same authorized nodes.</p></>}
        </aside>
      </div>
    </section>
  )
}
