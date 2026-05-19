"use client"

import { useCallback, useState } from "react"

import { DetailPanel } from "@/components/memory-space/DetailPanel"
import { MemoryCanvas } from "@/components/memory-space/MemoryCanvas"
import { SearchBar } from "@/components/memory-space/SearchBar"
import type { MemoryNode } from "@/lib/memory-graph/types"

/**
 * Memory Space — Main Dashboard Page
 *
 * Layout: Full-screen 3D canvas with overlaid search bar (top-left)
 * and collapsible detail panel (right side).
 */

export default function MemorySpacePage() {
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())

  const handleSelectNode = useCallback((node: MemoryNode | null) => {
    setSelectedNode(node)
  }, [])

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null)
  }, [])

  return (
    <div className="relative h-full w-full">
      {/* 3D Canvas — full screen */}
      <MemoryCanvas
        searchQuery={searchQuery}
        activeFilters={activeFilters}
        selectedNodeId={selectedNode?.id ?? null}
        onSelectNode={handleSelectNode}
      />

      {/* Search + Filter overlay */}
      <div className="absolute top-16 left-4 z-20 w-80">
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          filters={activeFilters}
          onFiltersChange={setActiveFilters}
        />
      </div>

      {/* Detail Panel — slides in from right */}
      <DetailPanel
        node={selectedNode}
        onClose={handleClosePanel}
      />
    </div>
  )
}
