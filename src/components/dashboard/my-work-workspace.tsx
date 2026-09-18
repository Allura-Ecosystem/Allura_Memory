"use client"

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
      <section data-epic30-process={processRunId} className={styles.workspace} aria-label="My Work local data state">
        <header className={styles.notice}>
          <strong>Synthetic local test data</strong>
          <span>No production data is available or requested.</span>
        </header>
        <article className={styles.document}>
          <p className={styles.eyebrow}>FAIL-CLOSED LOCAL MODE</p>
          <h1>Local data unavailable</h1>
          <p>The explicit disposable Epic 30 database is not enabled or could not prove this principal&apos;s scope. No static or production content was substituted.</p>
        </article>
      </section>
    )
  }

  if (documents.length === 0) {
    return (
      <section data-epic30-process={processRunId} className={styles.workspace} aria-label="My Work empty authorized state">
        <header className={styles.notice}>
          <strong>Synthetic local test data</strong>
          <span>Restricted-role database read completed.</span>
        </header>
        <article className={styles.document}>
          <p className={styles.eyebrow}>AUTHORIZED EMPTY STATE</p>
          <h1>No authorized documents</h1>
          <p>This principal has no owner-private or approved-department documents in the synthetic workspace.</p>
        </article>
      </section>
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
        <strong>Synthetic local test data</strong>
        <span>Read from an explicit disposable database through the restricted application role. No model or production database is attached.</span>
      </header>
      <div className={styles.toolbar}>
        <div><p className={styles.eyebrow}>MY WORK</p><h1>Read, connect, and verify.</h1></div>
        <label className={styles.search}><span className="sr-only">Search authorized synthetic workspace</span><input placeholder="Search is not enabled" disabled /></label>
      </div>
      <div className={styles.layout}>
        <nav className={styles.tree} aria-label="Authorized synthetic Brain tree">
          <p className={styles.treeLabel}>YOUR BRAIN</p>
          {privateDocuments.length === 0 ? <p className={styles.muted}>No private documents</p> : null}
          {privateDocuments.map((item) => <button key={item.id} className={active.id === item.id ? styles.selected : ""} onClick={() => setActiveId(item.id)}>{item.title}<small>Private</small></button>)}
          <p className={styles.treeLabel}>APPROVED DEPARTMENTS</p>
          {departmentDocuments.length === 0 ? <p className={styles.muted}>No approved department documents</p> : null}
          {departmentDocuments.map((item) => <button key={item.id} className={active.id === item.id ? styles.selected : ""} onClick={() => setActiveId(item.id)}>{item.title}<small>{item.departmentId}</small></button>)}
        </nav>
        <article ref={mainDocument} tabIndex={-1} className={styles.document}>
          <p className={styles.eyebrow}>{active.visibility === "private" ? "Private" : "Department"} · SYNTHETIC DATABASE</p>
          <h2>{active.title}</h2>
          <p className={styles.detail}>Updated {new Date(active.updatedAt).toLocaleString()}</p>
          <p>{active.content}</p>
          <h3>Available department document</h3>
          {availableDocument ? <button className={styles.linkButton} onClick={(event) => { comparisonOpener.current = event.currentTarget; setComparisonId(availableDocument.id) }}>Open {availableDocument.title.toLowerCase()}</button> : <p className={styles.muted}>No other department document is available.</p>}
          <p className={styles.backlink}>Available for comparison; no document relationship has been verified.</p>
        </article>
        {comparison ? <aside className={styles.comparison} aria-label="Comparison pane"><p className={styles.eyebrow}>Comparison pane — synthetic database</p><h2>{comparison.title}</h2><p>{comparison.content}</p><button onClick={closeComparison}>Close pane</button></aside> : null}
      </div>
      <section className={styles.ask} aria-label="Ask allura">
        <button aria-expanded={askOpen} onClick={() => setAskOpen((open) => !open)}>Ask allura</button>
        {askOpen ? <div><strong>Unavailable in this local fixture</strong><p>External-model retention and training policy evidence has not been verified. No real content is sent, and no answer is generated.</p></div> : <p>Read-only, cited AI is intentionally unavailable until its no-retention policy is verified.</p>}
      </section>
    </section>
  )
}
