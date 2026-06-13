/**
 * Inspector View Components — unit tests
 *
 * @vitest-environment jsdom
 *
 * Covers each of the 6 entity view components:
 *  - Renders loading skeleton initially
 *  - Renders data fields after fetch resolves (mocked fetch)
 *  - Renders error message on fetch failure
 *
 * All tests mock global fetch and do NOT hit real network or DB.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RunView }       from "@/components/dashboard/inspector-views/run-view"
import { WorkItemView }  from "@/components/dashboard/inspector-views/work-item-view"
import { ProjectView }   from "@/components/dashboard/inspector-views/project-view"
import { EvidenceView }  from "@/components/dashboard/inspector-views/evidence-view"
import { HandoffView }   from "@/components/dashboard/inspector-views/handoff-view"
import { MemoryView }    from "@/components/dashboard/inspector-views/memory-view"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  })
}

function makeFailFetch(error = "Not found") {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error }),
  })
}

function makeNetworkErrorFetch() {
  return vi.fn().mockRejectedValue(new Error("Network error"))
}

beforeEach(() => cleanup())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── RunView ───────────────────────────────────────────────────────────────────

describe("RunView", () => {
  const mockRun = {
    id: "run-test-01",
    definition_id: "def-hello-world",
    definition_revision: 3,
    group_id: "allura-system",
    status: "completed" as const,
    state_json: {},
    actor_id: "agent-brooks",
    started_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:05:00.000Z",
    completed_at: "2026-01-01T10:05:00.000Z",
  }

  it("renders loading skeleton initially", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})))
    render(<RunView entityId="run-test-01" />)
    const busy = document.querySelector("[aria-busy='true']")
    expect(busy).not.toBeNull()
  })

  it("renders run data after fetch resolves", async () => {
    vi.stubGlobal("fetch", makeFetch({ run: mockRun }))
    render(<RunView entityId="run-test-01" />)

    await waitFor(() => {
      expect(screen.getByText("def-hello-world")).toBeDefined()
    })
    expect(screen.getByText("completed")).toBeDefined()
    expect(screen.getByText("agent-brooks")).toBeDefined()
    expect(screen.getByText("run-test-01")).toBeDefined()
  })

  it("renders error state on fetch failure", async () => {
    vi.stubGlobal("fetch", makeFailFetch("Run not found"))
    render(<RunView entityId="run-missing" />)

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined()
    })
    expect(screen.getByText("Run not found")).toBeDefined()
  })

  it("renders error state on network error", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch())
    render(<RunView entityId="run-net-error" />)

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined()
    })
  })
})

// ── WorkItemView ──────────────────────────────────────────────────────────────

describe("WorkItemView", () => {
  const mockWorkItem = {
    id: "wi-test-01",
    project_id: "proj-alpha",
    lane_id: null,
    group_id: "allura-system",
    title: "Implement search endpoint",
    description: "Build the hybrid search API",
    status: "in_progress" as const,
    priority: "high" as const,
    owner_id: "agent-woz",
    team_id: null,
    acceptance_criteria: ["Tests pass", "Typecheck clean"],
    linked_run_id: null,
    latest_receipt_id: null,
    blocker: null,
    created_at: "2026-01-01T09:00:00.000Z",
    updated_at: "2026-01-01T09:30:00.000Z",
    completed_at: null,
  }

  it("renders loading skeleton initially", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})))
    render(<WorkItemView entityId="wi-test-01" />)
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull()
  })

  it("renders work item data after fetch resolves", async () => {
    vi.stubGlobal("fetch", makeFetch({ work_item: mockWorkItem }))
    render(<WorkItemView entityId="wi-test-01" />)

    await waitFor(() => {
      expect(screen.getByText("Implement search endpoint")).toBeDefined()
    })
    expect(screen.getByText("In Progress")).toBeDefined()
    expect(screen.getByText("high")).toBeDefined()
    expect(screen.getByText("agent-woz")).toBeDefined()
    expect(screen.getByText("2 items")).toBeDefined()
    expect(screen.getByText("wi-test-01")).toBeDefined()
  })

  it("renders error state on fetch failure", async () => {
    vi.stubGlobal("fetch", makeFailFetch("Work item not found"))
    render(<WorkItemView entityId="wi-missing" />)

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
    expect(screen.getByText("Work item not found")).toBeDefined()
  })

  it("renders error state on network error", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch())
    render(<WorkItemView entityId="wi-net-err" />)
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
  })
})

// ── ProjectView ───────────────────────────────────────────────────────────────

describe("ProjectView", () => {
  const mockProject = {
    id: "proj-alpha",
    group_id: "allura-system",
    name: "Alpha Initiative",
    description: "Core memory platform work",
    status: "active" as const,
    owner_id: "agent-brooks",
    team_id: null,
    created_at: "2026-01-01T08:00:00.000Z",
    updated_at: "2026-01-01T08:00:00.000Z",
    archived_at: null,
  }

  it("renders loading skeleton initially", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})))
    render(<ProjectView entityId="proj-alpha" />)
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull()
  })

  it("renders project data after fetch resolves", async () => {
    vi.stubGlobal("fetch", makeFetch({ project: mockProject }))
    render(<ProjectView entityId="proj-alpha" />)

    await waitFor(() => {
      expect(screen.getByText("Alpha Initiative")).toBeDefined()
    })
    expect(screen.getByText("active")).toBeDefined()
    expect(screen.getByText("Core memory platform work")).toBeDefined()
    expect(screen.getByText("agent-brooks")).toBeDefined()
    expect(screen.getByText("proj-alpha")).toBeDefined()
  })

  it("renders error state on fetch failure", async () => {
    vi.stubGlobal("fetch", makeFailFetch("Project not found"))
    render(<ProjectView entityId="proj-missing" />)

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
    expect(screen.getByText("Project not found")).toBeDefined()
  })

  it("renders error state on network error", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch())
    render(<ProjectView entityId="proj-net-err" />)
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
  })
})

// ── EvidenceView ──────────────────────────────────────────────────────────────

describe("EvidenceView", () => {
  const mockEvidence = {
    id: "ev-test-01",
    group_id: "allura-system",
    work_item_id: "wi-test-01",
    run_id: null,
    step_id: null,
    actor_id: "agent-bellard",
    packet_type: "test_result" as const,
    content: { passed: true, summary: "All tests passed" },
    artifact_refs: ["artifact://test-report.html"],
    created_at: "2026-01-01T11:00:00.000Z",
  }

  it("renders loading skeleton initially", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})))
    render(<EvidenceView entityId="ev-test-01" />)
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull()
  })

  it("renders evidence data after fetch resolves", async () => {
    vi.stubGlobal("fetch", makeFetch({ evidence: mockEvidence }))
    render(<EvidenceView entityId="ev-test-01" />)

    await waitFor(() => {
      expect(screen.getByText("Test Result")).toBeDefined()
    })
    expect(screen.getByText("agent-bellard")).toBeDefined()
    expect(screen.getByText("1 refs")).toBeDefined()
    expect(screen.getByText("ev-test-01")).toBeDefined()
    // Content preview should be rendered
    expect(screen.getByText(/passed/i)).toBeDefined()
  })

  it("renders error state on fetch failure", async () => {
    vi.stubGlobal("fetch", makeFailFetch("Evidence packet not found"))
    render(<EvidenceView entityId="ev-missing" />)

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
    expect(screen.getByText("Evidence packet not found")).toBeDefined()
  })

  it("renders error state on network error", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch())
    render(<EvidenceView entityId="ev-net-err" />)
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
  })
})

// ── HandoffView ───────────────────────────────────────────────────────────────

describe("HandoffView", () => {
  const mockHandoff = {
    id: "ho-test-01",
    group_id: "allura-system",
    work_item_id: "wi-test-01",
    from_actor_id: "agent-woz",
    to_actor_id: "agent-pike",
    message: "Ready for interface review",
    status: "pending" as const,
    created_at: "2026-01-01T12:00:00.000Z",
    acknowledged_at: null,
  }

  it("renders loading skeleton initially", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})))
    render(<HandoffView entityId="ho-test-01" />)
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull()
  })

  it("renders handoff data after fetch resolves", async () => {
    vi.stubGlobal("fetch", makeFetch({ handoff: mockHandoff }))
    render(<HandoffView entityId="ho-test-01" />)

    await waitFor(() => {
      expect(screen.getByText("pending")).toBeDefined()
    })
    expect(screen.getByText("agent-woz")).toBeDefined()
    expect(screen.getByText("agent-pike")).toBeDefined()
    expect(screen.getByText("Ready for interface review")).toBeDefined()
    expect(screen.getByText("ho-test-01")).toBeDefined()
  })

  it("renders error state on fetch failure", async () => {
    vi.stubGlobal("fetch", makeFailFetch("Handoff not found"))
    render(<HandoffView entityId="ho-missing" />)

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
    expect(screen.getByText("Handoff not found")).toBeDefined()
  })

  it("renders error state on network error", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch())
    render(<HandoffView entityId="ho-net-err" />)
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
  })
})

// ── MemoryView ────────────────────────────────────────────────────────────────

describe("MemoryView", () => {
  const mockMemory = {
    id: "mem-test-01",
    content: "Allura uses dual-layer memory: episodic PostgreSQL + semantic Neo4j",
    score: 0.9423,
    source: "postgres_episodic",
    provenance: { agent_id: "agent-brooks", tags: ["architecture"] },
    user_id: "agent-brooks",
    created_at: "2026-01-01T13:00:00.000Z",
    version: 2,
  }

  it("renders loading skeleton initially", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})))
    render(<MemoryView entityId="mem-test-01" />)
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull()
  })

  it("renders memory data after fetch resolves", async () => {
    vi.stubGlobal("fetch", makeFetch(mockMemory))
    render(<MemoryView entityId="mem-test-01" />)

    await waitFor(() => {
      expect(screen.getByText(/dual-layer memory/i)).toBeDefined()
    })
    expect(screen.getByText("Episodic")).toBeDefined()
    expect(screen.getByText("agent-brooks")).toBeDefined()
    expect(screen.getByText("mem-test-01")).toBeDefined()
    // Score should show 4 decimal places
    expect(screen.getByText("0.9423")).toBeDefined()
    // Version
    expect(screen.getByText("v2")).toBeDefined()
  })

  it("renders error state on fetch failure", async () => {
    vi.stubGlobal("fetch", makeFailFetch("Memory not found"))
    render(<MemoryView entityId="mem-missing" />)

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
    expect(screen.getByText("Memory not found")).toBeDefined()
  })

  it("renders error state on network error", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch())
    render(<MemoryView entityId="mem-net-err" />)
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined())
  })

  it("renders semantic layer badge for neo4j source", async () => {
    vi.stubGlobal("fetch", makeFetch({ ...mockMemory, source: "neo4j_semantic" }))
    render(<MemoryView entityId="mem-semantic-01" />)

    await waitFor(() => {
      expect(screen.getByText("Semantic")).toBeDefined()
    })
  })
})
