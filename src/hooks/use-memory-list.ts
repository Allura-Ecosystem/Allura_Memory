/**
 * useMemoryList — data layer hook for the Memory Viewer page.
 *
 * Extracts all fetch logic, state, and CRUD operations from page.tsx.
 * Pure rendering stays in the page; this hook owns the data.
 *
 * Supports two views:
 * - "active" (default): normal memory listing
 * - "deleted": recently forgotten memories (30-day recovery window)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { formatRelativeTime, normalizeNeo4jTimestamp } from "@/lib/utils/date"

interface Memory {
  id: string
  content: string
  score: number
  source: "episodic" | "semantic" | "both"
  provenance: "conversation" | "manual"
  created_at: string
  usage_count?: number
  expanded?: boolean
  tags?: string[]
}

interface DeletedMemory {
  id: string
  content: string
  score: number
  source: "episodic" | "semantic" | "both"
  provenance: "conversation" | "manual"
  user_id: string
  created_at: string
  deleted_at: string
  recovery_days_remaining: number
  tags?: string[]
  version?: number
}

interface SearchResponse {
  results: Memory[]
  count: number
  latency_ms: number
}

interface ListResponse {
  memories: Memory[]
  total: number
  has_more: boolean
}

interface DeletedListResponse {
  memories: DeletedMemory[]
  total: number
  has_more: boolean
}

type MemoryViewStatus = "active" | "deleted"

interface UseMemoryListOptions {
  groupId: string
  userId?: string
  allUsers?: boolean
  limit?: number
}

interface UseMemoryListReturn {
  // Data
  memories: Memory[]
  deletedMemories: DeletedMemory[]
  hasMore: boolean

  // Loading states
  isLoading: boolean
  isLoadingMore: boolean

  // View mode
  viewStatus: MemoryViewStatus
  setViewStatus: (status: MemoryViewStatus) => void

  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void

  // Filters
  groupId: string
  setGroupId: (id: string) => void
  userId: string
  setUserId: (id: string) => void
  allUsers: boolean
  setAllUsers: (v: boolean | ((prev: boolean) => boolean)) => void

  // Actions
  loadMore: () => Promise<void>
  deleteMemory: (memory: Memory) => Promise<void>
  addMemory: (content: string) => Promise<boolean>
  restoreMemory: (memoryId: string) => Promise<boolean>
  refresh: () => void
  toggleExpand: (id: string) => void

  // Undo
  recentlyDeleted: Memory[]
  undoDelete: () => Promise<void>
  showUndo: boolean

  // Utility
  formatRelativeTime: (dateString: string) => string
}

export type { Memory, DeletedMemory, MemoryViewStatus, UseMemoryListOptions, UseMemoryListReturn }

/** Normalize a memory object's created_at from potential Neo4j DateTime */
function normalizeMemory(m: Memory): Memory {
  return { ...m, created_at: normalizeNeo4jTimestamp(m.created_at), content: m.content ?? "" }
}

/** Normalize a deleted memory object's timestamps */
function normalizeDeletedMemory(m: DeletedMemory): DeletedMemory {
  return {
    ...m,
    created_at: normalizeNeo4jTimestamp(m.created_at),
    deleted_at: normalizeNeo4jTimestamp(m.deleted_at),
    content: m.content ?? "",
  }
}

