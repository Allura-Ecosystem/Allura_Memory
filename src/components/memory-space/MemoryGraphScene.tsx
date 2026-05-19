"use client"

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"

import type { MemoryNode } from "@/lib/memory-graph/types"

import { MemoryNodeMesh } from "./MemoryNodeMesh"

interface MemoryGraphSceneProps {
  nodes: MemoryNode[]
  edges: unknown[]
  selectedNodeId: string | null
  onSelectNode: (node: MemoryNode | null) => void
}

/**
 * MemoryGraphScene — 3D scene contents
 *
 * Handles:
 * - Force simulation (simple repulsion + centering)
 * - Node rendering
 * - Raycasting for click/hover
 * - Camera drift when idle
 */

export function MemoryGraphScene({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: MemoryGraphSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera, raycaster, pointer, scene } = useThree()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Simple force simulation: nodes repel, slight center gravity
  const velocities = useRef<Map<string, THREE.Vector3>>(new Map())
  const positions = useRef<Map<string, THREE.Vector3>>(new Map())

  // Initialize positions if not set
  useEffect(() => {
    nodes.forEach((node, i) => {
      if (!positions.current.has(node.id)) {
        // Fibonacci sphere distribution for initial layout
        const phi = Math.acos(1 - 2 * (i + 0.5) / nodes.length)
        const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5)
        const r = 15 + Math.random() * 10
        const x = r * Math.sin(phi) * Math.cos(theta)
        const y = r * Math.sin(phi) * Math.sin(theta)
        const z = r * Math.cos(phi)
        positions.current.set(node.id, new THREE.Vector3(x, y, z))
        velocities.current.set(node.id, new THREE.Vector3())
      }
    })
  }, [nodes])

  // Physics step
  useFrame(() => {
    const pos = positions.current
    const vel = velocities.current
    const nodeCount = nodes.length
    if (nodeCount === 0) return

    // Repulsion
    for (let i = 0; i < nodeCount; i++) {
      const a = nodes[i]
      const pa = pos.get(a.id)
      if (!pa) continue
      const va = vel.get(a.id) ?? new THREE.Vector3()

      for (let j = i + 1; j < nodeCount; j++) {
        const b = nodes[j]
        const pb = pos.get(b.id)
        if (!pb) continue
        const vb = vel.get(b.id) ?? new THREE.Vector3()

        const dx = pa.x - pb.x
        const dy = pa.y - pb.y
        const dz = pa.z - pb.z
        const distSq = dx * dx + dy * dy + dz * dz + 0.1
        const force = 50 / distSq

        const fx = (dx / Math.sqrt(distSq)) * force
        const fy = (dy / Math.sqrt(distSq)) * force
        const fz = (dz / Math.sqrt(distSq)) * force

        va.x += fx
        va.y += fy
        va.z += fz
        vb.x -= fx
        vb.y -= fy
        vb.z -= fz
      }

      // Center gravity (gentle pull to origin)
      va.x -= pa.x * 0.001
      va.y -= pa.y * 0.001
      va.z -= pa.z * 0.001

      // Damping
      va.multiplyScalar(0.95)

      // Update position
      pa.add(va)
      vel.set(a.id, va)
    }

    // Update group children positions
    if (groupRef.current) {
      groupRef.current.children.forEach((child) => {
        const id = child.userData.nodeId
        const p = pos.get(id)
        if (p) {
          child.position.copy(p)
        }
      })
    }
  })

  // Raycasting for click
  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      const intersects = raycaster.intersectObjects(scene.children, true)
      for (const hit of intersects) {
        let obj: THREE.Object3D | null = hit.object
        while (obj) {
          if (obj.userData?.nodeId) {
            const node = nodes.find((n) => n.id === obj!.userData.nodeId)
            if (node) {
              onSelectNode(node)
              return
            }
          }
          obj = obj.parent
        }
      }
      // Clicked empty space — deselect
      onSelectNode(null)
    },
    [raycaster, scene, nodes, onSelectNode]
  )

  // Raycasting for hover
  useFrame(() => {
    raycaster.setFromCamera(pointer, camera)
    const intersects = raycaster.intersectObjects(scene.children, true)
    let found: string | null = null
    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object
      while (obj) {
        if (obj.userData?.nodeId) {
          found = obj.userData.nodeId
          break
        }
        obj = obj.parent
      }
      if (found) break
    }
    if (found !== hoveredId) {
      setHoveredId(found)
    }
  })

  const nodeMeshes = useMemo(() => {
    return nodes.map((node) => (
      <MemoryNodeMesh
        key={node.id}
        node={node}
        position={positions.current.get(node.id) ?? new THREE.Vector3()}
        isHovered={hoveredId === node.id}
        isSelected={selectedNodeId === node.id}
      />
    ))
  }, [nodes, hoveredId, selectedNodeId])

  return (
    <group ref={groupRef} onPointerDown={handlePointerDown}>
      {nodeMeshes}
    </group>
  )
}
