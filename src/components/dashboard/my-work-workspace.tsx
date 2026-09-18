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
import { useRef, useState } from "react"

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
  dataState: "ready" | "unavailable"
  processRunId?: string
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
  const [comparisonId, setComparisonId] = useState<string | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const comparisonOpener = useRef<HTMLButtonElement | null>(null)
  const mainDocument = useRef<HTMLElement | null>(null)

  function closeComparison() {
    setComparisonId(null)
    const target = comparisonOpener.current
    if (target?.isConnected) target.focus()
    else mainDocument.current?.focus()
  }

  if (dataState === "unavailable") {
    return (
      <StateFrame processRunId={processRunId} label="My Work local data state">
        <article className={styles.emptyDocument}>
          <LockKeyhole aria-hidden="true" />
          <p className={styles.eyebrow}>FAIL-CLOSED LOCAL MODE</p>
          <h1>Local data unavailable</h1>
          <p>The explicit disposable Epic 30 database is not enabled or could not prove this principal&apos;s scope. No static or production content was substituted.</p>
        </article>
      </StateFrame>
    )
  }

  if (documents.length === 0) {
    return (
      <StateFrame processRunId={processRunId} label="My Work empty authorized state">
        <article className={styles.emptyDocument}>
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
  const privateDocuments = documents.filter(({ visibility }) => visibility === "private")
  const departmentDocuments = documents.filter(({ visibility }) => visibility === "department")
  const availableDocument = departmentDocuments.find(({ id }) => id !== active.id)

  return (
    <section data-epic30-process={processRunId} className={styles.workspace} aria-label="My Work synthetic local workspace">
      <header className={styles.notice}>
        <span className={styles.statusDot} aria-hidden="true" />
        <strong>Synthetic local test data</strong>
        <span>Restricted role · disposable database · no model attached</span>
        <span className={styles.noticeEnd}><LockKeyhole size={13} aria-hidden="true" /> Scope verified server-side</span>
      </header>

      <div className={styles.appShell}>
        <aside className={styles.iconRail} aria-label="Workspace tools">
          <Image className={styles.lettermark} src="/brand/allura-lettermark-al-figma.png" width={34} height={34} alt="Allura" priority />
          <button className={styles.railActive} aria-label="Documents"><BookOpenText aria-hidden="true" /></button>
          <button aria-label="Memory map"><GitBranch aria-hidden="true" /></button>
          <button aria-label="Ask Allura" onClick={() => setAskOpen((open) => !open)}><MessageSquareText aria-hidden="true" /></button>
          <button className={styles.railBottom} aria-label="Workspace scope"><LockKeyhole aria-hidden="true" /></button>
        </aside>

        <nav className={styles.tree} aria-label="Authorized synthetic Brain tree">
          <div className={styles.brandBlock}><span>ALLURA</span><strong>My Work</strong></div>
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <span className={styles.visuallyHidden}>Search authorized synthetic workspace</span>
            <input placeholder="Search workspace" title="Search is not enabled" disabled />
            <kbd>⌘ K</kbd>
          </label>

          <div className={styles.treeSection}>
            <p className={styles.treeLabel}><ChevronDown aria-hidden="true" /> YOUR BRAIN <span>{privateDocuments.length}</span></p>
            {privateDocuments.length === 0 ? <p className={styles.muted}>No private documents</p> : null}
            {privateDocuments.map((item) => (
              <button key={item.id} className={active.id === item.id ? styles.selected : ""} onClick={() => setActiveId(item.id)}>
                <FileText aria-hidden="true" /><span>{item.title}<small>Private</small></span>
              </button>
            ))}
          </div>

          <div className={styles.treeSection}>
            <p className={styles.treeLabel}><ChevronDown aria-hidden="true" /> APPROVED DEPARTMENTS <span>{departmentDocuments.length}</span></p>
            {departmentDocuments.length === 0 ? <p className={styles.muted}>No approved department documents</p> : null}
            {departmentDocuments.map((item) => (
              <button key={item.id} className={active.id === item.id ? styles.selected : ""} onClick={() => setActiveId(item.id)}>
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
          <header className={styles.toolbar}>
            <div><p className={styles.eyebrow}>MY WORK / AUTHORIZED VIEW</p><h1>Read, connect, and verify.</h1></div>
            <div className={styles.toolbarMeta}><span>Epic 30</span><span>{documents.length} visible</span></div>
          </header>

          <div className={styles.tabs} aria-label="Open workspace panes">
            <div className={styles.activeTab}><FileText aria-hidden="true" /><span>{active.title}</span><i /></div>
            <div><BrainCircuit aria-hidden="true" /><span>Context map</span></div>
          </div>

          <div className={styles.workGrid}>
            <article ref={mainDocument} tabIndex={-1} className={styles.document}>
              <div className={styles.breadcrumbs}>My Work <span>/</span> {active.visibility === "private" ? "Private" : active.departmentId} <span>/</span> {active.title}</div>
              <p className={styles.eyebrow}>{active.visibility === "private" ? "Private" : "Department"} · SYNTHETIC DATABASE</p>
              <h2>{active.title}</h2>
              <p className={styles.detail}>Updated {new Date(active.updatedAt).toLocaleString()}</p>
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
              <aside className={styles.comparison} aria-label="Comparison pane">
                <header><p className={styles.eyebrow}>Comparison pane — synthetic database</p><button aria-label="Dismiss comparison" onClick={closeComparison}><PanelRightClose aria-hidden="true" /></button></header>
                <h2>{comparison.title}</h2>
                <p className={styles.detail}>{comparison.departmentId ?? "Private"} · Read only</p>
                <div className={styles.rule} />
                <p className={styles.lede}>{comparison.content}</p>
                <button className={styles.closeButton} onClick={closeComparison}>Close pane</button>
              </aside>
            ) : (
              <aside className={styles.mapPanel} aria-label="Authorized document context map">
                <header><div><p className={styles.eyebrow}>CONTEXT MAP</p><h2>Visible scope</h2></div><span>PROXIMITY ONLY</span></header>
                <div className={styles.mapCanvas}>
                  <div className={styles.mapCore}><BrainCircuit aria-hidden="true" /><span>My Work</span></div>
                  {documents.slice(0, 6).map((item, index) => <button key={item.id} className={`${styles.mapNode} ${styles[`mapNode${index + 1}`]}`} onClick={() => setActiveId(item.id)}><i /><span>{item.title}</span></button>)}
                </div>
                <p className={styles.mapCaption}>Documents are co-visible in this authorized scope. Position does not assert a verified relationship.</p>
              </aside>
            )}
          </div>

          <aside className={styles.inspector} aria-label="Document inspector">
            <div className={styles.inspectorTabs}><strong>Outline</strong><span>Context</span></div>
            <section><p className={styles.treeLabel}>DOCUMENT</p><button className={styles.inspectorActive}>Overview</button><button>Available department document</button></section>
            <section>
              <p className={styles.treeLabel}>ACCESS</p>
              <dl><div><dt>Visibility</dt><dd>{active.visibility}</dd></div><div><dt>Department</dt><dd>{active.departmentId ?? "—"}</dd></div><div><dt>Owner</dt><dd>{active.ownerId}</dd></div></dl>
            </section>
            <section className={styles.proofNote}><LockKeyhole aria-hidden="true" /><div><strong>Authority boundary</strong><p>Scope comes from the server-owned principal, not browser input.</p></div></section>
          </aside>

          <section className={styles.ask} aria-label="Ask allura">
            <button aria-label="Ask allura" aria-expanded={askOpen} onClick={() => setAskOpen((open) => !open)}><MessageSquareText aria-hidden="true" /><span>Ask allura</span><kbd>⌘ ↵</kbd></button>
            {askOpen ? <div><strong>Unavailable in this local fixture</strong><p>External-model retention and training policy evidence has not been verified. No real content is sent, and no answer is generated.</p></div> : <p>Read-only, cited AI is intentionally unavailable until its no-retention policy is verified.</p>}
          </section>
        </main>
      </div>
    </section>
  )
}
