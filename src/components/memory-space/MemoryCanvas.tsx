"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import * as THREE from "three"

import { getResolvedColor } from "@/lib/brand/allura"
import type { MemoryNode } from "@/lib/memory-graph/types"

import { MemoryGraphScene } from "./MemoryGraphScene"

interface MemoryCanvasProps {
  searchQuery: string
  activeFilters: Set<string>
  selectedNodeId: string | null
  onSelectNode: (node: MemoryNode | null) => void
}

/**
 * MemoryCanvas — React Three Fiber wrapper
 *
 * Provides the 3D scene with camera controls, lighting,
 * and renders the memory graph.
 *
 * Performance:
 * - Canvas is fixed to viewport
 * - Nodes capped at 250 visible
 * - Detail loaded lazily
 */
export function MemoryCanvas({
  searchQuery,
  activeFilters,
  selectedNodeId,
  onSelectNode,
}: MemoryCanvasProps) {
  const [graphData, setGraphData] = useState<{ nodes: MemoryNode[]; edges: unknown[] }>({ nodes: [], edges: [] })
  const [isLoading, setIsLoading] = useState(true)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Load initial graph data
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch("/api/memory/graph?group_id=allura-system&user_id=troy-curator")
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setGraphData({ nodes: data.nodes ?? [], edges: data.edges ?? [] })
        }
      } catch (err) {
        console.error("[MemoryCanvas] Failed to load graph:", err)
        // TODO: show error toast
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const filteredNodes = useMemo(() => {
    return graphData.nodes.filter((node) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const match =
          node.title.toLowerCase().includes(q) ||
          node.preview.toLowerCase().includes(q) ||
          node.agent_id.toLowerCase().includes(q)
        if (!match) return false
      }
      // Type filter
      if (activeFilters.size > 0 && !activeFilters.has(node.type)) {
        return false
      }
      return true
    })
  }, [graphData.nodes, searchQuery, activeFilters])

  const handleSelectNode = useCallback(
    (node: MemoryNode | null) => {
      onSelectNode(node)
    },
    [onSelectNode]
  )

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
        Loading memory graph…
      </div>
    )
  }

  // Fallback: no WebGL or no nodes
  if (filteredNodes.length === 0 && !isLoading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-gray-400">
        <p className="text-lg font-medium text-gray-300">No memories match your search</p>
        <p className="text-sm">Try a different query or clear filters</p>
      </div>
    )
  }

  return (
    <div ref={canvasRef} className="h-full w-full">
      <Canvas
        camera={{ position: [0, 0, 40], fov: 60, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color(getResolvedColor("dashboard-surface-alt")))
        }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 10]} intensity={0.8} />
          <pointLight position={[-10, -10, -10]} intensity={0.3} color={getResolvedColor("blue")} />

          <MemoryGraphScene
            nodes={filteredNodes}
            edges={graphData.edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
