"use client"

import {
  BookOpenText,
  BrainCircuit,
  ChevronDown,
  FileText,
  FolderClosed,
  GitBranch,
  LockKeyhole,
  MessageSquareText,
  PanelRightClose,
  Search,
} from "lucide-react"
import Image from "next/image"
import { useEffect, useId, useRef, useState } from "react"

import styles from "./my-work-workspace.module.css"

export interface WorkspaceDocument {
  id: string
  groupId: string
  workspaceId: string
  ownerId: string
  departmentId: string | null
  visibility: "private" | "department"
  title: string
  content: string
  updatedAt: string
}

export interface MyWorkWorkspaceProps {
  documents: readonly WorkspaceDocument[]
  dataState: WorkspaceDataState
  processRunId?: string
}

export type WorkspaceDataState =
  | "loading"
  | "empty"
  | "forbidden"
  | "stale"
  | "degraded"
  | "conflict"
  | "error"
  | "complete"
  | "unavailable"

type NonContentState = Exclude<WorkspaceDataState, "complete" | "empty">

const NON_CONTENT_STATES: Record<NonContentState, { eyebrow: string; heading: string; detail: string }> = {
  loading: {
    eyebrow: "VERIFYING AUTHORITY",
    heading: "Loading authorized workspace",
    detail: "Authority and content are being verified. No document content is shown until both checks complete.",
  },
  forbidden: {
    eyebrow: "ACCESS DENIED",
    heading: "Access not permitted",
    detail: "This request is not authorized. No document names, counts, snippets, or existence details are disclosed.",
  },
  stale: {
    eyebrow: "AUTHORITY STALE",
    heading: "Workspace needs refresh",
    detail: "The verified authority epoch is no longer current. Cached content is hidden until authority is revalidated.",
  },
  degraded: {
    eyebrow: "DEPENDENCY DEGRADED",
    heading: "Workspace temporarily unavailable",
    detail: "A required authority or receipt dependency is degraded. The workspace remains closed rather than returning partial content.",
  },
  conflict: {
    eyebrow: "AUTHORITY CONFLICT",
    heading: "Workspace changed",
    detail: "Verified scope changed during this request. No content is returned until the current scope is resolved.",
  },
  error: {
    eyebrow: "REQUEST FAILED",
    heading: "Workspace unavailable",
    detail: "The request could not be completed safely. No backend, scope, or protected-content details are exposed.",
  },
  unavailable: {
    eyebrow: "FAIL-CLOSED LOCAL MODE",
    heading: "Local data unavailable",
    detail: "The explicit disposable Epic 30 database is not enabled or could not prove this principal's scope. No static or production content was substituted.",
  },
}

const MOBILE_COMPARISON_QUERY = "(max-width: 760px)"

function useMobileComparison(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia?.(MOBILE_COMPARISON_QUERY)
    if (!media) return
    const update = () => setIsMobile(media.matches)
    update()
    if (media.addEventListener) {
      media.addEventListener("change", update)
      return () => media.removeEventListener("change", update)
    }
    media.addListener?.(update)
    return () => media.removeListener?.(update)
  }, [])

  return isMobile
}

function formatUtcTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`
}

function StateFrame({ children, processRunId, label }: { children: React.ReactNode; processRunId?: string; label: string }): React.ReactElement {
  return (
    <section data-epic30-process={processRunId} className={styles.stateFrame} aria-label={label}>
      <header className={styles.notice}>
        <span className={styles.statusDot} aria-hidden="true" />
        <strong>Synthetic local test data</strong>
        <span>No production data is available or requested.</span>
      </header>
      {children}
    </section>
  )
}

export function MyWorkWorkspace({ documents, dataState, processRunId }: MyWorkWorkspaceProps): React.ReactElement {
  const [activeId, setActiveId] = useState(documents[0]?.id ?? "")
  const [openDocumentIds, setOpenDocumentIds] = useState<string[]>(documents[0] ? [documents[0].id] : [])
  const [comparisonId, setComparisonId] = useState<string | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const askStatusId = useId()
  const memoryTabsId = useId()
  const isMobileComparison = useMobileComparison()
  const comparisonOpener = useRef<HTMLButtonElement | null>(null)
  const comparisonPane = useRef<HTMLElement | null>(null)
  const contextMap = useRef<HTMLElement | null>(null)
  const pendingComparisonFocus = useRef(false)
  const workspace = useRef<HTMLElement | null>(null)
  const mainDocument = useRef<HTMLElement | null>(null)
  const memoryTabs = useRef<HTMLDivElement | null>(null)
  const comparisonExists = comparisonId !== null && documents.some(({ id }) => id === comparisonId)

  function closeComparison() {
    pendingComparisonFocus.current = true
    setComparisonId(null)
  }

  function selectDocument(id: string) {
    if (comparisonId === id) setComparisonId(null)
    setOpenDocumentIds((current) => current.includes(id) ? current : [...current, id])
    setActiveId(id)
  }

  function handleMemoryTabKey(event: React.KeyboardEvent<HTMLButtonElement>, id: string) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    const openIds = openDocumentIds.filter((openId) => documents.some((item) => item.id === openId))
    const index = openIds.indexOf(id)
    if (index < 0 || openIds.length === 0) return
    event.preventDefault()
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? openIds.length - 1 :
      (index + (event.key === "ArrowRight" ? 1 : -1) + openIds.length) % openIds.length
    selectDocument(openIds[nextIndex])
    requestAnimationFrame(() => memoryTabs.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[nextIndex]?.focus())
  }

  useEffect(() => {
    const documentIds = new Set(documents.map(({ id }) => id))
    const reconciledOpenIds = openDocumentIds.filter((id) => documentIds.has(id))
    const nextOpenIds = reconciledOpenIds.length > 0 ? reconciledOpenIds : documents[0] ? [documents[0].id] : []
    if (nextOpenIds.join("\0") !== openDocumentIds.join("\0")) setOpenDocumentIds(nextOpenIds)
    if (comparisonId && !documentIds.has(comparisonId)) {
      pendingComparisonFocus.current = true
      setComparisonId(null)
    }
    if (activeId && !documentIds.has(activeId)) setActiveId(documents[0]?.id ?? "")
    if (!activeId && documents[0]) setActiveId(documents[0].id)
  }, [activeId, comparisonId, documents, openDocumentIds])

  useEffect(() => {
    if (!comparisonExists || !isMobileComparison) return

    const pane = comparisonPane.current
    const root = workspace.current
    if (!pane || !root) return
    const background = Array.from(root.querySelectorAll<HTMLElement>("[data-comparison-background]"))
    const inertState = background.map((element) => ({ element, hadInert: element.hasAttribute("inert") }))
    inertState.forEach(({ element }) => element.setAttribute("inert", ""))
    pane.querySelector<HTMLElement>("button")?.focus()

    return () => inertState.forEach(({ element, hadInert }) => {
      if (!hadInert) element.removeAttribute("inert")
    })
  }, [comparisonExists, isMobileComparison])

  useEffect(() => {
    if (comparisonId !== null || !pendingComparisonFocus.current) return
    pendingComparisonFocus.current = false
    const target = comparisonOpener.current
    if (target?.isConnected) target.focus()
    else mainDocument.current?.focus()
  }, [comparisonId])

  function containComparisonFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (!isMobileComparison) return
    if (event.key === "Escape") {
      event.preventDefault()
      closeComparison()
      return
    }
    if (event.key !== "Tab") return
    const focusable = Array.from(comparisonPane.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? [])
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (dataState !== "complete" && dataState !== "empty") {
    const state = NON_CONTENT_STATES[dataState]
    return (
      <StateFrame processRunId={processRunId} label={`My Work ${dataState} state`}>
        <article
          className={styles.emptyDocument}
          data-surface-state={dataState}
          role={dataState === "loading" ? "status" : "alert"}
          aria-live={dataState === "loading" ? "polite" : "assertive"}
        >
          <LockKeyhole aria-hidden="true" />
          <p className={styles.eyebrow}>{state.eyebrow}</p>
          <h1>{state.heading}</h1>
          <p>{state.detail}</p>
        </article>
      </StateFrame>
    )
  }

  if (dataState === "empty" || documents.length === 0) {
    return (
      <StateFrame processRunId={processRunId} label="My Work empty authorized state">
        <article className={styles.emptyDocument} data-surface-state="empty" role="status">
          <FolderClosed aria-hidden="true" />
          <p className={styles.eyebrow}>AUTHORIZED EMPTY STATE</p>
          <h1>No authorized documents</h1>
          <p>This principal has no owner-private or approved-department documents in the synthetic workspace.</p>
        </article>
      </StateFrame>
    )
  }

  const active = documents.find((item) => item.id === activeId) ?? documents[0]
  const comparison = documents.find((item) => item.id === comparisonId)
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const searchDocuments = normalizedSearch.length === 0 ? documents : documents.filter((item) =>
    item.title.toLocaleLowerCase().includes(normalizedSearch) || item.content.toLocaleLowerCase().includes(normalizedSearch))
  const privateDocuments = searchDocuments.filter(({ visibility }) => visibility === "private")
  const departmentDocuments = searchDocuments.filter(({ visibility }) => visibility === "department")
  const hasSearchMatches = searchDocuments.length > 0
  const availableDocument = departmentDocuments.find(({ id }) => id !== active.id)
  const openDocuments = openDocumentIds.map((id) => documents.find((item) => item.id === id)).filter((item): item is WorkspaceDocument => Boolean(item))
  const activeDocumentIndex = documents.findIndex(({ id }) => id === active.id)
  const activePanelId = `${memoryTabsId}-panel-${activeDocumentIndex}`

  return (
    <section ref={workspace} data-epic30-process={processRunId} className={styles.workspace} aria-label="My Work synthetic local workspace">
      <header className={styles.notice} data-comparison-background>
        <span className={styles.statusDot} aria-hidden="true" />
        <strong>Synthetic local test data</strong>
        <span>Restricted role · disposable database · no model attached</span>
        <span className={styles.noticeEnd}><LockKeyhole size={13} aria-hidden="true" /> Scope verified server-side</span>
      </header>

      <div className={styles.appShell}>
        <aside className={styles.iconRail} aria-label="Workspace tools" data-comparison-background>
          <Image className={styles.lettermark} src="/brand/allura-lettermark-al-figma.png" width={34} height={34} alt="Allura" priority />
          <button className={styles.railActive} aria-label="Documents" aria-current="page"><BookOpenText aria-hidden="true" /></button>
          <button aria-label="Memory map is shown in the current workspace" title="Memory map is shown in the current workspace" disabled><GitBranch aria-hidden="true" /></button>
          <button aria-label="Ask Allura" aria-expanded={askOpen} aria-controls={askStatusId} onClick={() => setAskOpen((open) => !open)}><MessageSquareText aria-hidden="true" /></button>
          <button className={styles.railBottom} aria-label="Workspace scope is verified server-side" title="Workspace scope is verified server-side" disabled><LockKeyhole aria-hidden="true" /></button>
        </aside>

        <nav className={styles.tree} aria-label="Authorized synthetic Brain tree" data-comparison-background>
          <div className={styles.brandBlock}><span>ALLURA</span><strong>My Work</strong></div>
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <span className={styles.visuallyHidden}>Search authorized synthetic workspace</span>
            <input type="search" autoComplete="off" placeholder="Search workspace" value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Escape") setSearchQuery("") }} />
          </label>

          {normalizedSearch && !hasSearchMatches ? <p className={styles.searchStatus} role="status">No authorized matches.</p> : null}

          <div className={styles.treeSection} hidden={Boolean(normalizedSearch) && !hasSearchMatches}>
            <p className={styles.treeLabel}><ChevronDown aria-hidden="true" /> YOUR BRAIN <span>{privateDocuments.length}</span></p>
            {privateDocuments.length === 0 ? <p className={styles.muted}>{normalizedSearch ? "No private matches" : "No private documents"}</p> : null}
            {privateDocuments.map((item) => (
              <button key={item.id} className={active.id === item.id ? styles.selected : ""} aria-current={active.id === item.id ? "page" : undefined} onClick={() => selectDocument(item.id)}>
                <FileText aria-hidden="true" /><span>{item.title}<small>Private</small></span>
              </button>
            ))}
          </div>

          <div className={styles.treeSection} hidden={Boolean(normalizedSearch) && !hasSearchMatches}>
            <p className={styles.treeLabel}><ChevronDown aria-hidden="true" /> APPROVED DEPARTMENTS <span>{departmentDocuments.length}</span></p>
            {departmentDocuments.length === 0 ? <p className={styles.muted}>{normalizedSearch ? "No department matches" : "No approved department documents"}</p> : null}
            {departmentDocuments.map((item) => (
              <button key={item.id} className={active.id === item.id ? styles.selected : ""} aria-current={active.id === item.id ? "page" : undefined} onClick={() => selectDocument(item.id)}>
                <FileText aria-hidden="true" /><span>{item.title}<small>{item.departmentId}</small></span>
              </button>
            ))}
          </div>

          <dl className={styles.scopeCard}>
            <div><dt>Workspace</dt><dd>{active.workspaceId}</dd></div>
            <div><dt>Visible records</dt><dd>{documents.length}</dd></div>
          </dl>
        </nav>

        <main className={styles.mainArea}>
          <header className={styles.toolbar} data-comparison-background>
            <div><p className={styles.eyebrow}>MY WORK / AUTHORIZED VIEW</p><h1>Read, connect, and verify.</h1></div>
            <div className={styles.toolbarMeta}><span>Epic 30</span><span>{documents.length} visible</span></div>
          </header>

          <div className={styles.tabs} data-comparison-background>
            <div ref={memoryTabs} className={styles.memoryTabs} role="tablist" aria-label="Open memory tabs">
              {openDocuments.map((item) => {
                const documentIndex = documents.findIndex(({ id }) => id === item.id)
                const selected = item.id === active.id
                return <button key={item.id} type="button" role="tab" id={`${memoryTabsId}-tab-${documentIndex}`}
                  aria-controls={`${memoryTabsId}-panel-${documentIndex}`} aria-selected={selected} tabIndex={selected ? 0 : -1}
                  className={selected ? styles.activeTab : ""} aria-label={`Focus document: ${item.title}`}
                  onClick={() => selectDocument(item.id)} onKeyDown={(event) => handleMemoryTabKey(event, item.id)}>
                  <FileText aria-hidden="true" /><span>{item.title}</span><i />
                </button>
              })}
            </div>
            <button type="button" aria-label={comparison ? "Focus comparison pane" : "Focus context map"} disabled={isMobileComparison && !comparison} onClick={() => (comparison ? comparisonPane.current : contextMap.current)?.focus()}><BrainCircuit aria-hidden="true" /><span>{comparison ? "Comparison" : "Context map"}</span></button>
          </div>

          <div className={styles.workGrid}>
            <article ref={mainDocument} id={activePanelId} role="tabpanel" aria-labelledby={`${memoryTabsId}-tab-${activeDocumentIndex}`} tabIndex={-1} className={styles.document} data-comparison-background>
              <div className={styles.breadcrumbs}>My Work <span>/</span> {active.visibility === "private" ? "Private" : active.departmentId} <span>/</span> {active.title}</div>
              <p className={styles.eyebrow}>{active.visibility === "private" ? "Private" : "Department"} · SYNTHETIC DATABASE</p>
              <h2>{active.title}</h2>
              <p className={styles.detail}>Updated {formatUtcTimestamp(active.updatedAt)}</p>
              <div className={styles.rule} />
              <p className={styles.lede}>{active.content}</p>
              <section className={styles.documentSection}>
                <span className={styles.sectionNumber}>01</span>
                <div>
                  <h3>Available department document</h3>
                  {availableDocument ? (
                    <button className={styles.linkButton} onClick={(event) => { comparisonOpener.current = event.currentTarget; setComparisonId(availableDocument.id) }}>
                      Open {availableDocument.title.toLowerCase()} <span aria-hidden="true">↗</span>
                    </button>
                  ) : <p className={styles.muted}>No other department document is available.</p>}
                  <p className={styles.backlink}>Available for comparison; no document relationship has been verified.</p>
                </div>
              </section>
            </article>

            {comparison ? (
              <aside
                ref={comparisonPane}
                className={styles.comparison}
                tabIndex={-1}
                aria-label="Comparison pane"
                role={isMobileComparison ? "dialog" : "complementary"}
                aria-modal={isMobileComparison ? "true" : undefined}
                onKeyDown={containComparisonFocus}
              >
                <header><p className={styles.eyebrow}>Comparison pane — synthetic database</p><button aria-label="Dismiss comparison" onClick={closeComparison}><PanelRightClose aria-hidden="true" /></button></header>
                <h2>{comparison.title}</h2>
                <p className={styles.detail}>{comparison.departmentId ?? "Private"} · Read only</p>
                <div className={styles.rule} />
                <p className={styles.lede}>{comparison.content}</p>
                <button className={styles.closeButton} onClick={closeComparison}>Close pane</button>
              </aside>
            ) : (
              <aside ref={contextMap} tabIndex={-1} className={styles.mapPanel} aria-label="Authorized document context map">
                <header><div><p className={styles.eyebrow}>CONTEXT MAP</p><h2>Visible scope</h2></div><span>PROXIMITY ONLY</span></header>
                <div className={styles.mapCanvas}>
                  <div className={styles.mapCore}><BrainCircuit aria-hidden="true" /><span>My Work</span></div>
                  {documents.slice(0, 6).map((item, index) => <button key={item.id} className={`${styles.mapNode} ${styles[`mapNode${index + 1}`]}`} aria-current={active.id === item.id ? "page" : undefined} onClick={() => selectDocument(item.id)}><i /><span>{item.title}</span></button>)}
                </div>
                <p className={styles.mapCaption}>Showing {Math.min(documents.length, 6)} of {documents.length} visible documents. Documents are co-visible in this authorized scope. Position does not assert a verified relationship.</p>
              </aside>
            )}
          </div>

          <aside className={styles.inspector} aria-label="Document inspector" data-comparison-background>
            <div className={styles.inspectorTabs}><strong>Outline</strong><span>Context</span></div>
            <section><p className={styles.treeLabel}>DOCUMENT</p><div className={styles.inspectorLinks}><strong>Overview</strong><span>Available department document</span></div></section>
            <section>
              <p className={styles.treeLabel}>ACCESS</p>
              <dl><div><dt>Visibility</dt><dd>{active.visibility}</dd></div><div><dt>Department</dt><dd>{active.departmentId ?? "—"}</dd></div><div><dt>Owner</dt><dd>{active.ownerId}</dd></div></dl>
            </section>
            <section className={styles.proofNote}><LockKeyhole aria-hidden="true" /><div><strong>Authority boundary</strong><p>Scope comes from the server-owned principal, not browser input.</p></div></section>
          </aside>

          <section className={styles.ask} aria-label="Ask allura" data-comparison-background>
            <button aria-label="Ask allura" aria-expanded={askOpen} aria-controls={askStatusId} onClick={() => setAskOpen((open) => !open)}><MessageSquareText aria-hidden="true" /><span>Ask allura</span></button>
            {askOpen ? <div id={askStatusId}><strong>Unavailable in this local fixture</strong><p>External-model retention and training policy evidence has not been verified. No real content is sent, and no answer is generated.</p></div> : <p id={askStatusId}>Read-only, cited AI is intentionally unavailable until its no-retention policy is verified.</p>}
          </section>
        </main>
      </div>
    </section>
  )
}
