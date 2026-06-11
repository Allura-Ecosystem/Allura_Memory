/**
 * Toast notification system unit tests — Story 11.2
 *
 * @vitest-environment jsdom
 *
 * Covers:
 *  - Store: addToast, removeToast, clearAll, max-3 rotation
 *  - ToastItem: renders all four variants, manual dismiss, action button
 *  - ToastContainer: ARIA attributes
 *  - useToast hook: shorthand methods
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup, within } from "@testing-library/react"
import { useToastStore } from "@/store/toast"
import type { Toast } from "@/store/toast"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeToast(overrides: Partial<Toast> = {}): Toast {
  return {
    id: "t-1",
    type: "success",
    title: "Test toast",
    duration: 5000,
    createdAt: Date.now(),
    ...overrides,
  }
}

// Reset store and DOM between tests
beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  cleanup()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── Store tests ───────────────────────────────────────────────────────────────

describe("useToastStore", () => {
  it("addToast inserts a toast with a unique id", () => {
    const { addToast, toasts } = useToastStore.getState()
    const id = addToast({ type: "success", title: "Hello" })
    const state = useToastStore.getState()
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0]!.id).toBe(id)
    expect(state.toasts[0]!.title).toBe("Hello")
    // suppress unused warning
    void toasts
  })

  it("addToast sets default duration to 5000ms when not provided", () => {
    const { addToast } = useToastStore.getState()
    addToast({ type: "info", title: "No duration" })
    const { toasts } = useToastStore.getState()
    expect(toasts[0]!.duration).toBe(5000)
  })

  it("addToast respects custom duration", () => {
    const { addToast } = useToastStore.getState()
    addToast({ type: "info", title: "Custom", duration: 3000 })
    const { toasts } = useToastStore.getState()
    expect(toasts[0]!.duration).toBe(3000)
  })

  it("removeToast removes the correct toast by id", () => {
    const { addToast, removeToast } = useToastStore.getState()
    const id1 = addToast({ type: "success", title: "First" })
    addToast({ type: "error", title: "Second" })
    removeToast(id1)
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]!.title).toBe("Second")
  })

  it("clearAll empties the toasts array", () => {
    const { addToast, clearAll } = useToastStore.getState()
    addToast({ type: "success", title: "A" })
    addToast({ type: "error", title: "B" })
    clearAll()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it("max 3 visible: when a 4th toast arrives the oldest is removed", () => {
    const { addToast } = useToastStore.getState()
    const id1 = addToast({ type: "success", title: "First" })
    addToast({ type: "error", title: "Second" })
    addToast({ type: "warning", title: "Third" })
    addToast({ type: "info", title: "Fourth" })

    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(3)
    // Oldest (id1) must be gone
    expect(toasts.find((t) => t.id === id1)).toBeUndefined()
    // Fourth must be present
    expect(toasts.find((t) => t.title === "Fourth")).toBeDefined()
  })

  it("each addToast call returns a unique id", () => {
    const { addToast } = useToastStore.getState()
    const ids = Array.from({ length: 5 }, () => addToast({ type: "info", title: "x" }))
    // Reset to avoid max-3 issue — just check uniqueness of ids
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})

// ── Component tests ───────────────────────────────────────────────────────────

// Lazy import components after store reset
async function getComponents() {
  const { ToastItem } = await import("@/components/toast/Toast")
  const { ToastContainer } = await import("@/components/toast/ToastContainer")
  return { ToastItem, ToastContainer }
}

describe("ToastItem", () => {
  it("renders the toast title", async () => {
    const { ToastItem } = await getComponents()
    const toast = makeToast({ title: "Memory saved" })
    render(<ToastItem toast={toast} isVisible={true} />)
    expect(screen.getByText("Memory saved")).toBeDefined()
  })

  it("renders the optional message when provided", async () => {
    const { ToastItem } = await getComponents()
    const toast = makeToast({ message: "Stored in Neo4j" })
    render(<ToastItem toast={toast} isVisible={true} />)
    expect(screen.getByText("Stored in Neo4j")).toBeDefined()
  })

  it("does not render a message paragraph when message is absent", async () => {
    const { ToastItem } = await getComponents()
    const toast = makeToast()
    const { container } = render(<ToastItem toast={toast} isVisible={true} />)
    // Only the title paragraph should exist within this rendered component
    const allParas = container.querySelectorAll("p")
    expect(allParas).toHaveLength(1)
  })

  it("renders the action button when action is provided", async () => {
    const { ToastItem } = await getComponents()
    const onAction = vi.fn()
    const toast = makeToast({ action: { label: "Undo", onClick: onAction } })
    render(<ToastItem toast={toast} isVisible={true} />)
    const btn = screen.getByText("Undo")
    expect(btn).toBeDefined()
  })

  it("calls action.onClick and dismisses when action button is clicked", async () => {
    const { ToastItem } = await getComponents()
    const onAction = vi.fn()
    const toast = makeToast({ id: "t-action", action: { label: "Retry", onClick: onAction } })
    // Add to store so removeToast works
    useToastStore.setState({ toasts: [toast] })
    render(<ToastItem toast={toast} isVisible={true} />)
    fireEvent.click(screen.getByText("Retry"))
    expect(onAction).toHaveBeenCalledOnce()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it("removes the toast from store when X button is clicked", async () => {
    const { ToastItem } = await getComponents()
    const toast = makeToast({ id: "t-dismiss" })
    useToastStore.setState({ toasts: [toast] })
    const { container } = render(<ToastItem toast={toast} isVisible={true} />)
    const btn = within(container).getByRole("button", { name: /dismiss/i })
    fireEvent.click(btn)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it("X button has accessible label", async () => {
    const { ToastItem } = await getComponents()
    const toast = makeToast()
    const { container } = render(<ToastItem toast={toast} isVisible={true} />)
    const btn = within(container).getByRole("button", { name: /dismiss/i })
    expect(btn).toBeDefined()
  })

  it("auto-dismisses after the configured duration", async () => {
    vi.useFakeTimers()
    const { ToastItem } = await getComponents()
    const toast = makeToast({ id: "t-auto", duration: 1000 })
    useToastStore.setState({ toasts: [toast] })
    render(<ToastItem toast={toast} isVisible={true} />)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(1001) })
    expect(useToastStore.getState().toasts).toHaveLength(0)
    vi.useRealTimers()
  })

  it("renders all four type variants without throwing", async () => {
    const { ToastItem } = await getComponents()
    const types = ["success", "error", "warning", "info"] as const
    for (const type of types) {
      const toast = makeToast({ type })
      const { unmount } = render(<ToastItem toast={toast} isVisible={true} />)
      unmount()
    }
  })
})

describe("ToastContainer", () => {
  it("renders nothing when toasts array is empty", async () => {
    const { ToastContainer } = await getComponents()
    const { container } = render(<ToastContainer />)
    expect(container.firstChild).toBeNull()
  })

  it("renders the ARIA region with correct attributes when toasts exist", async () => {
    const { ToastContainer } = await getComponents()
    const toast = makeToast({ id: "t-aria" })
    useToastStore.setState({ toasts: [toast] })
    render(<ToastContainer />)
    const region = screen.getByRole("region", { name: /notifications/i })
    expect(region).toBeDefined()
    expect(region.getAttribute("aria-live")).toBe("polite")
  })

  it("renders up to 3 toasts (store already enforces max)", async () => {
    const { ToastContainer } = await getComponents()
    useToastStore.setState({
      toasts: [
        makeToast({ id: "t-1", title: "One" }),
        makeToast({ id: "t-2", title: "Two" }),
        makeToast({ id: "t-3", title: "Three" }),
      ],
    })
    render(<ToastContainer />)
    expect(screen.getByText("One")).toBeDefined()
    expect(screen.getByText("Two")).toBeDefined()
    expect(screen.getByText("Three")).toBeDefined()
  })
})

// ── useToast hook tests ───────────────────────────────────────────────────────

describe("useToast hook", () => {
  it("toast.success adds a success toast", async () => {
    const { useToast } = await import("@/components/toast/useToast")
    let hookResult: ReturnType<typeof useToast> | null = null

    function Wrapper() {
      hookResult = useToast()
      return null
    }

    render(<Wrapper />)
    act(() => { hookResult!.toast.success("Saved") })
    const { toasts } = useToastStore.getState()
    expect(toasts[0]!.type).toBe("success")
    expect(toasts[0]!.title).toBe("Saved")
  })

  it("toast.error adds an error toast", async () => {
    const { useToast } = await import("@/components/toast/useToast")
    let hookResult: ReturnType<typeof useToast> | null = null

    function Wrapper() {
      hookResult = useToast()
      return null
    }

    render(<Wrapper />)
    act(() => { hookResult!.toast.error("Failed") })
    const { toasts } = useToastStore.getState()
    expect(toasts[0]!.type).toBe("error")
  })

  it("toast.warning adds a warning toast with custom duration", async () => {
    const { useToast } = await import("@/components/toast/useToast")
    let hookResult: ReturnType<typeof useToast> | null = null

    function Wrapper() {
      hookResult = useToast()
      return null
    }

    render(<Wrapper />)
    act(() => { hookResult!.toast.warning("Careful", { duration: 8000 }) })
    const { toasts } = useToastStore.getState()
    expect(toasts[0]!.type).toBe("warning")
    expect(toasts[0]!.duration).toBe(8000)
  })

  it("toast.info adds an info toast", async () => {
    const { useToast } = await import("@/components/toast/useToast")
    let hookResult: ReturnType<typeof useToast> | null = null

    function Wrapper() {
      hookResult = useToast()
      return null
    }

    render(<Wrapper />)
    act(() => { hookResult!.toast.info("In progress") })
    const { toasts } = useToastStore.getState()
    expect(toasts[0]!.type).toBe("info")
  })

  it("toast.dismiss removes a specific toast", async () => {
    const { useToast } = await import("@/components/toast/useToast")
    let hookResult: ReturnType<typeof useToast> | null = null

    function Wrapper() {
      hookResult = useToast()
      return null
    }

    render(<Wrapper />)
    let id: string = ""
    act(() => { id = hookResult!.toast.success("To dismiss") })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    act(() => { hookResult!.toast.dismiss(id) })
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it("toast.clearAll empties all toasts", async () => {
    const { useToast } = await import("@/components/toast/useToast")
    let hookResult: ReturnType<typeof useToast> | null = null

    function Wrapper() {
      hookResult = useToast()
      return null
    }

    render(<Wrapper />)
    act(() => {
      hookResult!.toast.success("A")
      hookResult!.toast.error("B")
    })
    expect(useToastStore.getState().toasts).toHaveLength(2)
    act(() => { hookResult!.toast.clearAll() })
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
