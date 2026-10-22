import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { usePreviewAppSummaries } from './apps-preview'
import { buildConnectionsGraph, type ConnectionKind, filterConnectionsGraph } from './connections-graph-model'
import { ConnectionsThree } from './connections-three'
import { usePreviewFiles } from './files-state'
import { useOrganization } from './organization-state'
import { usePreviewWork } from './preview-work-state'
import './connections-graph.css'

const KINDS: ConnectionKind[] = ['file', 'task', 'person', 'app', 'vendor', 'contact']
const LABELS = { file: 'File', task: 'Task', person: 'Person', app: 'App', vendor: 'Company', contact: 'Contact' }
const WIDTH = 1120
const INITIAL_VIEW = { x: 0, y: 0, scale: 1 }
const symbols = { file: '▤', task: '◇', person: '●', app: '▢', vendor: '▥', contact: '●' }
function lines(label: string): string[] {
  const result: string[] = []
  let rest = label
  while (rest.length > 17 && result.length < 2) {
    const space = rest.lastIndexOf(' ', 17)
    const cut = space > 0 ? space : 17
    result.push(rest.slice(0, cut))
    rest = rest.slice(cut).trim()
  }
  result.push(rest.length > 17 ? `${rest.slice(0, 16)}…` : rest)
  return result
}

