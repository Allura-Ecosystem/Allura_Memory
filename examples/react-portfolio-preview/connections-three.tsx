import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import { BackSide, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, SphereGeometry } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { type ForceData, type ForceLink, type ForceNode, reconcileForceData } from './connections-force-model'
import type { buildConnectionsGraph } from './connections-graph-model'

type Graph = ReturnType<typeof buildConnectionsGraph>
class GraphBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFailure() }
  render() { return this.state.failed ? null : this.props.children }
}

export function ConnectionsThree({ graph, allGraph, selectedId, onSelect, onFailure }: { graph: Graph; allGraph: Graph; selectedId: string; onSelect: (id: string) => void; onFailure: () => void }) {
  return <GraphBoundary onFailure={onFailure}><ForceNetwork graph={graph} allGraph={allGraph} selectedId={selectedId} onSelect={onSelect} onFailure={onFailure} /></GraphBoundary>
}
function ForceNetwork({ graph, allGraph, selectedId, onSelect, onFailure }: { graph: Graph; allGraph: Graph; selectedId: string; onSelect: (id: string) => void; onFailure: () => void }) {
  const api = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined)
  const container = useRef<HTMLDivElement>(null)
  const labelElements = useRef(new Map<string, HTMLSpanElement>())
  const cache = useRef<ForceData | undefined>(undefined)
  cache.current = reconcileForceData(allGraph, cache.current)
  const data = cache.current
  const [size, setSize] = useState({ width: 700, height: 560 })
  const [paused, setPaused] = useState(() => Boolean(selectedId) || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [settled, setSettled] = useState(false)
  const [hovered, setHovered] = useState('')
  const live = useRef({ graph, selectedId, paused, onFailure, hovered })
  live.current = { graph, selectedId, paused, onFailure, hovered }
  const initialFit = useRef(false)
  const settledReady = useRef(false)
  const pendingFit = useRef<number | null>(3)
  const objects = useRef(new Map<string, Group>())
  const visibleKey = graph.nodes.map(node => node.id).join('|')
  useEffect(() => {
    if (initialFit.current) { setPaused(true); pendingFit.current = 3 }
    // Only an explicit visibility change refits. Text/profile changes preserve the current camera.

  }, [visibleKey])
  const visibleNodeIds = useMemo(() => new Set(graph.nodes.map(node => node.id)), [graph])
  const visibleEdgeIds = useMemo(() => new Set(graph.edges.map(edge => edge.id)), [graph])
  const neighborKey = graph.edges.flatMap(edge => edge.source === selectedId ? [edge.target] : edge.target === selectedId ? [edge.source] : []).sort().join('|')
  const neighbors = useMemo(() => new Set(neighborKey.split('|')), [neighborKey])
  const makeNode = useMemo(() => (node: ForceNode) => {
    const selected = node.id === selectedId
    const neighbor = neighbors.has(node.id)
    const key = `${node.id}:${selected}:${neighbor}`
    if (objects.current.has(key)) return objects.current.get(key)!
    const object = new Group()
    object.add(new Mesh(new SphereGeometry(selected ? 4 : neighbor ? 3.3 : 2.8, 24, 16), new MeshLambertMaterial({ color: selected ? '#FF4D1F' : '#0D47A1' })))
    if (selected) object.add(new Mesh(new SphereGeometry(4.5, 24, 16), new MeshBasicMaterial({ color: '#0F1720', side: BackSide })))
    objects.current.set(key, object)
    return object
  }, [selectedId, neighbors])
  useEffect(() => { if (selectedId) setPaused(true) }, [selectedId])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => { setReduced(media.matches); if (media.matches) setPaused(true) }
    media.addEventListener('change', change); return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(entries => {
      const width = Math.floor(entries[0].contentRect.width)
      if (width > 0) { setSize(previous => previous.width === width ? previous : { width, height: width < 500 ? 450 : 560 }); pendingFit.current = 3 }
    })
    observer.observe(container.current); return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let frame = 0
    let bound: OrbitControls | undefined
    let canvas: HTMLCanvasElement | undefined
    const pause = () => { setPaused(true); pendingFit.current = null }
    const lost = (event: Event) => { event.preventDefault(); live.current.onFailure() }
    const visibility = () => { if (document.hidden && bound) bound.autoRotate = false }
    document.addEventListener('visibilitychange', visibility)
    const tick = () => {
      const instance = api.current
      if (instance) {
        if (!bound) {
          bound = instance.controls() as OrbitControls
          bound.enableDamping = false; bound.autoRotateSpeed = .4; bound.addEventListener('start', pause)
          canvas = instance.renderer().domElement; canvas.dataset.renderer = 'react-force-graph-3d'; canvas.addEventListener('webglcontextlost', lost)
        }
        if (pendingFit.current !== null && settledReady.current) {
          const bbox = instance.getGraphBbox()
          const ready = bbox && Object.values(bbox).every(range => range.every(Number.isFinite)) && cache.current?.nodes.every(node => [node.x, node.y, node.z].every(value => typeof value === 'number' && Number.isFinite(value)))
          if (ready && --pendingFit.current <= 0) {
            if (!initialFit.current) instance.cameraPosition({ x: 100, y: 65, z: 180 })
            const ids = new Set(live.current.graph.nodes.map(node => node.id))
            instance.zoomToFit(0, 65, node => ids.has(node.id))
            initialFit.current = true; pendingFit.current = null
          }
        }
        bound.autoRotate = !live.current.paused && !document.hidden
        if (container.current) container.current.dataset.camera = instance.camera().position.toArray().map(n => n.toFixed(3)).join(',')
        const state = live.current
        const neighbors = new Set(state.graph.edges.flatMap(edge => edge.source === state.selectedId ? [edge.target] : edge.target === state.selectedId ? [edge.source] : []))
        const width = container.current?.clientWidth || 700
        const height = canvas?.clientHeight || 560
        const boxes: { left: number; top: number; right: number; bottom: number }[] = []
        const ordered = [...(cache.current?.nodes || [])].sort((a, b) => Number(b.id === state.selectedId) - Number(a.id === state.selectedId) || Number(neighbors.has(b.id)) - Number(neighbors.has(a.id)))
        for (const node of ordered) {
          const element = labelElements.current.get(node.id)
          if (!element || node.x === undefined || node.y === undefined || node.z === undefined) continue
          const point = instance.graph2ScreenCoords(node.x, node.y, node.z)
          element.dataset.screenX = String(point.x); element.dataset.screenY = String(point.y)
          const eligible = state.graph.nodes.length <= 6 || node.id === state.hovered || node.id === state.selectedId || (state.selectedId ? neighbors.has(node.id) : ['person', 'app', 'vendor', 'contact'].includes(node.kind))
          let found = false
          const left = Math.max(8, Math.min(width - 146, point.x - 69))
          let top = point.y + 18
          for (const offset of [18, -60, 40, -82]) {
            const candidate = { left, top: point.y + offset, right: left + 138, bottom: point.y + offset + 42 }
            if (candidate.top > 8 && candidate.bottom < height - 8 && !boxes.some(box => candidate.left < box.right && candidate.right > box.left && candidate.top < box.bottom && candidate.bottom > box.top)) { top = candidate.top; found = true; break }
          }
          const visible = point.x > 0 && point.x < width && point.y > 0 && point.y < height && eligible && (found || node.id === state.selectedId || node.id === state.hovered)
          element.style.transform = `translate(${left}px,${top}px)`; element.style.visibility = visible ? 'visible' : 'hidden'
          if (visible) boxes.push({ left, top, right: left + 138, bottom: top + 42 })
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility); bound?.removeEventListener('start', pause); canvas?.removeEventListener('webglcontextlost', lost) }
  }, [])
  useEffect(() => {
    const owned = objects.current
    return () => { owned.forEach(object => object.traverse(child => { if (child instanceof Mesh) { child.geometry.dispose(); const materials = Array.isArray(child.material) ? child.material : [child.material]; materials.forEach(material => material.dispose()) } })); owned.clear() }
  }, [])
  function choose(node: ForceNode) { setPaused(true); if (container.current) container.current.dataset.lastEngineClick = node.id; onSelect(node.id) }
  function fit() { setPaused(true); api.current?.zoomToFit(reduced ? 0 : 240, 65, node => visibleNodeIds.has(node.id)) }
  function zoom(factor: number) {
    const instance = api.current
    if (!instance) return
    setPaused(true)
    const controls = instance.controls() as OrbitControls
    const next = instance.camera().position.clone().sub(controls.target).multiplyScalar(factor).add(controls.target)
    instance.cameraPosition(next, controls.target, reduced ? 0 : 180)
  }
  return <div className="cg-three" data-engine="react-force-graph-3d@1.29.2" data-motion={paused ? 'paused' : 'rotating'}>
    <div className="cg-canvas-controls"><button type="button" onClick={() => setPaused(value => !value)}>{paused ? 'Resume rotation' : 'Pause rotation'}</button><button type="button" aria-label="Zoom in 3D" onClick={() => zoom(.85)}>+</button><button type="button" aria-label="Zoom out 3D" onClick={() => zoom(1.18)}>−</button><button type="button" onClick={fit}>Fit visible items</button><span>{settled ? 'Layout settled' : 'Arranging connections…'}</span></div>
    <div className="cg-three-stage" ref={container} style={{ height: size.height }} aria-label="Interactive 3D Connections network">
      <ForceGraph3D<ForceNode, ForceLink> ref={api} graphData={data} width={size.width} height={size.height} backgroundColor="#F7F3EE" controlType="orbit" showNavInfo={false} forceEngine="d3" numDimensions={3} warmupTicks={160} cooldownTicks={0} cooldownTime={0}
        nodeLabel={() => ''} linkLabel={() => ''} nodeThreeObject={makeNode} nodeVisibility={node => visibleNodeIds.has(node.id)} linkVisibility={link => visibleEdgeIds.has(link.id)} linkColor={link => { const source = typeof link.source === 'string' ? link.source : link.source.id; const target = typeof link.target === 'string' ? link.target : link.target.id; return source === selectedId || target === selectedId ? '#0D47A1' : '#718298' }} linkOpacity={1} linkWidth={.45} enableNodeDrag={false}
        onNodeClick={choose} onNodeHover={node => setHovered(node?.id || '')} onEngineStop={() => { setSettled(true); settledReady.current = true; if (!initialFit.current) pendingFit.current = 3 }} />
      <div className="cg-force-labels" aria-hidden="true">{graph.nodes.map(node => <span className="cg-force-label" key={node.id} ref={element => { if (element) labelElements.current.set(node.id, element); else labelElements.current.delete(node.id) }} data-connection-node={node.id}><strong>{node.label}</strong><small>{node.kind}{selectedId === node.id ? ' · selected' : ''}</small></span>)}</div>
    </div>
    <p className="cg-help">Drag empty space to orbit; right-drag to pan; scroll to zoom. Point to an item for its name. Select a sphere to open its scorecard. Choose List for keyboard access. {reduced ? 'Reduced motion starts rotation paused.' : 'Selection and manual navigation pause rotation.'}</p>
    <p className="cg-help">Lines show recorded connections. Nearby items are not necessarily related.</p>
  </div>
}
