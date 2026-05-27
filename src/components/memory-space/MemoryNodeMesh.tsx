"use client"

import { useMemo } from "react"
import * as THREE from "three"

import { getResolvedColor } from "@/lib/brand/allura"
import type { MemoryNode } from "@/lib/memory-graph/types"

const NODE_COLOR_TOKENS: Record<MemoryNode["type"], string> = {
  raw: "gray-400",
  approved: "blue",
  promoted: "green",
  deprecated: "orange",
}

interface MemoryNodeMeshProps {
  node: MemoryNode
  position: THREE.Vector3
  isHovered: boolean
  isSelected: boolean
}

export function MemoryNodeMesh({ node, position, isHovered, isSelected }: MemoryNodeMeshProps) {
  const color = getResolvedColor(NODE_COLOR_TOKENS[node.type])
  const emissive = isSelected ? color : isHovered ? getResolvedColor("blueHover") : getResolvedColor("charcoal")
  const scale = isSelected ? 1.5 : isHovered ? 1.25 : 1

  const userData = useMemo(() => ({ nodeId: node.id }), [node.id])

  return (
    <mesh position={position} scale={scale} userData={userData}>
      <sphereGeometry args={[0.75 + Math.min(node.score, 1) * 0.45, 24, 24]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={isSelected ? 0.45 : isHovered ? 0.25 : 0.08}
        roughness={0.45}
        metalness={0.15}
      />
    </mesh>
  )
}
