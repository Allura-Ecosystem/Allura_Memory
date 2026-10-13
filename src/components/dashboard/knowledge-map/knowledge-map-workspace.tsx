"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { AUTH_LOGIN_PATH } from "@/lib/auth/redirect-target"
import { fetchFocusedSubgraph, type FocusedSubgraphBrowserClient } from "@/lib/subgraph/browser-client"
import {
  type SubgraphEdge,
  type SubgraphNode,
  type SubgraphQuery,
  SubgraphQuerySchema,
  type SubgraphResponse,
} from "@/lib/subgraph/contract"

import { KnowledgeMapCanvas } from "./knowledge-map-canvas"
import { nodeTone, relationshipColor } from "./knowledge-map-node"
import styles from "./knowledge-map.module.css"
import {
  filterGraph,
  mergeStableByKey,
  nodeKindKey,
  relationshipKindKey,
  relationshipKindLabel,
} from "./view-model"

type GraphResponse = Extract<SubgraphResponse, { state: "complete" | "empty" | "partial" }>
type GraphInspection = NonNullable<GraphResponse["inspection"]>
type GraphSnapshot = GraphResponse["snapshot"]
type RequestPurpose = "replace" | "focus" | "continuation"
type ContinuationIssue = "snapshot" | "repeated" | "no-progress" | "node-conflict" | "edge-conflict"
interface ReturnGraph {
  response: GraphResponse
  nodes: SubgraphNode[]
  edges: SubgraphEdge[]
  warnings: string[]
  inspection?: GraphInspection
  query: SubgraphQuery
  continuationTokens: Set<string>
}

const OVERVIEW_QUERY: SubgraphQuery = { kind: "overview" }

function isGraphResponse(response: SubgraphResponse): response is GraphResponse {
  return response.state === "complete" || response.state === "empty" || response.state === "partial"
}

function withoutContinuation(rawQuery: SubgraphQuery): SubgraphQuery {
  const query = SubgraphQuerySchema.parse(rawQuery)
  const { continuation: _continuation, ...origin } = query
  return SubgraphQuerySchema.parse(origin)
}

function sameSnapshot(left: GraphSnapshot | null, right: GraphSnapshot): boolean {
  return Boolean(left) && left!.policyEpoch === right.policyEpoch && left!.graphRevision === right.graphRevision && left!.capturedAt === right.capturedAt
}

function mergeStrings(current: readonly string[], incoming: readonly string[]): string[] {
  return [...new Set([...current, ...incoming])].sort()
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Unknown" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`
}

function sourceLabel(source: SubgraphNode["source"]): string {
  return source.kind === "record" ? `${source.recordType} record` : `${source.ruleId} derivation v${source.ruleVersion}`
}

function evidenceCopy(evidence: SubgraphNode["evidence"]): string {
  if (evidence.state === "available") return `${evidence.references.length} authorized reference${evidence.references.length === 1 ? "" : "s"}`
  if (evidence.state === "absent") return "No evidence reference is attached."
  return `Evidence service unavailable.${evidence.retryable ? " Retry may succeed." : ""}`
}

const WARNING_COPY: Readonly<Record<string, string>> = {
  AMBIGUOUS_ENDPOINTS: "Some relationships were withheld because their endpoints could not be identified safely.",
  BACKEND: "The governed graph source reported a backend warning.",
  EDGE_BUDGET_EXHAUSTED: "The relationship limit was reached; more context may be available on the next page.",
  EVIDENCE_PARTIAL: "Some evidence context is not available in this page.",
  FIRST_PAGE: "Additional governed context is available on the next page.",
  GRAPH_DATA_UNAVAILABLE: "The governed graph source could not complete this request.",
  GRAPH_V2_UNAVAILABLE: "The governed graph capability is unavailable in this deployment.",
  NODE_BUDGET_EXHAUSTED: "The node limit was reached; more context may be available on the next page.",
  SECOND_PAGE: "Additional governed context was loaded.",
  SEMANTIC_GRAPH_UNAVAILABLE: "Semantic graph context is temporarily unavailable.",
  TERMINAL_EMPTY_PAGE: "No additional governed records were returned.",
}