export function useMemoryList({
  groupId: initialGroupId,
  userId: initialUserId = "",
  allUsers: initialAllUsers = false,
  limit = 20,
}: UseMemoryListOptions): UseMemoryListReturn {
  const [memories, setMemories] = useState<Memory[]>([])
  const [deletedMemories, setDeletedMemories] = useState<DeletedMemory[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [groupId, setGroupId] = useState(initialGroupId)
  const [userId, setUserId] = useState(initialUserId)
  const [allUsers, setAllUsers] = useState(initialAllUsers)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [recentlyDeleted, setRecentlyDeleted] = useState<Memory[]>([])
  const [showUndo, setShowUndo] = useState(false)
  const [viewStatus, setViewStatus] = useState<MemoryViewStatus>("active")

  const PAGE_LIMIT = limit
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  // Story 2.6: prevent duplicate fetch on mount — the view-change effect owns the
  // initial load; the search-debounce effect must not fire a redundant fetchMemories()
  // when searchQuery is still empty on first render.
  const searchInitializedRef = useRef(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Fetch all memories for user
  const fetchMemories = useCallback(
    async (appendOffset?: number) => {
      const isAppend = appendOffset !== undefined
      if (isAppend) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }
      try {
        const currentOffset = isAppend ? appendOffset : 0
        const userParam = allUsers ? "" : userId ? `&user_id=${encodeURIComponent(userId)}` : ""
        const response = await fetch(
          `/api/memory?group_id=${encodeURIComponent(groupId)}${userParam}&limit=${PAGE_LIMIT}&offset=${currentOffset}`
        )
        const data: ListResponse = await response.json()
        const newMemories = (data.memories || []).map(normalizeMemory)
        if (!mountedRef.current) return
        if (isAppend) {
          setMemories((prev) => [...prev, ...newMemories])
        } else {
          setMemories(newMemories)
        }
        setHasMore(data.has_more)
        setOffset(currentOffset + newMemories.length)
      } catch (error) {
        console.error("Failed to fetch memories:", error)
      } finally {
        if (mountedRef.current) {
          if (isAppend) {
            setIsLoadingMore(false)
          } else {
            setIsLoading(false)
          }
        }
      }
    },
    [groupId, userId, allUsers, PAGE_LIMIT]
  )

  // Fetch deleted memories (Recently Forgotten)
  const fetchDeletedMemories = useCallback(async () => {
    setIsLoading(true)
    try {
      const userParam = allUsers ? "" : userId ? `&user_id=${encodeURIComponent(userId)}` : ""
      const response = await fetch(
        `/api/memory?group_id=${encodeURIComponent(groupId)}${userParam}&status=deleted&limit=50`
      )
      const data: DeletedListResponse = await response.json()
      if (!mountedRef.current) return
      setDeletedMemories((data.memories || []).map(normalizeDeletedMemory))
      setHasMore(data.has_more)
    } catch (error) {
      console.error("Failed to fetch deleted memories:", error)
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [groupId, userId, allUsers])

  // Search memories
  const searchMemories = useCallback(async () => {
    if (!searchQuery.trim()) {
      fetchMemories()
      return
    }

    setIsLoading(true)
    try {
      const userParam = allUsers ? "" : userId ? `&user_id=${encodeURIComponent(userId)}` : ""
      const response = await fetch(
        `/api/memory?query=${encodeURIComponent(searchQuery)}&group_id=${encodeURIComponent(groupId)}${userParam}&limit=50`
      )
      const data: SearchResponse = await response.json()
      if (!mountedRef.current) return
      setMemories((data.results || []).map(normalizeMemory))
      setHasMore(false)
      setOffset(0)
    } catch (error) {
      console.error("Failed to search:", error)
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [searchQuery, groupId, userId, allUsers, fetchMemories])

  // FIX BUG-004: debounced real-time search — no Enter key required
  // Story 2.6: skip the first render when query is empty to avoid a duplicate
  // fetch — the mount/view-change effect below already handles initial data load.
  useEffect(() => {
    if (!searchInitializedRef.current) {
      searchInitializedRef.current = true
      if (!searchQuery.trim()) return // initial load handled by the view-change effect
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (viewStatus !== "active") return // No search in deleted view
      if (searchQuery.trim()) {
        searchMemories()
      } else {
        fetchMemories()
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, fetchMemories, searchMemories, viewStatus])

  // Fetch memories on mount / when group/user changes or view switches
  useEffect(() => {
    if (viewStatus === "active") {
      fetchMemories()
    } else {
      fetchDeletedMemories()
    }
  }, [groupId, userId, allUsers, viewStatus, fetchMemories, fetchDeletedMemories])

  // Add memory (called from modal)
  const addMemory = useCallback(
    async (content: string): Promise<boolean> => {
      try {
        const response = await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            group_id: groupId,
            user_id: userId,
            content,
            metadata: { source: "manual" },
          }),
        })

        if (response.ok) {
          toast.success("Saved to memory")
          fetchMemories()
          return true
        }
        toast.error("Failed to save memory")
        return false
      } catch (error) {
        console.error("Failed to add memory:", error)
        toast.error("Failed to save memory")
        return false
      }
    },
    [groupId, userId, fetchMemories]
  )

  // Delete memory (soft delete)
  const deleteMemory = useCallback(
    async (memory: Memory) => {
      try {
        const response = await fetch(`/api/memory/${memory.id}?group_id=${groupId}&user_id=${userId}`, {
          method: "DELETE",
        })

        if (response.ok) {
          toast.success("Memory forgotten")
          setRecentlyDeleted((prev) => [memory, ...prev].slice(0, 10))
          setShowUndo(true)
          setMemories((prev) => prev.filter((m) => m.id !== memory.id))
          setTimeout(() => setShowUndo(false), 30000)
        }
      } catch (error) {
        console.error("Failed to delete memory:", error)
        toast.error("Failed to forget memory")
      }
    },
    [groupId, userId]
  )

  // Restore memory (within 30-day recovery window)
  const restoreMemory = useCallback(
    async (memoryId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/memory/${encodeURIComponent(memoryId)}/restore?group_id=${encodeURIComponent(groupId)}&user_id=${encodeURIComponent(userId)}`,
          { method: "POST" }
        )

        if (response.ok) {
          toast.success("Memory restored")
          // Remove from deleted list and refresh
          setDeletedMemories((prev) => prev.filter((m) => m.id !== memoryId))
          // Also refresh active list since the memory is back
          if (viewStatus === "active") {
            fetchMemories()
          }
          return true
        }

        const data = await response.json().catch(() => ({}))
        const errorMsg = (data as { error?: string }).error ?? "Failed to restore memory"
        toast.error(errorMsg)
        return false
      } catch (error) {
        console.error("Failed to restore memory:", error)
        toast.error("Failed to restore memory")
        return false
      }
    },
    [groupId, userId, viewStatus, fetchMemories]
  )

  // Undo deletion (local re-add shortcut)
  const undoDelete = useCallback(async () => {
    if (recentlyDeleted.length === 0) return
    const memory = recentlyDeleted[0]
    await addMemory(memory.content)
    setRecentlyDeleted((prev) => prev.slice(1))
    setShowUndo(false)
    toast.success("Memory restored")
  }, [recentlyDeleted, addMemory])

  // Load more (pagination)
  const loadMore = useCallback(async () => {
    await fetchMemories(offset)
  }, [fetchMemories, offset])

  // Refresh (reset and refetch)
  const refresh = useCallback(() => {
    if (viewStatus === "active") {
      fetchMemories()
    } else {
      fetchDeletedMemories()
    }
  }, [viewStatus, fetchMemories, fetchDeletedMemories])

  // Toggle expanded state for a memory card
  const toggleExpand = useCallback((id: string) => {
    setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, expanded: !m.expanded } : { ...m, expanded: false })))
  }, [])

  return {
    // Data
    memories,
    deletedMemories,
    hasMore,

    // Loading states
    isLoading,
    isLoadingMore,

    // View mode
    viewStatus,
    setViewStatus,

    // Search
    searchQuery,
    setSearchQuery,

    // Filters
    groupId,
    setGroupId,
    userId,
    setUserId,
    allUsers,
    setAllUsers,

    // Actions
    loadMore,
    deleteMemory,
    addMemory,
    restoreMemory,
    refresh,
    toggleExpand,

    // Undo
    recentlyDeleted,
    undoDelete,
    showUndo,

    // Utility
    formatRelativeTime,
  }
}
