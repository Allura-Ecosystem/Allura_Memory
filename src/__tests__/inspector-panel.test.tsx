/**
 * InspectorPanel + InspectorContext unit tests — Story 16.3
 *
 * @vitest-environment jsdom
 *
 * Covers:
 *  - InspectorContext: default state, open, close, toggle, error outside provider
 *  - InspectorPanel: aria-hidden when closed, opens with entity, close button, label
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { InspectorProvider, useInspector } from "@/components/dashboard/inspector-context"
import { InspectorPanel } from "@/components/dashboard/inspector-panel"

beforeEach(() => cleanup())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ─── Context tests ────────────────────────────────────────────────────────────

describe("InspectorContext", () => {
  it("starts closed with no entity", () => {
    let capturedValue: ReturnType<typeof useInspector> | undefined

    function Spy() {
      capturedValue = useInspector()
      return null
    }

    render(
      <InspectorProvider>
        <Spy />
      </InspectorProvider>,
    )

    expect(capturedValue?.isOpen).toBe(false)
    expect(capturedValue?.entity).toBeNull()
  })

  it("opens with an entity on open()", () => {
    let capturedValue: ReturnType<typeof useInspector> | undefined

    function Spy() {
      capturedValue = useInspector()
      return (
        <button
          onClick={() => capturedValue?.open({ type: "run", id: "run-123", label: "Test Run" })}
        >
          open
        </button>
      )
    }

    render(
      <InspectorProvider>
        <Spy />
      </InspectorProvider>,
    )

    act(() => {
      fireEvent.click(screen.getByText("open"))
    })

    expect(capturedValue?.isOpen).toBe(true)
    expect(capturedValue?.entity).toEqual({ type: "run", id: "run-123", label: "Test Run" })
  })

  it("closes on close()", () => {
    let capturedValue: ReturnType<typeof useInspector> | undefined

    function Spy() {
      capturedValue = useInspector()
      return (
        <>
          <button onClick={() => capturedValue?.open({ type: "project", id: "proj-1" })}>
            open
          </button>
          <button onClick={() => capturedValue?.close()}>close</button>
        </>
      )
    }

    render(
      <InspectorProvider>
        <Spy />
      </InspectorProvider>,
    )

    act(() => {
      fireEvent.click(screen.getByText("open"))
    })
    expect(capturedValue?.isOpen).toBe(true)

    act(() => {
      fireEvent.click(screen.getByText("close"))
    })
    expect(capturedValue?.isOpen).toBe(false)
  })

  it("toggles open state on toggle()", () => {
    let capturedValue: ReturnType<typeof useInspector> | undefined

    function Spy() {
      capturedValue = useInspector()
      return <button onClick={() => capturedValue?.toggle()}>toggle</button>
    }

    render(
      <InspectorProvider>
        <Spy />
      </InspectorProvider>,
    )

    expect(capturedValue?.isOpen).toBe(false)

    act(() => {
      fireEvent.click(screen.getByText("toggle"))
    })
    expect(capturedValue?.isOpen).toBe(true)

    act(() => {
      fireEvent.click(screen.getByText("toggle"))
    })
    expect(capturedValue?.isOpen).toBe(false)
  })

  it("throws when used outside provider", () => {
    function BadConsumer() {
      useInspector()
      return null
    }

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<BadConsumer />)).toThrow(
      "useInspector must be used inside <InspectorProvider>",
    )
    consoleSpy.mockRestore()
  })
})

// ─── InspectorPanel rendering tests ──────────────────────────────────────────

describe("InspectorPanel", () => {
  it("renders with aria-hidden=true by default (closed)", () => {
    render(
      <InspectorProvider>
        <InspectorPanel />
      </InspectorProvider>,
    )

    // The aside element should have aria-hidden="true" when closed
    const aside = document.querySelector("aside[aria-label='Inspector']")
    expect(aside).not.toBeNull()
    expect(aside?.getAttribute("aria-hidden")).toBe("true")
    expect(aside?.classList.contains("inspector-panel--open")).toBe(false)
  })

  it("becomes visible and shows entity id when open() is called", () => {
    function Trigger() {
      const { open } = useInspector()
      return (
        <button onClick={() => open({ type: "run", id: "run-abc" })}>inspect</button>
      )
    }

    render(
      <InspectorProvider>
        <Trigger />
        <InspectorPanel />
      </InspectorProvider>,
    )

    act(() => {
      fireEvent.click(screen.getByText("inspect"))
    })

    const aside = document.querySelector("aside[aria-label='Inspector']")
    expect(aside?.getAttribute("aria-hidden")).toBe("false")
    expect(aside?.classList.contains("inspector-panel--open")).toBe(true)

    // Entity ID should appear in the placeholder
    expect(screen.getByText("run-abc")).toBeDefined()
  })

  it("closes when the close button is clicked", () => {
    function Trigger() {
      const { open } = useInspector()
      return (
        <button onClick={() => open({ type: "work-item", id: "wi-999" })}>open</button>
      )
    }

    render(
      <InspectorProvider>
        <Trigger />
        <InspectorPanel />
      </InspectorProvider>,
    )

    act(() => {
      fireEvent.click(screen.getByText("open"))
    })

    const aside = document.querySelector("aside[aria-label='Inspector']")
    expect(aside?.classList.contains("inspector-panel--open")).toBe(true)

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close inspector" }))
    })

    expect(aside?.classList.contains("inspector-panel--open")).toBe(false)
    expect(aside?.getAttribute("aria-hidden")).toBe("true")
  })

  it("shows the entity label when provided", () => {
    function Trigger() {
      const { open } = useInspector()
      return (
        <button
          onClick={() => open({ type: "project", id: "proj-1", label: "My Project" })}
        >
          open
        </button>
      )
    }

    render(
      <InspectorProvider>
        <Trigger />
        <InspectorPanel />
      </InspectorProvider>,
    )

    act(() => {
      fireEvent.click(screen.getByText("open"))
    })

    expect(screen.getByText("My Project")).toBeDefined()
  })

  it("renders an empty state message when no entity is set but panel is opened via toggle", () => {
    function Trigger() {
      const { toggle } = useInspector()
      return <button onClick={toggle}>toggle</button>
    }

    render(
      <InspectorProvider>
        <Trigger />
        <InspectorPanel />
      </InspectorProvider>,
    )

    act(() => {
      fireEvent.click(screen.getByText("toggle"))
    })

    expect(screen.getByText(/Select an item/i)).toBeDefined()
  })
})