function warningCopy(warning: string): string {
  const known = WARNING_COPY[warning]
  if (known) return known
  const words = warning.toLowerCase().replaceAll("_", " ")
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`
}

function WarningTechnicalDetails({ warnings }: { warnings: readonly string[] }): React.ReactElement {
  return (
    <details>
      <summary>Technical details</summary>
      <ul>{warnings.map((warning) => <li key={warning}><code>{warning}</code></li>)}</ul>
    </details>
  )
}

function EvidenceDetails({ evidence }: { evidence: SubgraphNode["evidence"] }): React.ReactElement {
  return (
    <div>
      <dt>Evidence</dt>
      <dd data-evidence-state={evidence.state}>
        {evidenceCopy(evidence)}
        {evidence.state === "available" ? (
          <ul className={styles.referenceList} aria-label="Authorized evidence references">
            {evidence.references.map((reference) => <li key={reference}><code>{reference}</code></li>)}
          </ul>
        ) : null}
      </dd>
    </div>
  )
}

function WarningList({ warnings }: { warnings: readonly string[] }): React.ReactElement | null {
  return warnings.length > 0 ? (
    <div className={styles.stateWarnings} role="status">
      <p>Warnings</p>
      <ul>{warnings.map((warning) => <li key={warning}>{warningCopy(warning)}</li>)}</ul>
      <WarningTechnicalDetails warnings={warnings} />
    </div>
  ) : null
}

function StatePanel({ state, heading, detail, action, children }: {
  state: string
  heading: string
  detail: string
  action?: { label: string; run: () => void }
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <section className={styles.statePanel} data-graph-state={state} aria-live="polite" aria-busy={state === "loading"}>
      <p className={styles.eyebrow}>{state.replaceAll("-", " ")}</p>
      <h2>{heading}</h2>
      <p>{detail}</p>
      {children}
      {action ? <button type="button" onClick={action.run}>{action.label}</button> : null}
    </section>
  )
}

function continuationIssueCopy(issue: ContinuationIssue): string {
  if (issue === "snapshot") return "The governed snapshot changed while loading the next page."
  if (issue === "repeated") return "The graph service repeated a continuation token."
  if (issue === "no-progress") return "The graph service returned a partial page with no new governed records."
  return `A stable ${issue === "node-conflict" ? "node" : "relationship"} identity changed across continuation pages.`
}

export function KnowledgeMapWorkspace({
  client = fetchFocusedSubgraph,
  initialResponse,
  initialQuery = OVERVIEW_QUERY,
}: {
  client?: FocusedSubgraphBrowserClient
  initialResponse?: SubgraphResponse
  initialQuery?: SubgraphQuery
}): React.ReactElement {
  const initialGraph = initialResponse && isGraphResponse(initialResponse) ? initialResponse : null
  const [response, setResponse] = useState<SubgraphResponse | null>(initialResponse ?? null)
  const [nodes, setNodes] = useState<SubgraphNode[]>(initialGraph ? [...initialGraph.nodes] : [])
  const [edges, setEdges] = useState<SubgraphEdge[]>(initialGraph ? [...initialGraph.edges] : [])
  const [warnings, setWarnings] = useState<string[]>(initialGraph ? [...initialGraph.warnings] : [])
  const [inspection, setInspection] = useState<GraphInspection | undefined>(initialGraph?.inspection)
  const [hiddenNodeKinds, setHiddenNodeKinds] = useState<Set<string>>(new Set())
  const [hiddenRelationshipKinds, setHiddenRelationshipKinds] = useState<Set<string>>(new Set())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(initialResponse === undefined)
  const [focusPendingKey, setFocusPendingKey] = useState<string | null>(null)
  const [continuationIssue, setContinuationIssue] = useState<ContinuationIssue | null>(null)
  const [focusContext, setFocusContext] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState(initialResponse ? "Knowledge Map ready." : "Loading Knowledge Map.")

  const mounted = useRef(false)
  const requestSequence = useRef(0)
  const activeRequest = useRef<{ id: number; controller: AbortController; purpose: RequestPurpose } | null>(null)
  const originQuery = useRef<SubgraphQuery>(withoutContinuation(initialQuery))
  const retryIntent = useRef<{ query: SubgraphQuery; purpose: RequestPurpose }>({
    query: withoutContinuation(initialQuery),
    purpose: "replace",
  })
  const snapshot = useRef<GraphSnapshot | null>(initialGraph?.snapshot ?? null)
  const continuationTokens = useRef<Set<string>>(new Set(initialGraph?.state === "partial" ? [initialGraph.continuation] : []))
  const returnGraph = useRef<ReturnGraph | null>(null)
  const nodesRef = useRef<SubgraphNode[]>(initialGraph ? [...initialGraph.nodes] : [])
  const edgesRef = useRef<SubgraphEdge[]>(initialGraph ? [...initialGraph.edges] : [])
  const inspector = useRef<HTMLElement | null>(null)
  const selectionOpener = useRef<HTMLElement | null>(null)
  const selectionOpenerSurface = useRef<"canvas" | "text" | null>(null)

  const cancelActiveRequest = useCallback((purpose?: RequestPurpose) => {
    const active = activeRequest.current
    if (!active || (purpose && active.purpose !== purpose)) return
    activeRequest.current = null
    active.controller.abort()
    setBusy(false)
    if (active.purpose === "focus") setFocusPendingKey(null)
  }, [])

  const applyReplacement = useCallback((next: SubgraphResponse, query: SubgraphQuery, purpose: RequestPurpose) => {
    setResponse(next)
    setContinuationIssue(null)
    if (purpose !== "focus") {
      returnGraph.current = null
      setFocusContext(null)
    }
    if (isGraphResponse(next)) {
      originQuery.current = withoutContinuation(query)
      snapshot.current = next.snapshot
      continuationTokens.current = new Set(next.state === "partial" ? [next.continuation] : [])
      nodesRef.current = [...next.nodes]
      edgesRef.current = [...next.edges]
      setNodes(nodesRef.current)
      setEdges(edgesRef.current)
      setWarnings([...next.warnings])
      setInspection(next.inspection)
      if (purpose === "focus" && query.kind === "focus") {
        setSelectedKey(next.nodes.some((node) => node.key === query.focusNodeKey) ? query.focusNodeKey : null)
      }
      setAnnouncement(next.state === "empty" ? "Knowledge Map is empty." : `Knowledge Map loaded with ${next.nodes.length} nodes and ${next.edges.length} relationships.`)
      return
    }
    setSelectedKey(null)
    setAnnouncement("Knowledge Map state changed. Review the available action.")
  }, [])

  const applyContinuation = useCallback((next: SubgraphResponse, requestedToken: string) => {
    if (!isGraphResponse(next)) {
      setResponse(next)
      setAnnouncement("The next governed page returned a new contract state.")
      return
    }
    if (!sameSnapshot(snapshot.current, next.snapshot)) {
      setContinuationIssue("snapshot")
      setAnnouncement("Knowledge Map changed. Restart required.")
      return
    }

    const mergedNodes = mergeStableByKey(nodesRef.current, next.nodes)
    const mergedEdges = mergeStableByKey(edgesRef.current, next.edges)
    if (mergedNodes.conflictKey) {
      setContinuationIssue("node-conflict")
      setAnnouncement("A node identity changed across pages. Restart required.")
      return
    }
    if (mergedEdges.conflictKey) {
      setContinuationIssue("edge-conflict")
      setAnnouncement("A relationship identity changed across pages. Restart required.")
      return
    }
    if (next.state === "partial" && (next.continuation === requestedToken || continuationTokens.current.has(next.continuation))) {
      setContinuationIssue("repeated")
      setAnnouncement("A continuation token repeated. Restart required.")
      return
    }
    if (next.state === "partial" && mergedNodes.added + mergedEdges.added === 0) {
      setContinuationIssue("no-progress")
      setAnnouncement("The next page made no progress. Restart required.")
      return
    }

    nodesRef.current = mergedNodes.items
    edgesRef.current = mergedEdges.items
    setNodes(nodesRef.current)
    setEdges(edgesRef.current)
    setWarnings((current) => mergeStrings(current, next.warnings))
    if (next.inspection) setInspection(next.inspection)
    setResponse(next)
    if (next.state === "partial") continuationTokens.current.add(next.continuation)
    setAnnouncement(next.state === "partial" ? "More governed graph data loaded." : "All governed graph pages loaded.")
  }, [])

  const runRequest = useCallback(async (query: SubgraphQuery, purpose: RequestPurpose = "replace") => {
    activeRequest.current?.controller.abort()
    const controller = new AbortController()
    const id = ++requestSequence.current
    activeRequest.current = { id, controller, purpose }
    retryIntent.current = { query, purpose }
    setBusy(true)
    if (purpose === "focus" && query.kind === "focus") setFocusPendingKey(query.focusNodeKey)
    try {
      const next = await client(query, { signal: controller.signal })
      if (!mounted.current || activeRequest.current?.id !== id) return
      if (purpose === "continuation") {
        if (!query.continuation) throw new Error("Continuation request omitted its token")
        applyContinuation(next, query.continuation)
      } else {
        applyReplacement(next, query, purpose)
      }
    } catch (error) {
      if ((error instanceof DOMException && error.name === "AbortError") || activeRequest.current?.id !== id || !mounted.current) return
      setResponse({ contractVersion: "2.0", state: "error", code: "UNAVAILABLE", retryable: true, action: "retry" })
      setAnnouncement("Knowledge Map request failed safely.")
    } finally {
      if (mounted.current && activeRequest.current?.id === id) {
        activeRequest.current = null
        setBusy(false)
        if (purpose === "focus") setFocusPendingKey(null)
      }
    }
  }, [applyContinuation, applyReplacement, client])

  useEffect(() => {
    mounted.current = true
    if (!initialResponse) void runRequest(initialQuery)
    return () => {
      mounted.current = false
      activeRequest.current?.controller.abort()
      activeRequest.current = null
    }
  }, [initialQuery, initialResponse, runRequest])

  const nodeKinds = useMemo(() => {
    const kinds = new Map<string, { key: string; label: string; count: number; color: string }>()
    for (const node of nodes) {
      const key = nodeKindKey(node)
      const existing = kinds.get(key)
      kinds.set(key, {
        key,
        label: `${node.kind.name} (${node.kind.classification})`,
        count: (existing?.count ?? 0) + 1,
        color: nodeTone(node).color,
      })
    }
    return [...kinds.values()].sort((left, right) => left.key.localeCompare(right.key))
  }, [nodes])
  const relationshipKinds = useMemo(() => {
    const kinds = new Map<string, { key: string; label: string; count: number; color: string }>()
    for (const edge of edges) {
      const key = relationshipKindKey(edge)
      const existing = kinds.get(key)
      kinds.set(key, {
        key,
        label: relationshipKindLabel(edge),
        count: (existing?.count ?? 0) + 1,
        color: relationshipColor(edge.kind.name),
      })
    }
    return [...kinds.values()].sort((left, right) => left.key.localeCompare(right.key))
  }, [edges])
  const visible = useMemo(() => filterGraph(nodes, edges, hiddenNodeKinds, hiddenRelationshipKinds), [edges, hiddenNodeKinds, hiddenRelationshipKinds, nodes])
  const nodeByKey = useMemo(() => new Map(nodes.map((node) => [node.key, node])), [nodes])
  const selectedNode = selectedKey ? nodeByKey.get(selectedKey) ?? null : null
  const selectedEdges = selectedKey ? visible.edges.filter((edge) => edge.sourceNodeKey === selectedKey || edge.targetNodeKey === selectedKey) : []
  const matchingInspection = inspection?.nodeKey === selectedKey ? inspection : undefined
  const visibleEdgeKeys = useMemo(() => new Set(visible.edges.map((edge) => edge.key)), [visible.edges])
  const visibleInspection = matchingInspection ? {
    ...matchingInspection,
    lineage: matchingInspection.lineage.filter((link) => visibleEdgeKeys.has(link.relationshipKey)),
    relationshipKeys: matchingInspection.relationshipKeys.filter((key) => visibleEdgeKeys.has(key)),
  } : undefined
  const selectedEvidence = selectedNode ? visibleInspection?.evidence ?? selectedNode.evidence : undefined
  const hasStaleRecords = nodes.some((node) => node.freshness.state === "stale") || edges.some((edge) => edge.freshness.state === "stale")
  const filtersActive = hiddenNodeKinds.size > 0 || hiddenRelationshipKinds.size > 0
  const filteredEmpty = filtersActive && visible.nodes.length === 0
  const selectedTone = selectedNode ? nodeTone(selectedNode) : null

  const restoreSelectionFocus = useCallback((key: string | null) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const original = selectionOpener.current
        const controls = [...document.querySelectorAll<HTMLElement>("[data-node-key]")]
        const replacement = key ? controls.find((control) => control.dataset.nodeKey === key) : undefined
        const canvasNode = key ? [...document.querySelectorAll<HTMLElement>(".react-flow__node")].find((node) => node.dataset.id === key) : undefined
        if (selectionOpenerSurface.current === "canvas") {
          ;(canvasNode ?? replacement ?? controls[0])?.focus()
          return
        }
        if (original?.isConnected) {
          original.focus()
          return
        }
        ;(replacement ?? canvasNode ?? controls[0])?.focus()
      })
    })
  }, [])

  const clearSelection = useCallback(() => {
    cancelActiveRequest("focus")
    const key = selectedKey
    const previous = returnGraph.current
    if (previous) {
      returnGraph.current = null
      originQuery.current = previous.query
      snapshot.current = previous.response.snapshot
      continuationTokens.current = new Set(previous.continuationTokens)
      nodesRef.current = [...previous.nodes]
      edgesRef.current = [...previous.edges]
      setResponse(previous.response)
      setNodes(nodesRef.current)
      setEdges(edgesRef.current)
      setWarnings([...previous.warnings])
      setInspection(previous.inspection)
      setFocusContext(null)
    }
    setSelectedKey(null)
    setAnnouncement(previous ? "Returned to the overview map." : "Selection cleared.")
    restoreSelectionFocus(key)
  }, [cancelActiveRequest, restoreSelectionFocus, selectedKey])

  useEffect(() => {
    if (!selectedKey || visible.nodes.some((node) => node.key === selectedKey)) return
    cancelActiveRequest("focus")
    setSelectedKey(null)
    setAnnouncement("Selection cleared because the selected node is no longer visible.")
    restoreSelectionFocus(selectedKey)
  }, [cancelActiveRequest, restoreSelectionFocus, selectedKey, visible.nodes])

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string): void {
    setter((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function resetFilters(): void {
    setHiddenNodeKinds(new Set())
    setHiddenRelationshipKinds(new Set())
    setAnnouncement("Knowledge Map filters reset.")
  }

  function restartMap(): void {
    cancelActiveRequest()
    setSelectedKey(null)
    setContinuationIssue(null)
    setHiddenNodeKinds(new Set())
    setHiddenRelationshipKinds(new Set())
    void runRequest(OVERVIEW_QUERY)
  }

  async function selectNode(key: string, opener?: HTMLElement | null, openerSurface?: "canvas" | "text"): Promise<void> {
    const node = nodeByKey.get(key)
    if (!node) return
    if (!returnGraph.current && response && isGraphResponse(response)) {
      returnGraph.current = {
        response,
        nodes: [...nodesRef.current],
        edges: [...edgesRef.current],
        warnings: [...warnings],
        inspection,
        query: originQuery.current,
        continuationTokens: new Set(continuationTokens.current),
      }
    }
    const candidate = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    if (!candidate || !inspector.current?.contains(candidate)) {
      selectionOpener.current = candidate
      selectionOpenerSurface.current = openerSurface ?? (candidate?.closest(".react-flow__node") ? "canvas" : candidate?.dataset.nodeControl === "text" ? "text" : null)
    }
    setSelectedKey(key)
    setFocusContext(node.label)
    setAnnouncement(`${node.label} selected. Loading authoritative inspector details.`)
    requestAnimationFrame(() => {
      inspector.current?.focus({ preventScroll: true })
      if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches) {
        inspector.current?.scrollIntoView?.({ block: "start", behavior: "smooth" })
      }
    })
    await runRequest({ kind: "focus", focusNodeKey: key, direction: "both", depth: 2, includeLineage: node.entityType === "memory" }, "focus")
  }

  function loadMore(): void {
    if (!response || response.state !== "partial") return
    void runRequest({ ...originQuery.current, continuation: response.continuation } as SubgraphQuery, "continuation")
  }

  if (!response) return <StatePanel state="loading" heading="Loading Knowledge Map" detail="Authority and graph data are being verified." />
  if (continuationIssue) {
    return (
      <StatePanel state="continuation-conflict" heading="Knowledge Map continuation stopped" detail={continuationIssueCopy(continuationIssue)} action={{ label: "Restart map", run: restartMap }}>
        <p>The accumulated graph was retained in memory but is not presented as a current complete snapshot.</p>
      </StatePanel>
    )
  }
  if (response.state === "denied") {
    if (response.reasonCode === "LOGIN_REQUIRED") {
      return <StatePanel state="login-required" heading="Sign in to view the Knowledge Map" detail="No protected graph context is available before authentication."><a href={`${AUTH_LOGIN_PATH}?redirect_url=%2Fdashboard%2Fgraph`}>Sign in</a></StatePanel>
    }
    if (response.reasonCode === "CONTINUATION_AUTHORITY_MISMATCH") {
      return <StatePanel state="authority-changed" heading="Knowledge Map authority changed" detail="The continuation no longer belongs to the active principal or scope." action={{ label: "Restart map", run: restartMap }} />
    }
    if (response.reasonCode === "SCOPE_CONFLICT") {
      return <StatePanel state="scope-conflict" heading="Workspace scope conflict" detail="The active server-derived scope cannot authorize this graph request. No graph details are disclosed." />
    }
    return <StatePanel state="request-access" heading="Knowledge Map access not granted" detail="Your authenticated role does not include governed graph access."><p>Ask a workspace membership administrator to review your access. This page cannot grant or elevate permissions.</p></StatePanel>
  }
  if (response.state === "degraded") {
    const ambiguous = response.reasonCode === "AMBIGUOUS_ENDPOINTS"
    const unavailable = response.reasonCode === "GRAPH_DATA_UNAVAILABLE"
    return (
      <StatePanel
        state={ambiguous ? "ambiguous-endpoints" : unavailable ? "graph-unavailable" : "graph-v2-unavailable"}
        heading={ambiguous ? "Graph relationships need review" : unavailable ? "Governed graph data unavailable" : "Knowledge Map is not enabled"}
        detail={ambiguous ? "Ambiguous endpoints were quarantined; the interface will not guess their identities." : unavailable ? "The governed graph source could not complete this request. Event context, when present, is not graph-equivalent." : "The governed graph-v2 capability is unavailable for this deployment."}
        action={response.action === "retry" ? { label: "Retry", run: () => void runRequest(retryIntent.current.query, retryIntent.current.purpose) } : undefined}
      >
        <WarningList warnings={response.warnings} />
        {response.fallback ? (
          <section aria-label="Non-equivalent fallback context">
            <h3>Event context — not graph-equivalent</h3>
            <p>{response.fallback.summary}</p>
            <p>Observed {formatTimestamp(response.fallback.observedAt)}</p>
            <details><summary>Fallback source references ({response.fallback.sourceReferences.length})</summary><ul>{response.fallback.sourceReferences.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul></details>
          </section>
        ) : null}
        {returnGraph.current ? <button type="button" onClick={clearSelection}>Back to overview</button> : null}
      </StatePanel>
    )
  }
  if (response.state === "error") {
    if (response.action === "restart") return <StatePanel state="snapshot-conflict" heading="Knowledge Map changed" detail="The snapshot, policy, query, or continuation changed. Restart to request a current map." action={{ label: "Restart map", run: restartMap }} />
    if (response.code === "MALFORMED_QUERY") return <StatePanel state="invalid-query" heading="Knowledge Map request was invalid" detail="The traversal request was rejected without exposing graph details." />
    return <StatePanel state="error" heading="Knowledge Map unavailable" detail="The request could not be completed safely. No protected details are shown." action={response.action === "retry" ? { label: "Retry", run: () => void runRequest(retryIntent.current.query, retryIntent.current.purpose) } : undefined}>
      {returnGraph.current ? <button type="button" onClick={clearSelection}>Back to overview</button> : null}
    </StatePanel>
  }
  if (response.state === "empty" && nodes.length === 0) {
    return <StatePanel state="empty" heading="No governed relationships yet" detail="The healthy authorized query completed without graph records." action={{ label: "Refresh map", run: restartMap }}><WarningList warnings={warnings} /></StatePanel>
  }

  const governedSnapshot = snapshot.current ?? response.snapshot
  const displayState = response.state === "empty" ? "complete" : response.state

  return (
    <section className={styles.workspace} aria-label="Governed Knowledge Map" data-graph-state={displayState}>
      <p className={styles.srOnly} aria-live="polite">{announcement}</p>
      <header className={styles.graphHero}>
        <div>
          <p className={styles.eyebrow}>Governed Knowledge Hive</p>
          <h1>Knowledge Graph</h1>
          <p>Every node is a real authorized record. Lines show how knowledge is connected; select a node to open its card.</p>
        </div>
        <dl className={styles.snapshotSummary} aria-label="Governed snapshot status">
          <div><dt>Contract</dt><dd>v{response.contractVersion} · {displayState}</dd></div>
          <div><dt>Revision</dt><dd>{governedSnapshot.graphRevision}</dd></div>
          <div><dt>Policy epoch</dt><dd>{governedSnapshot.policyEpoch}</dd></div>
          <div><dt>Visible</dt><dd>{visible.nodes.length} nodes · {visible.edges.length} links</dd></div>
        </dl>
      </header>
      <p className={styles.snapshotContext}>{focusContext ? `Focused on ${focusContext}.` : "Overview."} Governed snapshot captured {formatTimestamp(governedSnapshot.capturedAt)}</p>
      {hasStaleRecords ? <p className={styles.staleBanner} role="status">Stale records are labeled in this snapshot.</p> : null}
      {warnings.length > 0 ? <div className={styles.warningBanner} role="status"><span>Partial context: {warnings.map(warningCopy).join(" ")}</span><WarningTechnicalDetails warnings={warnings} /></div> : null}

      <div className={styles.layout}>
        <aside className={styles.rail} aria-label="Knowledge Map filters and legend">
          <fieldset className={styles.filterCard}><legend>Show categories</legend>{nodeKinds.map((kind) => <label key={kind.key}><input type="checkbox" checked={!hiddenNodeKinds.has(kind.key)} onChange={() => toggle(setHiddenNodeKinds, kind.key)} /><span className={styles.categorySwatch} style={{ background: kind.color }} aria-hidden="true" /><span>{kind.label}</span><small aria-hidden="true">{kind.count}</small></label>)}</fieldset>
          <fieldset className={styles.filterCard}><legend>Relationships</legend>{relationshipKinds.map((kind) => <label key={kind.key}><input type="checkbox" checked={!hiddenRelationshipKinds.has(kind.key)} onChange={() => toggle(setHiddenRelationshipKinds, kind.key)} /><span className={styles.relationshipSwatch} style={{ color: kind.color }} aria-hidden="true" /><span>{kind.label}</span><small aria-hidden="true">{kind.count}</small></label>)}</fieldset>
          <p className={styles.legendNote}>Arrows show source → target. Unknown kinds stay labeled as unknown.</p>
          <div className={styles.railActions}>
            {filtersActive ? <button type="button" onClick={resetFilters}>Reset filters</button> : null}
            {response.state === "partial" ? <button type="button" disabled={busy} onClick={loadMore}>{busy ? "Loading…" : "Load next page"}</button> : null}
          </div>
        </aside>

        <div className={styles.mapColumn}>
          {filteredEmpty ? (
            <section className={styles.filteredEmpty} aria-live="polite"><h3>No nodes match the active filters</h3><p>The governed snapshot is unchanged. Reset filters to restore the map and text view.</p><button type="button" onClick={resetFilters}>Reset filters</button></section>
          ) : (
            <>
              <section className={styles.canvasPanel} aria-label="Knowledge Map canvas"><header><div><span className={styles.canvasStatusDot} aria-hidden="true" /><h2>Knowledge brain</h2></div><p>Compact nodes reveal the connected topology. Select one to open its full governed record in the inspector; the text view preserves complete keyboard access.</p></header><KnowledgeMapCanvas nodes={visible.nodes} edges={visible.edges} selectedKey={selectedKey} onSelect={(key, opener) => void selectNode(key, opener, "canvas")} /></section>
              <section className={styles.textPanel} aria-labelledby="relationship-heading">
                <header><h3 id="relationship-heading">Text relationships</h3><p>Same {visible.nodes.length} nodes and {visible.edges.length} directed relationships as the map.</p></header>
                <ul className={styles.nodeList} aria-label="Knowledge Map nodes">
                  {visible.nodes.map((node) => <li key={node.key}><button type="button" data-node-control="text" data-node-key={node.key} aria-pressed={selectedKey === node.key} onClick={(event) => void selectNode(node.key, event.currentTarget, "text")} onKeyDown={(event) => { if (event.key !== " ") return; event.preventDefault(); void selectNode(node.key, event.currentTarget, "text") }}><strong>{node.label}</strong><span>{node.kind.name} · {node.kind.classification} · {node.freshness.state}</span></button></li>)}
                </ul>
                <ul className={styles.edgeList} aria-label="Knowledge Map directed relationships">
                  {visible.edges.map((edge) => {
                    const source = nodeByKey.get(edge.sourceNodeKey)
                    const target = nodeByKey.get(edge.targetNodeKey)
                    const relationshipName = `${source?.label ?? edge.sourceNodeKey} — ${edge.label} → ${target?.label ?? edge.targetNodeKey}`
                    return source && target ? <li key={edge.key} data-relationship-key={edge.key}><span>{source.label}</span><strong>— {edge.label} →</strong><button type="button" aria-label={relationshipName} data-node-key={target.key} onClick={(event) => void selectNode(target.key, event.currentTarget)}>{target.label}</button><small data-evidence-state={edge.evidence.state}>{edge.kind.classification}: {edge.kind.name} · {evidenceCopy(edge.evidence)}</small></li> : null
                  })}
                </ul>
              </section>
            </>
          )}
        </div>

        <aside
          id="knowledge-map-inspector"
          ref={inspector}
          className={styles.inspector}
          aria-label="Selected node inspector"
          aria-live="polite"
          data-populated={selectedNode ? "true" : "false"}
          tabIndex={-1}
          style={selectedTone ? { "--inspector-accent": selectedTone.color, "--inspector-soft": selectedTone.soft } as React.CSSProperties : undefined}
        >
          <span className={styles.inspectorAccent} aria-hidden="true" />
          <header><div className={styles.inspectorIdentity}><span aria-hidden="true">{selectedNode?.label.slice(0, 1).toUpperCase() ?? "·"}</span><div><p className={styles.eyebrow}>Inspector</p><h3>{selectedNode?.label ?? "Select a node"}</h3></div></div>{selectedNode || returnGraph.current ? <button type="button" onClick={clearSelection}>{returnGraph.current ? "Back to overview" : "Clear selection"}</button> : null}</header>
          {selectedNode ? focusPendingKey === selectedNode.key ? (
            <div className={styles.inspectorLoading} role="status" aria-live="polite" aria-busy="true"><p>Loading authoritative details for {selectedNode.label}…</p></div>
          ) : (
            <div className={styles.inspectorBody}>
              <div className={styles.inspectorBadges}><span className={styles.kindBadge}>{selectedNode.kind.name} · {selectedNode.kind.classification}</span><span data-freshness={selectedNode.freshness.state}>{selectedNode.freshness.state}</span></div>
              <p>{visibleInspection?.content ?? visibleInspection?.summary ?? selectedNode.summary ?? "No authorized summary is available."}</p>
              <dl className={styles.inspectorFacts}><div><dt>Freshness</dt><dd>{formatTimestamp(selectedNode.freshness.observedAt)}</dd></div><div><dt>Provenance</dt><dd>{sourceLabel(visibleInspection?.provenance ?? selectedNode.source)}</dd></div><EvidenceDetails evidence={selectedEvidence ?? selectedNode.evidence} />{selectedNode.version ? <div><dt>Version</dt><dd>v{selectedNode.version.version} · {selectedNode.version.deprecated ? "deprecated" : "current"}</dd></div> : null}</dl>
              <section><h4>Directed context</h4>{selectedEdges.length === 0 ? <p>No admitted relationships in this page.</p> : <ul className={styles.inspectorLinks}>{selectedEdges.map((edge) => {
                const outgoing = edge.sourceNodeKey === selectedNode.key
                const connected = nodeByKey.get(outgoing ? edge.targetNodeKey : edge.sourceNodeKey)
                return connected ? <li key={edge.key}><span>{outgoing ? "Outgoing" : "Incoming"} · {edge.label}</span><small data-evidence-state={edge.evidence.state}>{evidenceCopy(edge.evidence)}</small><button type="button" data-node-key={connected.key} onClick={(event) => void selectNode(connected.key, event.currentTarget)}>{connected.label}</button></li> : null
              })}</ul>}</section>
              {visibleInspection?.lineage.length ? <section><h4>Lineage</h4><ul className={styles.lineageList}>{visibleInspection.lineage.map((link) => <li key={link.relationshipKey}><span>{nodeByKey.get(link.newerNodeKey)?.label ?? link.newerNodeKey}</span><strong> supersedes </strong><span>{nodeByKey.get(link.supersededNodeKey)?.label ?? link.supersededNodeKey}</span><code>{link.relationshipKey}</code></li>)}</ul></section> : null}
              <details><summary>Technical details</summary><dl className={styles.technicalDetails}><div><dt>Node key</dt><dd><code>{selectedNode.key}</code></dd></div>{matchingInspection ? <div><dt>Tenant / workspace</dt><dd><code>{matchingInspection.scope.tenantId} / {matchingInspection.scope.workspaceId}</code></dd></div> : null}{(() => {
                const provenance = visibleInspection?.provenance ?? selectedNode.source
                return provenance.kind === "record" ? <div><dt>Source record</dt><dd><code>{provenance.recordType}:{provenance.recordKey}</code></dd></div> : <div><dt>Derivation sources</dt><dd><code>{provenance.sourceRecordKeys.join(", ")}</code></dd></div>
              })()}{selectedEvidence?.state === "unavailable" ? <div><dt>Evidence reason</dt><dd><code>{selectedEvidence.reasonCode}</code></dd></div> : null}{visibleInspection ? <div><dt>Relationship keys</dt><dd><ul className={styles.referenceList}>{visibleInspection.relationshipKeys.map((key) => <li key={key}><code>{key}</code></li>)}</ul></dd></div> : null}</dl></details>
            </div>
          ) : <p className={styles.inspectorEmpty}>Select any node in the map or text view to inspect authorized details.</p>}
        </aside>
      </div>
    </section>
  )
}
