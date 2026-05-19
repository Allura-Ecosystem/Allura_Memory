import { BoardConfigSchema, type BoardConfig } from "./schema"
import { BOARD_EXAMPLES } from "./examples"

export interface BoardRegistry {
  boards: BoardConfig[]
  byId: Record<string, BoardConfig | null>
  byRoute: Record<string, BoardConfig | null>
}

export interface BoardRegistryValidationResult {
  valid: boolean
  errors: string[]
}

export class BoardRegistryError extends Error {
  public readonly operation: string
  public readonly boardId?: string

  constructor(operation: string, message: string, boardId?: string) {
    super(`[BoardRegistry:${operation}] ${message}${boardId ? ` (board_id=${boardId})` : ""}`)
    this.name = "BoardRegistryError"
    this.operation = operation
    this.boardId = boardId
  }
}

export function createBoardRegistry(): BoardRegistry {
  return {
    boards: [],
    byId: {},
    byRoute: {},
  }
}

export function addBoard(registry: BoardRegistry, boardLike: unknown): BoardConfig {
  const board = BoardConfigSchema.parse(boardLike)

  if (registry.byId[board.id]) {
    throw new BoardRegistryError("addBoard", `Duplicate board config id: ${board.id}`, board.id)
  }

  const route = `/boards/${board.id}`
  if (registry.byRoute[route]) {
    throw new BoardRegistryError("addBoard", `Duplicate board config route: ${route}`, board.id)
  }

  registry.boards.push(board)
  registry.byId[board.id] = board
  registry.byRoute[route] = board

  return board
}

export function getBoardConfig(boardId: string, registry: BoardRegistry = createDefaultBoardRegistry()): BoardConfig | null {
  return registry.byId[boardId] ?? null
}

export function getBoardByRoute(route: string, registry: BoardRegistry = createDefaultBoardRegistry()): BoardConfig | null {
  return registry.byRoute[route] ?? null
}

export function listBoardConfigs(registry: BoardRegistry = createDefaultBoardRegistry()): BoardConfig[] {
  return [...registry.boards]
}

export function listBoardIds(registry: BoardRegistry = createDefaultBoardRegistry()): string[] {
  return registry.boards.map((board) => board.id)
}

export function validateBoardRegistry(registry: BoardRegistry): BoardRegistryValidationResult {
  const errors: string[] = []
  const seenIds = new Set<string>()
  const seenRoutes = new Set<string>()

  for (const board of registry.boards) {
    const parsed = BoardConfigSchema.safeParse(board)
    if (!parsed.success) {
      errors.push(`Invalid board config: ${board.id}`)
      continue
    }

    if (seenIds.has(board.id)) {
      errors.push(`Duplicate board config id: ${board.id}`)
    }
    seenIds.add(board.id)

    const route = `/boards/${board.id}`
    if (seenRoutes.has(route)) {
      errors.push(`Duplicate board config route: ${route}`)
    }
    seenRoutes.add(route)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function seedDefaultBoards(): BoardConfig[] {
  return BOARD_EXAMPLES.map((board) => BoardConfigSchema.parse(board))
}

export function loadBoardRegistry(boardConfigs: unknown[] = BOARD_EXAMPLES): BoardRegistry {
  const registry = createBoardRegistry()

  for (const board of boardConfigs) {
    addBoard(registry, board)
  }

  return registry
}

export function createDefaultBoardRegistry(): BoardRegistry {
  return loadBoardRegistry(seedDefaultBoards())
}

export function resolveBoard(boardId: string): BoardConfig | null {
  return getBoardConfig(boardId)
}

export function resolveBoardRoute(route: string): BoardConfig | null {
  return getBoardByRoute(route)
}
