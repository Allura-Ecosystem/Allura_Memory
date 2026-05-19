"use client"

import { forwardRef, useCallback } from "react"
import type { GraphNode as NodeData, NodeType } from "./types"
import { NODE_RADIUS, NODE_SHAPE } from "./types"

interface GraphNodeProps {
  node: NodeData
  x: number
  y: number
  isSelected: boolean
  isHovered: boolean
  hasDetailOpen: boolean
  onClick: (id: string) => void
  onHover: (id: string | null) => void
}

const NODE_COLOR_VARS: Record<NodeType, { fill: string; stroke: string }> = {
  memory:   { fill: "var(--dashboard-info)",           stroke: "var(--allura-blue)" },
  insight:  { fill: "var(--dashboard-accent)",          stroke: "var(--allura-orange)" },
  evidence: { fill: "var(--dashboard-success)",          stroke: "var(--allura-green)" },
  agent:    { fill: "var(--dashboard-evidence)",          stroke: "var(--dashboard-evidence)" },
  project:  { fill: "var(--allura-charcoal)",            stroke: "var(--allura-charcoal)" },
  system:   { fill: "var(--dashboard-text-secondary)",   stroke: "var(--dashboard-text-muted)" },
}

/**
 * Diamond path helper: square rotated 45° centered on origin
 */
function diamondPath(r: number): string {
  return [
    `M 0,${-r}`,
    `L ${r},0`,
    `L 0,${r}`,
    `L ${-r},0`,
    "Z",
  ].join(" ")
}

/**
 * Rounded square path helper: centered on origin
 */
function roundedSquarePath(r: number, cr: number = 3): string {
  const h = r - cr
  return [
    `M ${-h},${-r}`,
    `L ${h},${-r}`,
    `Q ${r},${-r} ${r},${-h}`,
    `L ${r},${h}`,
    `Q ${r},${r} ${h},${r}`,
    `L ${-h},${r}`,
    `Q ${-r},${r} ${-r},${h}`,
    `L ${-r},${-h}`,
    `Q ${-r},${-r} ${-h},${-r}`,
    "Z",
  ].join(" ")
}

/**
 * GraphNode — SVG node group with shape-dependent rendering
 * Per spec §7: 6 types, distinct shapes & colors, hover/selected states via CSS classes
 *
 * Uses forwardRef so GraphCanvas can imperatively mutate the <g> transform
 * during force simulation without triggering React re-renders.
 */
export const GraphNode = forwardRef<SVGGElement, GraphNodeProps>(function GraphNode({
  node, x, y, isSelected, isHovered, hasDetailOpen, onClick, onHover
}, ref) {
  const r = NODE_RADIUS[node.type]
  const shape = NODE_SHAPE[node.type]
  const colors = NODE_COLOR_VARS[node.type]

  const baseClassName = [
    "memory-explorer__node",
    `memory-explorer__node--${node.type}`,
    isSelected ? "memory-explorer__node--selected" : "",
  ].filter(Boolean).join(" ")

  const scale = isHovered ? 1.15 : 1

  const handleClick = useCallback(() => onClick(node.id), [onClick, node.id])
  const handleMouseEnter = useCallback(() => onHover(node.id), [onHover, node.id])
  const handleMouseLeave = useCallback(() => onHover(null), [onHover])
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onClick(node.id)
    }
  }, [onClick, node.id])

  return (
    <g
      ref={ref}
      className={baseClassName}
      transform={`translate(${x},${y}) scale(${scale})`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
      role="button"
      aria-label={`${node.label} (${node.type}) — ${isSelected ? "selected" : "click to select"}`}
      aria-selected={isSelected}
      aria-expanded={hasDetailOpen}
      onKeyDown={handleKeyDown}
      style={{ cursor: "pointer" }}
    >
      {shape === "circle" && (
        <circle
          className="node-shape"
          r={r}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={1}
        />
      )}

      {shape === "diamond" && (
        <path
          className="node-shape"
          d={diamondPath(r)}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={1}
        />
      )}

      {shape === "rounded-square" && (
        <path
          className="node-shape"
          d={roundedSquarePath(r)}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={1}
        />
      )}

      {/* Selected ring — 2px border per spec §7 (rendered as SVG, not CSS ::after) */}
      {isSelected && shape === "circle" && (
        <circle
          r={r + 2}
          fill="none"
          stroke="var(--ring)"
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
      {isSelected && shape === "diamond" && (
        <path
          d={diamondPath(r + 2)}
          fill="none"
          stroke="var(--ring)"
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
      {isSelected && shape === "rounded-square" && (
        <path
          d={roundedSquarePath(r + 2)}
          fill="none"
          stroke="var(--ring)"
          strokeWidth={2}
          pointerEvents="none"
        />
      )}

      {/* Tooltip-only label per §3 — CSS-driven via .memory-explorer__node:hover .memory-explorer__node-label */}
      <foreignObject
        x={-80}
        y={-r - 32}
        width={160}
        height={24}
        className="memory-explorer__node-label"
        data-testid="node-hover-label"
      >
        <div className="memory-explorer__node-label">
          {node.label}
        </div>
      </foreignObject>
    </g>
  )
})