/** Shared preview records only; never queries a service or modifies their state. */
export function ConnectionsGraph({ focusId }: { focusId?: string }) {
  const { files, links } = usePreviewFiles()
  const { tasks } = usePreviewWork()
  const { people, vendors, contacts } = useOrganization()
  const apps = usePreviewAppSummaries()
  const graph = buildConnectionsGraph({ files, links, tasks, people, apps, vendors, contacts })
  const [selectedId, setSelectedId] = useState(focusId || '')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ConnectionKind | ''>('')
  const [hops, setHops] = useState<0 | 1 | 2>(0)
  const [mode, setMode] = useState<'three' | 'graph' | 'list'>(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches ? 'list' : 'three')
  const [renderNotice, setRenderNotice] = useState('')
  const handleThreeFailure = useCallback(() => { setRenderNotice('3D is unavailable in this browser. The same records are available in List and Flat views.'); setMode('list') }, [])
  const [view, setView] = useState(INITIAL_VIEW)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const inspector = useRef<HTMLElement>(null)
  const uid = useId()
  useEffect(() => { if (inspector.current) inspector.current.scrollTop = 0 }, [selectedId])
  useEffect(() => { setSelectedId(focusId || ''); setQuery(''); setKind(''); setHops(0); setView(INITIAL_VIEW) }, [focusId])
  const selected = graph.nodes.find(node => node.id === selectedId)
  const shown = filterConnectionsGraph(graph, { query, kind, selectedId, hops })
  // Layout uses actual connected components. Geometry conveys no additional relationship.
  // Calculate from the complete graph so filtering never moves the remaining items.
  const remaining = new Set(graph.nodes.map(node => node.id))
  const groups: string[][] = []
  while (remaining.size) {
    const pending = [remaining.values().next().value!]
    const component: string[] = []
    while (pending.length) {
      const id = pending.shift()!
      if (!remaining.delete(id)) continue
      component.push(id)
      for (const edge of graph.edges) {
        if (edge.source === id && remaining.has(edge.target)) pending.push(edge.target)
        if (edge.target === id && remaining.has(edge.source)) pending.push(edge.source)
      }
    }
    groups.push(component)
  }
  groups.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
  const degree = (id: string) => graph.edges.filter(edge => edge.source === id || edge.target === id).length
  const columns = Math.min(3, Math.max(1, groups.length))
  const height = Math.max(550, Math.ceil(groups.length / columns) * 310 + 30)
  const positions = new Map<string, { x: number; y: number }>()
  groups.forEach((group, index) => {
    const center = { x: 56 + (WIDTH - 112) / columns * (index % columns + .5), y: 155 + Math.floor(index / columns) * 300 }
    const sorted = [...group].sort((a, b) => degree(b) - degree(a) || a.localeCompare(b))
    positions.set(sorted[0], center)
    sorted.slice(1).forEach((id, order) => {
      const angle = -Math.PI / 2 + order * Math.PI * 2 / (sorted.length - 1)
      positions.set(id, { x: center.x + Math.cos(angle) * 112, y: center.y + Math.sin(angle) * 100 })
    })
  })
  const captionBoxes = graph.nodes.map(node => {
    const point = positions.get(node.id)!
    const labelLines = lines(node.label)
    const halfWidth = Math.max(...labelLines.map(line => line.length * 3.8), 40)
    return { left: point.x - halfWidth, right: point.x + halfWidth, top: point.y + 15, bottom: point.y + 35 + labelLines.length * 17 }
  })
  const placedLabels: { left: number; right: number; top: number; bottom: number }[] = []
  function edgeLabelPosition(a: { x: number; y: number }, b: { x: number; y: number }, label: string) {
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const dx = (b.x - a.x) / distance, dy = (b.y - a.y) / distance
    const half = label.length * 3.1 + 5
    let best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 12, score: Infinity }
    for (const fraction of [.5, .35, .65]) for (const offset of [-18, 18, -36, 36, -54, 54, -72, 72]) {
      const x = a.x + (b.x - a.x) * fraction + dy * offset
      const y = a.y + (b.y - a.y) * fraction - dx * offset
      const box = { left: x - half, right: x + half, top: y - 12, bottom: y + 5 }
      const overlap = [...captionBoxes, ...placedLabels].filter(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top).length
      const out = box.left < 8 || box.right > WIDTH - 8 || box.top < 8 || box.bottom > height - 8
      const score = overlap * 1000 + (out ? 10000 : 0) + Math.abs(offset)
      if (score < best.score) best = { x, y, score }
    }
    placedLabels.push({ left: best.x - half, right: best.x + half, top: best.y - 12, bottom: best.y + 5 })
    return best
  }
  const relations = graph.edges.filter(edge => edge.source === selectedId || edge.target === selectedId)
  const selectedVisible = shown.nodes.some(node => node.id === selectedId)
  function reset() { setQuery(''); setKind(''); setHops(0); setSelectedId(''); setView(INITIAL_VIEW) }
  function zoom(factor: number) {
    setView(current => {
      const scale = Math.max(.75, Math.min(2.5, current.scale * factor))
      const ratio = scale / current.scale
      return { scale, x: WIDTH / 2 - (WIDTH / 2 - current.x) * ratio, y: height / 2 - (height / 2 - current.y) * ratio }
    })
  }
  // Pointer capture and keyboard pan follow the existing KnowledgeGraphView interaction.
  function startPan(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || (event.target as Element).closest('[data-connection-node]')) return
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function pan(event: PointerEvent<SVGSVGElement>) {
    const prior = drag.current
    if (!prior || prior.id !== event.pointerId) return
    const ratio = event.currentTarget.getBoundingClientRect().width / WIDTH
    if (!ratio) return
    setView(current => ({ ...current, x: current.x + (event.clientX - prior.x) / ratio, y: current.y + (event.clientY - prior.y) / ratio }))
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }
  function canvasKey(event: KeyboardEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) return
    const moves: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }
    if (moves[event.key]) { event.preventDefault(); const [x, y] = moves[event.key]; setView(current => ({ ...current, x: current.x + x, y: current.y + y })) }
    if (['+', '=', '-', '0'].includes(event.key)) { event.preventDefault(); if (event.key === '0') setView(INITIAL_VIEW); else zoom(event.key === '-' ? 1 / 1.2 : 1.2) }
  }
  return <section className="connections-graph" aria-label="Connections explorer">

    <div className="cg-toolbar">
      <div className="cg-modes" role="group" aria-label="Connections display">{(['three', 'graph', 'list'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'three' ? '3D' : value === 'graph' ? 'Flat' : 'List'}</button>)}</div>
      <label className="cg-search">Find an item<input type="search" placeholder="Name, owner or task…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>Show<select value={kind} onChange={event => setKind(event.target.value as ConnectionKind | '')}><option value="">All types</option>{KINDS.map(type => <option key={type} value={type}>{type === 'person' ? 'People' : type === 'vendor' ? 'Companies' : `${LABELS[type]}s`}</option>)}</select></label>
      <div className="cg-scope" role="group" aria-label="How far to explore">{([{ value: 0, label: 'Show everything' }, { value: 1, label: 'Direct connections' }, { value: 2, label: 'One step further' }] as const).map(scope => <button key={scope.value} type="button" disabled={scope.value > 0 && !selected} aria-pressed={hops === scope.value} onClick={() => setHops(scope.value)}>{scope.label}</button>)}</div>
      <button type="button" onClick={reset}>Reset view</button>
    </div>
    <p className="cg-count" role="status">{shown.nodes.length} of {graph.nodes.length} items · {shown.edges.length} connections shown{hops && selected ? ` · ${hops === 1 ? 'Direct connections for' : 'Within two recorded links of'} ${selected.label}` : ''}{selected && <> · Selected: {selected.label} <a href={`#${uid}-details`} onClick={event => { event.preventDefault(); document.getElementById(`${uid}-details`)?.focus(); document.getElementById(`${uid}-details`)?.scrollIntoView({ block: 'nearest' }) }}>View details ↓</a></>}</p>
    {selectedId && !selected && <p className="cg-note" role="status">This item is no longer in the sample. It may have been reset. <button type="button" onClick={reset}>Show all current items</button></p>}
    {hops > 0 && <p className="cg-help cg-scope-help">{hops === 1 ? 'Direct connections shows the selected item and records linked to it.' : 'One step further also includes records reached through one additional recorded link. It does not add a direct connection between them.'}</p>}
    {renderNotice && <p className="cg-note" role="status">{renderNotice}</p>}
    <div className={`cg-workspace ${mode === 'three' ? 'cg-workspace-three' : ''}`}><div className="cg-visual">
      {!shown.nodes.length ? <div className="cg-empty"><h3>No matching items</h3><p>Try a different name or show all types.</p><button type="button" onClick={reset}>Clear filters</button></div> : mode === 'list' ?
        <ul className="cg-list" aria-label="Connection items">{shown.nodes.map(node => <li key={node.id}><button type="button" aria-pressed={selectedId === node.id} onClick={() => setSelectedId(node.id)}><span className={`cg-symbol cg-${node.kind}`} aria-hidden="true">{symbols[node.kind]}</span><span><strong>{node.label}</strong><small>{LABELS[node.kind]} · {graph.edges.filter(edge => edge.source === node.id || edge.target === node.id).length} connections</small></span></button></li>)}</ul> : mode === 'three' ? <ConnectionsThree graph={shown} allGraph={graph} selectedId={selectedId} onSelect={setSelectedId} onFailure={handleThreeFailure} /> :
        <>
          <div className="cg-canvas-controls"><button type="button" aria-label="Zoom in" onClick={() => zoom(1.2)}>+</button><button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>−</button><button type="button" onClick={() => setView(INITIAL_VIEW)}>Fit</button><output aria-label="Graph zoom">{Math.round(view.scale * 100)}%</output><span>Select an item to see relationship names.</span></div>
          <div className="cg-canvas-scroll" role="region" aria-label="Scrollable Connections canvas" tabIndex={0}>
            <svg className="cg-canvas" style={{ aspectRatio: `${WIDTH} / ${height}` }} viewBox={`0 0 ${WIDTH} ${height}`} tabIndex={0} role="group" aria-label="Connections canvas" aria-describedby={`${uid}-help`} onKeyDown={canvasKey} onPointerDown={startPan} onPointerMove={pan} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}>
              <defs><marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#58616D" /></marker></defs>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
                {shown.edges.map(edge => {
                  const a = positions.get(edge.source)!, b = positions.get(edge.target)!
                  const active = selectedId === edge.source || selectedId === edge.target
                  const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1
                  const dx = (b.x - a.x) / distance, dy = (b.y - a.y) / distance
                  const startX = a.x + dx * 15, startY = a.y + dy * 15, endX = b.x - dx * 18, endY = b.y - dy * 18
                  const labelPoint = active ? edgeLabelPosition(a, b, edge.label) : null
                  return <g key={edge.id} className={`cg-edge ${active ? 'cg-edge-active' : ''}`} data-connection-edge={edge.id}><title>{graph.nodes.find(node => node.id === edge.source)?.label} — {edge.label} — {graph.nodes.find(node => node.id === edge.target)?.label}</title><path d={`M${startX},${startY} L${endX},${endY}`} markerEnd={`url(#${uid}-arrow)`} />{labelPoint && <text x={labelPoint.x} y={labelPoint.y} textAnchor="middle">{edge.label}</text>}</g>
                })}
                {shown.nodes.map(node => {
                  const point = positions.get(node.id)!
                  return <g key={node.id} data-connection-node={node.id} className={`cg-node ${selectedId === node.id ? 'cg-selected' : ''}`} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0} aria-label={`${LABELS[node.kind]}: ${node.label}`} aria-pressed={selectedId === node.id} onClick={() => setSelectedId(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id) } }}><title>{node.label}</title><circle className="cg-node-target" r="31" />
                    <g className="cg-node-mark">{node.kind === 'person' ? <circle r="10" /> : node.kind === 'task' ? <path d="M0 -12L12 0L0 12L-12 0Z" /> : <rect x="-10" y="-10" width="20" height="20" rx={node.kind === 'app' ? 7 : 2} />}</g>
                    {lines(node.label).map((line, index) => <text className="cg-node-label" key={index} textAnchor="middle" y={29 + index * 17}>{line}</text>)}
                    <text className="cg-type" textAnchor="middle" y={29 + lines(node.label).length * 17}>{selectedId === node.id ? 'Selected · ' : ''}{LABELS[node.kind]}{degree(node.id) === 0 ? ' · No recorded connections' : ''}</text>
                  </g>
                })}
              </g>
            </svg>
          </div>
          <p id={`${uid}-help`} className="cg-help">Drag empty space to pan. With the canvas focused, use arrow keys to pan, +/− to zoom, and 0 to fit. Tab to an item and press Enter to inspect it. List shows the same items without a canvas.</p>
          <div className="cg-legend" aria-label="Node types">{KINDS.map(type => <span key={type}><svg aria-hidden="true" width="18" height="18" viewBox="-13 -13 26 26"><g fill="currentColor">{type === 'person' ? <circle r="9" /> : type === 'task' ? <path d="M0 -11L11 0L0 11L-11 0Z" /> : <rect x="-9" y="-9" width="18" height="18" rx={type === 'app' ? 6 : 2} />}</g></svg> {LABELS[type]}</span>)}</div>
        </>}
    </div><aside ref={inspector} id={`${uid}-details`} tabIndex={-1} className={`cg-inspector ${selected ? 'cg-has-selection' : ''}`} aria-label="Selected connection details" data-scorecard={selected?.id || undefined}>
      {selected ? <><p className="cg-eyebrow">{LABELS[selected.kind]} · sample scorecard</p><h3>{selected.label}</h3>{!selectedVisible && <p className="cg-note">This selected item is outside the current filters.</p>}<a className="cg-open" href={selected.href}>Open original {selected.kind === 'person' ? 'profile' : LABELS[selected.kind].toLowerCase()} →</a><p>{selected.description}</p><dl>{selected.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl><h4>Connected items ({relations.length})</h4><p className="cg-detail-hint">Details include all recorded connections, including items hidden by your current filters.</p>
        {relations.length ? <ul className="cg-relations">{relations.map(edge => {
          const peer = graph.nodes.find(node => node.id === (edge.source === selectedId ? edge.target : edge.source))!
          const source = graph.nodes.find(node => node.id === edge.source)!
          const target = graph.nodes.find(node => node.id === edge.target)!
          return <li key={edge.id}><p><strong>{source.label}</strong> {edge.label.toLowerCase()} <strong>{target.label}</strong></p><button type="button" onClick={() => { setSelectedId(peer.id); document.getElementById(`${uid}-details`)?.focus() }}>See {peer.label}</button><small>{edge.evidence}</small><a href={edge.href}>See where this link comes from →</a></li>
        })}</ul> : <p>No connected items are recorded for this {LABELS[selected.kind].toLowerCase()}.</p>}
      </> : <><p className="cg-eyebrow">A closer look</p><h3>Follow a connection.</h3><p>Select a file, task, person, company, contact or app to see what connects it and where that information came from.</p><p>Items without connections remain visible. We do not invent links from a shared team or similar name.</p></>}
    </aside></div>
    <details className="cg-about"><summary>About these connections</summary><p>These fictional files, tasks, people and apps are shared across the preview. Lines show recorded ownership, assignments and attachments. They do not grant access or prove review. Position and distance do not mean similarity. The 3D view uses the MIT-licensed react-force-graph-3d engine, version 1.29.2.</p></details>
  </section>
}
