"use client"

import { Command } from "cmdk"
import { useTheme } from "@/components/dashboard/theme-provider"
import {
  Brain,
  Clock,
  LayoutGrid,
  MessageSquarePlus,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sun,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentAction {
  id: string
  label: string
  href?: string
  timestamp: number
}

interface MemoryResult {
  id: string
  content: string
  user_id?: string
  created_at?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RECENT_ACTIONS_KEY = "allura:command-palette:recent"
const MAX_RECENT = 5

const PAGE_ITEMS = [
  { id: "page-dashboard", href: "/dashboard", label: "New Chat", icon: MessageSquarePlus },
  { id: "page-search", href: "/dashboard/search", label: "Search Memories", icon: Search },
  { id: "page-governance", href: "/dashboard/governance", label: "Governance", icon: Shield },
  { id: "page-dreams", href: "/dashboard/dreams", label: "Dreams", icon: Moon },
  { id: "page-kanban", href: "/dashboard/kanban", label: "Kanban Board", icon: LayoutGrid },
  { id: "page-scheduled", href: "/dashboard/scheduled-tasks", label: "Scheduled Tasks", icon: Clock },
  { id: "page-graph", href: "/dashboard/graph", label: "Memory Graph", icon: Brain },
  { id: "page-settings", href: "/dashboard/settings", label: "Settings", icon: Settings },
]

// ── Local Storage Helpers ─────────────────────────────────────────────────────

function loadRecentActions(): RecentAction[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENT_ACTIONS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RecentAction[]
  } catch {
    return []
  }
}

function saveRecentAction(action: Omit<RecentAction, "timestamp">): void {
  if (typeof window === "undefined") return
  try {
    const existing = loadRecentActions()
    const filtered = existing.filter((a) => a.id !== action.id)
    const updated: RecentAction[] = [
      { ...action, timestamp: Date.now() },
      ...filtered,
    ].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(updated))
  } catch {
    // silently ignore localStorage errors
  }
}

