import type { BoardConfig } from "./schema"
import type { BoardRegistry } from "./registry"

export type BoardStatusTone = "healthy" | "degraded" | "blocked" | "empty"

export interface BoardStatusModel {
  status: BoardStatusTone
  label: string
  description: string
  variant: "default" | "secondary" | "destructive" | "outline"
}

export interface BoardSwitcherItem {
  id: string
  title: string
  href: string
  status: BoardStatusTone
  statusLabel: string
  sourceLabel: string
  sourceType: string
  publicLabel: string
}

export interface BoardEvidencePanel {
  title: string
  description: string
  entries: Array<{
    label: string
    value: string
  }>
}

export function deriveBoardStatus(board: BoardConfig): BoardStatusTone {
  const sectionStatuses = board.sections.map((section) => section.status)

  if (sectionStatuses.includes("blocked")) {
    return "blocked"
  }

  if (sectionStatuses.includes("degraded")) {
    return "degraded"
  }

  if (sectionStatuses.includes("empty")) {
    return "empty"
  }

  return "healthy"
}

export function getBoardStatusModel(board: BoardConfig): BoardStatusModel {
  const status = deriveBoardStatus(board)

  switch (status) {
    case "blocked":
      return {
        status,
        label: "Blocked",
        description: "One or more lanes require attention before this board is clear to proceed.",
        variant: "destructive",
      }
    case "degraded":
      return {
        status,
        label: "Degraded",
        description: "The board is available, but at least one lane is not fully healthy.",
        variant: "secondary",
      }
    case "empty":
      return {
        status,
        label: "Empty",
        description: "The board is valid, but it does not yet contain active work.",
        variant: "outline",
      }
    case "healthy":
    default:
      return {
        status: "healthy",
        label: "Healthy",
        description: "The board is available and every declared lane is healthy.",
        variant: "default",
      }
  }
}

export function getBoardSourceTruthLabel(board: BoardConfig): string {
  return `${board.source.label} · ${board.source.type}`
}

export function getBoardVisibilityLabel(board: BoardConfig): string {
  return board.source.public ? "Public source of truth" : "Private source of truth"
}

export function buildBoardSwitcherItems(registry: BoardRegistry): BoardSwitcherItem[] {
  return registry.boards.map((board) => {
    const status = getBoardStatusModel(board)

    return {
      id: board.id,
      title: board.title,
      href: `/boards/${board.id}`,
      status: status.status,
      statusLabel: status.label,
      sourceLabel: board.source.label,
      sourceType: board.source.type,
      publicLabel: board.source.public ? "Public" : "Private",
    }
  })
}

export function buildBoardEvidencePanels(board: BoardConfig): BoardEvidencePanel[] {
  const status = getBoardStatusModel(board)

  return [
    {
      title: "Source of truth",
      description: "The board declaration that should be read before any board changes.",
      entries: [
        { label: "Label", value: board.source.label },
        { label: "Type", value: board.source.type },
        { label: "Owner", value: board.source.owner },
        { label: "Visibility", value: board.source.public ? "Public" : "Private" },
        { label: "Reference", value: board.source.reference },
      ],
    },
    {
      title: "Board status model",
      description: "The derived status shown in the UI so operators can see the board health at a glance.",
      entries: [
        { label: "Status", value: status.label },
        { label: "Reason", value: status.description },
        { label: "Sections", value: board.sections.map((section) => `${section.title}: ${section.status}`).join(", ") },
      ],
    },
    {
      title: "Write policy",
      description: "The declared write contract and the audit target attached to it.",
      entries: [
        { label: "Mode", value: board.writePolicy.mode },
        { label: "Allowed", value: board.writePolicy.allowedActions.join(", ") },
        { label: "Human approval", value: board.writePolicy.requiresHumanApproval ? "Required" : "Not required" },
        { label: "Audit target", value: board.writePolicy.auditTarget },
      ],
    },
    {
      title: "Evidence policy",
      description: "The artifacts that should exist before this board can be called done.",
      entries: [
        { label: "Required", value: board.evidencePolicy.requiredForDone.join(", ") },
        { label: "Receipt format", value: board.evidencePolicy.receiptFormat },
        { label: "Degraded state", value: board.degradedState.message },
        { label: "Recovery", value: board.degradedState.recovery },
      ],
    },
  ]
}
