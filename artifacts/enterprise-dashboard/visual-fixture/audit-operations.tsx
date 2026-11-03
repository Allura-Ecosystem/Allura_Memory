import { useState } from 'react'

const sampleEvents = [
  { id: 'SAMPLE-001', action: 'Proposal submitted', workspace: 'Company Knowledge', outcome: 'Recorded', actor: 'Alex Morgan · fictional', target: 'Sample handbook revision', detail: 'Illustrates recording a contribution before review. No proposal was submitted to Allura.' },
  { id: 'SAMPLE-002', action: 'Memory read denied', workspace: 'HR', outcome: 'Denied', actor: 'Example Sales viewer · fictional', target: 'Redacted — restricted target', detail: 'Illustrates a workspace-access denial. No record title, content, or restricted identifier is included.' },
  { id: 'SAMPLE-003', action: 'Device enrollment requested', workspace: 'IT', outcome: 'Pending', actor: 'Taylor Chen · fictional', target: 'Example operations host', detail: 'Illustrates a request awaiting an independent decision. No device was enrolled or credential issued.' },
  { id: 'SAMPLE-004', action: 'Ingestion attempt', workspace: 'Marketing', outcome: 'Failed', actor: 'Example ingestion agent · fictional', target: 'Sample campaign source', detail: 'Illustrative failure: a source could not be retrieved. No retry or connector call runs from this preview.' },
  { id: 'SAMPLE-005', action: 'Review rationale recorded', workspace: 'Sales', outcome: 'Recorded', actor: 'Jordan Lee · fictional', target: 'Sample sales playbook', detail: 'Illustrates an audit entry for a human rationale. This is not an approval receipt or evidence of promotion.' },
]
const workspaces = ['Company Knowledge', 'HR', 'Marketing', 'IT', 'Sales']
const operations = [
  { area: 'Connection health', state: 'Unknown', example: 'No connection probe is performed in this preview.', evidence: 'Live read status, response time, and last successful response.' },
  { area: 'Ingestion freshness', state: 'Stale · example', example: 'A fictional source has not supplied recent material.', evidence: 'Source revision, last observed timestamp, and expected publishing schedule.' },
  { area: 'Indexing job', state: 'Failed · example', example: 'A fictional embedding task could not finish.', evidence: 'Job identifier, sanitized error, retry history, and actual index state.' },
  { area: 'Backup recovery', state: 'Not verified', example: 'No backup or recovery exercise has been run.', evidence: 'Dated restore exercise, integrity checks, and measured recovery duration.' },
]

export function AuditOperations(): React.ReactElement {
  const [tab, setTab] = useState<'audit' | 'operations'>('audit')
  const [workspace, setWorkspace] = useState('All sample workspaces')
  const [outcome, setOutcome] = useState('All sample outcomes')
  const [selectedId, setSelectedId] = useState(sampleEvents[0].id)
  const [operation, setOperation] = useState(0)
  const visible = sampleEvents.filter(item => (workspace === 'All sample workspaces' || item.workspace === workspace)
    && (outcome === 'All sample outcomes' || item.outcome === outcome))
  const selected = visible.find(item => item.id === selectedId) ?? visible[0]
  return <>
    <p className="sample-note">Design sample · Fictional audit events and operational states. Nothing here proves real access enforcement, service health, recovery readiness, or compliance. No events are written or retrieved.</p>
    <div className="preview-toolbar" aria-label="Audit and operations views">
      <button type="button" aria-pressed={tab === 'audit'} onClick={() => setTab('audit')}>Audit events</button>
      <button type="button" aria-pressed={tab === 'operations'} onClick={() => setTab('operations')}>Operations evidence</button>
    </div>
    {tab === 'audit' ? <>
      <div className="preview-toolbar">
        <label>Audit workspace<select value={workspace} onChange={event => setWorkspace(event.target.value)}><option>All sample workspaces</option>{workspaces.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Event outcome<select value={outcome} onChange={event => setOutcome(event.target.value)}><option>All sample outcomes</option>{['Recorded', 'Denied', 'Pending', 'Failed'].map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <p className="muted" role="status">{visible.length} of {sampleEvents.length} fictional events match the filters. All outcomes are examples.</p>
      <div className="preview-split">
        <div className="table-scroll" role="region" aria-label="Sample audit events" tabIndex={0}>
          <table><thead><tr><th>Sample action</th><th>Workspace</th><th>Outcome</th></tr></thead><tbody>{visible.map(item => <tr key={item.id}><td><button type="button" className="text-button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)}>{item.action}</button></td><td>{item.workspace}</td><td>{item.outcome} · sample</td></tr>)}</tbody></table>
          {visible.length === 0 && <p className="sample-note">No sample events match these filters.</p>}
        </div>
        <aside className="preview-inspector" aria-label="Sample audit event inspector" aria-live="polite">
          {selected ? <><p className="eyebrow">Fictional audit event</p><h2>{selected.action}</h2><dl><dt>Example ID</dt><dd>{selected.id}</dd><dt>Actor</dt><dd>{selected.actor}</dd><dt>Workspace</dt><dd>{selected.workspace}</dd><dt>Target</dt><dd>{selected.target}</dd><dt>Outcome</dt><dd>{selected.outcome} · sample</dd><dt>Occurred at</dt><dd>Not observed — illustration only</dd><dt>Evidence</dt><dd>No real receipt or audit record</dd></dl><p>{selected.detail}</p>{selected.outcome === 'Denied' ? <a href="#denied">Preview the access-denied screen →</a> : <a href="#review">Explore the sample review journey →</a>}</> : <><h2>No event selected</h2><p>Change a filter to inspect another sample event.</p></>}
        </aside>
      </div>
    </> : <div className="preview-split">
      <div className="table-scroll" role="region" aria-label="Illustrative operations evidence" tabIndex={0}>
        <table><thead><tr><th>Area</th><th>Illustrative state</th></tr></thead><tbody>{operations.map((item, index) => <tr key={item.area}><td><button type="button" className="text-button" aria-pressed={operation === index} onClick={() => setOperation(index)}>{item.area}</button></td><td>{item.state}</td></tr>)}</tbody></table>
      </div>
      <aside className="preview-inspector" aria-label="Operations evidence inspector" aria-live="polite"><p className="eyebrow">Evidence design · not a live status</p><h2>{operations[operation].area}</h2><p>{operations[operation].example}</p><h3>Evidence a working application would need</h3><p>{operations[operation].evidence}</p><p>Actual status remains unverified. This preview cannot start retries, run recovery, or change a connection.</p><a href="#devices">Inspect the sample inventory →</a></aside>
    </div>}
  </>
}