// ── Command Palette Component ─────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [memories, setMemories] = useState<MemoryResult[]>([])
  const [memoriesLoading, setMemoriesLoading] = useState(false)
  const [recentActions, setRecentActions] = useState<RecentAction[]>([])
  const { resolvedTheme, setTheme } = useTheme()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resultCountRef = useRef<HTMLSpanElement | null>(null)

  // ── Keyboard shortcut ────────────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // ── Load recents on open ─────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      setRecentActions(loadRecentActions())
      // Focus is managed by cmdk Command.Input via autoFocus
    }
  }, [open])

  // ── Reset on close ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      setQuery("")
      setMemories([])
      setMemoriesLoading(false)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open])

  // ── Brain search (debounced, 3+ chars) ───────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 3) {
      setMemories([])
      setMemoriesLoading(false)
      return
    }

    setMemoriesLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          query,
          group_id: "allura-system",
          limit: "5",
        })
        const res = await fetch(`/api/memory?${params.toString()}`)
        if (!res.ok) {
          setMemories([])
          return
        }
        const data = (await res.json()) as { memories?: MemoryResult[] }
        setMemories(data.memories ?? [])
      } catch {
        setMemories([])
      } finally {
        setMemoriesLoading(false)
      }
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // ── Announce result count to screen readers ──────────────────────────────

  const totalVisible =
    query.length === 0
      ? recentActions.length + PAGE_ITEMS.length + 3 // pages + 3 actions
      : PAGE_ITEMS.length + 3 + memories.length

  useEffect(() => {
    if (open && resultCountRef.current) {
      resultCountRef.current.textContent = `${totalVisible} result${totalVisible !== 1 ? "s" : ""} available`
    }
  }, [open, totalVisible])

  // ── Navigation helper ────────────────────────────────────────────────────

  const navigate = useCallback(
    (href: string, label: string, id: string) => {
      saveRecentAction({ id, label, href })
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  const runAction = useCallback((id: string, label: string, fn: () => void) => {
    saveRecentAction({ id, label })
    fn()
    setOpen(false)
  }, [])

  // ── Close on backdrop click ──────────────────────────────────────────────

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) setOpen(false)
  }

  if (!open) return null

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Screen reader live region */}
      <span
        ref={resultCountRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      />

      {/* Backdrop */}
      <div
        role="presentation"
        onClick={handleBackdropClick}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(0, 0, 0, 0.48)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: "12vh",
        }}
      >
        {/* Dialog */}
        <Command
          role="dialog"
          aria-label="Command palette"
          aria-modal="true"
          shouldFilter={true}
          style={{
            width: "90%",
            maxWidth: 640,
            background: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 24px 64px rgba(17, 24, 39, 0.22), 0 4px 16px rgba(17, 24, 39, 0.10)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: 420,
            fontFamily: '"IBM Plex Sans", sans-serif',
          }}
        >
          {/* Search input row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 16px",
              borderBottom: "1px solid rgba(17, 24, 39, 0.10)",
              flexShrink: 0,
            }}
          >
            <Search
              size={16}
              aria-hidden="true"
              style={{ color: "var(--allura-gray-500)", flexShrink: 0 }}
            />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Search pages, memories, actions…"
              aria-label="Search command palette"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 15,
                fontFamily: '"IBM Plex Sans", sans-serif',
                color: "var(--dashboard-text-primary)",
                lineHeight: 1.4,
              }}
            />
            {memoriesLoading && (
              <RefreshCw
                size={14}
                aria-label="Searching memories…"
                style={{
                  color: "var(--allura-gray-500)",
                  flexShrink: 0,
                  animation: "allura-spin 0.8s linear infinite",
                }}
              />
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close command palette"
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                color: "var(--allura-gray-500)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          {/* Results list */}
          <Command.List
            aria-label="Command palette results"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px 8px",
            }}
          >
            <Command.Empty
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontSize: 14,
                color: "var(--allura-gray-500)",
              }}
            >
              No results found
            </Command.Empty>

            {/* Recent actions — shown only on empty query */}
            {query.length === 0 && recentActions.length > 0 && (
              <Command.Group
                heading="Recent"
                style={{ marginBottom: 4 }}
              >
                {recentActions.map((action) => (
                  <PaletteItem
                    key={action.id}
                    value={`recent-${action.id}-${action.label}`}
                    label={action.label}
                    icon={<Clock size={15} aria-hidden="true" />}
                    onSelect={() => {
                      if (action.href) {
                        navigate(action.href, action.label, action.id)
                      } else {
                        setOpen(false)
                      }
                    }}
                  />
                ))}
              </Command.Group>
            )}

            {/* Pages */}
            <Command.Group heading="Pages">
              {PAGE_ITEMS.map((page) => {
                const Icon = page.icon
                return (
                  <PaletteItem
                    key={page.id}
                    value={`page-${page.label}`}
                    label={page.label}
                    icon={<Icon size={15} aria-hidden="true" />}
                    shortcutHint={page.href}
                    onSelect={() => navigate(page.href, page.label, page.id)}
                  />
                )
              })}
            </Command.Group>

            {/* Actions */}
            <Command.Group heading="Actions">
              <PaletteItem
                value="action-add-memory"
                label="Add Memory"
                icon={<Plus size={15} aria-hidden="true" />}
                shortcutHint="⌘ N"
                onSelect={() => runAction("action-add-memory", "Add Memory", () => navigate("/dashboard", "New Chat", "page-dashboard"))}
              />
              <PaletteItem
                value="action-refresh"
                label="Refresh"
                icon={<RefreshCw size={15} aria-hidden="true" />}
                shortcutHint="⌘ R"
                onSelect={() => runAction("action-refresh", "Refresh", () => window.location.reload())}
              />
              <PaletteItem
                value="action-toggle-dark"
                label={resolvedTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                icon={resolvedTheme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
                onSelect={() =>
                  runAction("action-toggle-dark", "Toggle Dark Mode", () => {
                    setTheme(resolvedTheme === "dark" ? "light" : "dark")
                  })
                }
              />
            </Command.Group>

            {/* Brain memories — shown when query length >= 3 */}
            {query.length >= 3 && (
              <Command.Group heading="Memories">
                {memoriesLoading && memories.length === 0 && (
                  <div
                    role="status"
                    aria-busy="true"
                    style={{
                      padding: "10px 12px",
                      fontSize: 13,
                      color: "var(--allura-gray-500)",
                    }}
                  >
                    Searching Brain…
                  </div>
                )}
                {!memoriesLoading && memories.length === 0 && (
                  <div
                    style={{
                      padding: "10px 12px",
                      fontSize: 13,
                      color: "var(--allura-gray-500)",
                    }}
                  >
                    No memories matched "{query}"
                  </div>
                )}
                {memories.map((mem) => (
                  <PaletteItem
                    key={mem.id}
                    value={`memory-${mem.id}`}
                    label={truncate(mem.content, 72)}
                    icon={<Brain size={15} aria-hidden="true" />}
                    onSelect={() => navigate("/dashboard/search", mem.content.slice(0, 48), `memory-${mem.id}`)}
                  />
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>

      {/* Spin keyframes */}
      <style>{`
        @keyframes allura-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        [cmdk-item] {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          height: 40px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          color: var(--dashboard-text-primary);
          user-select: none;
          outline: none;
          position: relative;
        }
        [cmdk-item][aria-selected="true"] {
          background: rgba(29, 78, 216, 0.08);
          color: var(--allura-blue);
        }
        [cmdk-item]:focus-visible {
          outline: 2px solid var(--allura-blue);
          outline-offset: -2px;
        }
        [cmdk-group-heading] {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--allura-gray-500);
          padding: 6px 12px 4px;
          user-select: none;
        }
        [cmdk-list]::-webkit-scrollbar {
          width: 4px;
        }
        [cmdk-list]::-webkit-scrollbar-track {
          background: transparent;
        }
        [cmdk-list]::-webkit-scrollbar-thumb {
          background: rgba(17, 24, 39, 0.15);
          border-radius: 4px;
        }
      `}</style>
    </>
  )
}

// ── PaletteItem ───────────────────────────────────────────────────────────────

interface PaletteItemProps {
  value: string
  label: string
  icon: React.ReactNode
  shortcutHint?: string
  onSelect: () => void
}

function PaletteItem({ value, label, icon, shortcutHint, onSelect }: PaletteItemProps) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      role="option"
      aria-label={label}
    >
      <span style={{ color: "var(--allura-gray-500)", flexShrink: 0, display: "flex" }}>{icon}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {shortcutHint && (
        <span
          aria-hidden="true"
          style={{
            fontSize: 11,
            color: "var(--allura-gray-500)",
            fontFamily: '"IBM Plex Mono", monospace',
            flexShrink: 0,
            letterSpacing: "0.02em",
          }}
        >
          {shortcutHint}
        </span>
      )}
    </Command.Item>
  )
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + "…"
}
