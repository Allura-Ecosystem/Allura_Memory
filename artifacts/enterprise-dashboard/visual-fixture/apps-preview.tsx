import { createContext, type ReactNode, useContext, useState } from 'react'
import { usePreviewWork } from './preview-work-state'
import './apps-preview.css'

type AppId = 'mortgage' | 'bumblebee'
type Scenario = 'compatible' | 'incompatible' | 'failure'
interface AppConfig { owner: string; version: string; previousVersion: string | null; enabled: boolean; scenario: Scenario; checked: boolean; notice: string; history: string[] }
const manifest = {
  mortgage: { name: 'Mortgage', description: 'Organize a case’s documents, see what is missing, and prepare work for human review.', route: '#mortgage', owner: 'Jordan Lee', version: '1.0.0', available: '1.1.0', scope: 'Sample case documents and review tasks only', summary: 'Clearer document checklist and review handoff. No new permissions or decision-making capability.' },
  bumblebee: { name: 'Bumblebee', description: 'Understand a sample security finding, inspect its evidence, and prepare a response for review.', route: '#bumblebee', owner: 'Taylor Chen', version: '1.0.0', available: '1.1.0', scope: 'Read-only sample findings and response drafts only', summary: 'Clearer evidence details and response-draft handoff. No scanning, blocking, or device control.' },
}
const appIds: AppId[] = ['mortgage', 'bumblebee']
const initialConfigs = (): Record<AppId, AppConfig> => Object.fromEntries(appIds.map(id => [id, { owner: manifest[id].owner, version: manifest[id].version, previousVersion: null, enabled: true, scenario: 'compatible', checked: false, notice: '', history: ['Starting sample version. No installed app was inspected.'] }])) as Record<AppId, AppConfig>
interface SampleDocument { id: string; name: string; received: boolean; reviewed: boolean; detail: string }
const initialDocuments = (): SampleDocument[] => [
  { id: 'identity', name: 'Identity document', received: true, reviewed: false, detail: 'Fictional document placeholder. No identity document or personal information is included.' },
  { id: 'income', name: 'Income document', received: false, reviewed: false, detail: 'Initially missing in this fictional case. The checklist shows its current sample status; marking it received does not upload or validate a file.' },
  { id: 'property', name: 'Property document', received: true, reviewed: false, detail: 'Fictional document placeholder. No property valuation or eligibility assessment is provided.' },
]
interface AppsState {
  configs: Record<AppId, AppConfig>; documents: SampleDocument[]; mortgageRevision: number; response: string; responsePrepared: boolean; responseRevision: number
  patchConfig: (id: AppId, patch: Partial<AppConfig>) => void
  checkUpdate: (id: AppId) => void; tryUpdate: (id: AppId) => void; restoreVersion: (id: AppId) => void
  changeDocument: (id: string, kind: 'received' | 'reviewed') => void
  setResponse: (text: string) => void; prepareResponse: () => void; reset: () => void
}
const AppsContext = createContext<AppsState | null>(null)
export function PreviewAppsProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [configs, setConfigs] = useState(initialConfigs)
  const [mortgageState, setMortgageState] = useState(() => ({ documents: initialDocuments(), revision: 1 }))
  const [responseState, setResponseState] = useState({ text: 'Ask the IT owner to inspect this sample finding, confirm its evidence, and document the next step. Do not change a device.', prepared: false, revision: 1 })
  const { documents, revision: mortgageRevision } = mortgageState
  const { text: response, prepared: responsePrepared, revision: responseRevision } = responseState
  function patchConfig(id: AppId, patch: Partial<AppConfig>) { setConfigs(current => ({ ...current, [id]: { ...current[id], ...patch } })) }
  function checkUpdate(id: AppId) {
    const config = configs[id]
    if (config.version === manifest[id].available) { patchConfig(id, { checked: false, notice: 'The sample is already on the available version.' }); return }
    patchConfig(id, { checked: true, notice: config.scenario === 'incompatible' ? 'Blocked in this scenario: the sample update is incompatible. Current version and case data stay unchanged.' : 'Sample compatibility check allows a trial. Scope is unchanged. This is not evidence about a real installation.' })
  }
  function tryUpdate(id: AppId) {
    const config = configs[id]
    if (!config.checked || config.scenario === 'incompatible' || config.version === manifest[id].available) return
    if (config.scenario === 'failure') { patchConfig(id, { checked: false, notice: 'Sample update failed. The previous version is still active; case and finding data are preserved.', history: [...config.history, `Simulated update failure; ${config.version} retained.`] }); return }
    patchConfig(id, { previousVersion: config.version, version: manifest[id].available, checked: false, notice: 'Sample version changed locally. No installed software or permissions changed. Existing case and finding data are preserved.', history: [...config.history, `Sample version ${config.version} → ${manifest[id].available}; scope unchanged.`] })
  }
  function restoreVersion(id: AppId) {
    const config = configs[id]
    if (!config.previousVersion) return
    patchConfig(id, { version: config.previousVersion, previousVersion: null, checked: false, notice: 'Compatible prior sample version restored. Existing case and finding data are preserved.', history: [...config.history, `Restored compatible sample version ${config.previousVersion}.`] })
  }
  function changeDocument(id: string, kind: 'received' | 'reviewed') {
    setMortgageState(current => {
      const item = current.documents.find(document => document.id === id)
      if (!item || (kind === 'received' ? item.received : !item.received || item.reviewed)) return current
      return { documents: current.documents.map(document => document.id === id ? { ...document, [kind]: true } : document), revision: current.revision + 1 }
    })
  }
  function reset() {
    setConfigs(initialConfigs())
    setMortgageState(current => ({ documents: initialDocuments(), revision: current.revision + 1 }))
    setResponseState(current => ({ text: 'Ask the IT owner to inspect this sample finding, confirm its evidence, and document the next step. Do not change a device.', prepared: false, revision: current.revision + 1 }))
  }
  return <AppsContext.Provider value={{ configs, documents, mortgageRevision, response, responsePrepared, responseRevision, patchConfig, checkUpdate, tryUpdate, restoreVersion, changeDocument, setResponse: text => setResponseState(current => text === current.text ? current : { text, prepared: false, revision: current.revision + 1 }), prepareResponse: () => setResponseState(current => current.text.trim().length >= 10 ? { ...current, prepared: true } : current), reset }}>{children}</AppsContext.Provider>
}
function useApps(): AppsState { const context = useContext(AppsContext); if (!context) throw new Error('PreviewAppsProvider must wrap the preview.'); return context }
/** Read-only view of the same local app settings used by Apps and administration. */
export function usePreviewAppSummaries() {
  const { configs } = useApps()
  return appIds.map(id => ({ id, name: manifest[id].name, owner: configs[id].owner, version: configs[id].version, enabled: configs[id].enabled, href: manifest[id].route, description: manifest[id].description }))
}
function AppNotice({ children }: { children: ReactNode }) { return <p className="sample-note">Local design sample · {children} Changes survive preview navigation and reset on page reload.</p> }
function UnavailableApp({ id }: { id: AppId }) { return <section className="apps-unavailable"><p className="eyebrow">Disabled in this demonstration</p><h2>{manifest[id].name} is unavailable</h2><p>An administrator can re-enable this sample app from App settings. Its local case data is preserved; other apps are unaffected.</p><a href="#app-settings">Open App settings →</a><a href="#apps">Return to Apps →</a></section> }
function useAppTask(baseHref: string, title: string, assignee: string, workspace: string, sourceSnapshot: string, sourceVersion: number) {
  const work = usePreviewWork()
  const href = `${baseHref}&revision=${sourceVersion}`
  const existing = work.tasks.find(task => task.href === href)
  const canCreate = work.assignees.includes(assignee)
  function create() { return existing?.id || (canCreate ? work.addTask({ title, href, assignee, workspace, related: title, sourceSnapshot, sourceVersion }) : null) }
  return { task: existing, create, canCreate }
}
function SourceVersionNotice({ label, version }: { label: string; version: number }) {
  const requestedVersion = new URLSearchParams(location.hash.split('?')[1] || '').get('revision')
  const work = usePreviewWork()
  const capturedTask = work.tasks.find(task => task.href === location.hash)
  return <div className="sample-note"><p>{label}: {version} · sample</p><p>Review tasks keep the exact example captured when they were created. Changes need a new task; earlier tasks cover earlier versions.</p>{requestedVersion && requestedVersion !== String(version) && <p>You followed a link for version {requestedVersion}. This app shows the latest example. {capturedTask ? <>The earlier captured version remains in its Work Board task. <a href={`#work?task=${capturedTask.id}`}>Read captured version →</a></> : <>No matching captured task is present in this demonstration; it may have been reset.</>}</p>}</div>
}
export function AppsHome(): React.ReactElement {
  const { configs } = useApps()
  return <div className="apps-view"><AppNotice>Apps are familiar work areas for specific tasks. Both examples below use fictional information; nothing connects to an external service.</AppNotice><div className="apps-directory">{appIds.map(id => <section className="apps-directory-row" key={id}><div><p className="eyebrow">{id === 'mortgage' ? 'Case preparation' : 'Security review'}</p><h2>{manifest[id].name}</h2><p>{manifest[id].description}</p><p className="muted">{configs[id].enabled ? 'Available in preview' : 'Disabled in preview'} · Sample version {configs[id].version} · Owner: {configs[id].owner}</p></div><a href={`#graph?focus=${encodeURIComponent(`app:${id}`)}`}>See connections →</a><a className="apps-open" href={manifest[id].route}>{configs[id].enabled ? `Open ${manifest[id].name}` : 'View unavailable state'} →</a></section>)}</div><a href="#app-settings">Manage these apps →</a></div>
}
export function MortgageApp(): React.ReactElement {
  const apps = useApps()
  const [selectedId, setSelectedId] = useState('income')
  const [notice, setNotice] = useState('')
  const selected = apps.documents.find(item => item.id === selectedId)!
  const snapshot = `Fictional case MAPLE-104 · Case checklist version ${apps.mortgageRevision}\n${apps.documents.map(item => `${item.name}: ${item.received ? 'Received' : 'Missing'}; ${item.reviewed ? 'Checklist checked' : 'Needs a look'}`).join('\n')}\nSample preparation only. No actual document verification, lending, underwriting, credit, eligibility, or compliance decision.`
  const linked = useAppTask('#mortgage?case=sample-maple', 'Review sample Mortgage documents', apps.configs.mortgage.owner, 'Mortgage', snapshot, apps.mortgageRevision)
  if (!apps.configs.mortgage.enabled) return <UnavailableApp id="mortgage" />
  return <div className="apps-view"><AppNotice>Fictional case MAPLE-104. This is document preparation only: no lending, underwriting, credit, eligibility, or compliance decision is made.</AppNotice><SourceVersionNotice label="Case checklist version" version={apps.mortgageRevision} /><div className="apps-heading"><div><p className="eyebrow">Mortgage · sample case</p><h2>Get the case ready for review</h2><p>{apps.documents.filter(item => item.received).length} of {apps.documents.length} sample documents received · {apps.documents.filter(item => item.reviewed).length} checked in this demonstration</p></div><a href="#apps">All apps →</a></div><ol className="journey"><li>1. Check the documents</li><li>2. Record what is missing</li><li>3. Request human review</li></ol><div className="preview-split apps-detail-layout"><div className="table-scroll" role="region" aria-label="Sample mortgage document checklist" tabIndex={0}><table><thead><tr><th>Sample document</th><th>Receipt</th><th>Review preparation</th></tr></thead><tbody>{apps.documents.map(item => <tr key={item.id}><td><button type="button" className="text-button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}>{item.name}</button></td><td>{item.received ? 'Received · sample' : 'Missing · sample'}</td><td>{item.reviewed ? 'Checklist checked · sample' : 'Needs a look'}</td></tr>)}</tbody></table></div><aside className="preview-inspector apps-inspector" aria-label="Sample mortgage document detail"><p className="eyebrow">Fictional document</p><h2>{selected.name}</h2><p>{selected.detail}</p>{!selected.received ? <button type="button" onClick={() => { apps.changeDocument(selected.id, 'received'); setNotice('Sample document marked received locally. No file was uploaded or validated.') }}>Mark sample document received</button> : <button type="button" disabled={selected.reviewed} onClick={() => { apps.changeDocument(selected.id, 'reviewed'); setNotice('Sample checklist marked checked. This is not document verification or a lending decision.') }}>{selected.reviewed ? 'Sample checklist checked' : 'Mark sample checklist checked'}</button>}<p role="status">{notice}</p><h3>Ask someone to review the case</h3><p>Creates a local Work Board task. Nothing is sent to a borrower or reviewer.</p><button type="button" disabled={!linked.task && !linked.canCreate} onClick={() => { linked.create(); setNotice('Review task for this case checklist version is ready. It captures the current sample; no notification was sent.') }}>{linked.task ? 'Review task already added' : 'Request sample document review'}</button>{!linked.task && !linked.canCreate && <p>Choose an active sample app owner in <a href="#app-settings">Manage apps</a> before creating a task.</p>}{linked.task && <a href={`#work?task=${linked.task.id}`}>Open task {linked.task.id} →</a>}</aside></div></div>
}
export function BumblebeeApp(): React.ReactElement {
  const apps = useApps()
  const [step, setStep] = useState('Finding')
  const [notice, setNotice] = useState('')
  const snapshot = `Fictional Bumblebee finding SAMPLE-FINDING-01 · Draft version ${apps.responseRevision}\nExact sample response:\n${apps.response}\nEvidence limitation: fictional local endpoint report; publisher and freshness not verified; evidence insufficient for real action. No scan, block, or device change was performed.`
  const linked = useAppTask('#bumblebee?finding=sample-01', 'Review sample Bumblebee response', apps.configs.bumblebee.owner, 'IT', snapshot, apps.responseRevision)
  if (!apps.configs.bumblebee.enabled) return <UnavailableApp id="bumblebee" />
  return <div className="apps-view"><AppNotice>Read-only fictional finding and simulated response. No endpoint is scanned, blocked, changed, or contacted.</AppNotice><SourceVersionNotice label="Draft version" version={apps.responseRevision} /><div className="apps-heading"><div><p className="eyebrow">Bumblebee · sample finding</p><h2>Understand the finding before acting</h2></div><a href="#apps">All apps →</a></div><div className="preview-toolbar">{['Finding', 'Evidence', 'Response draft'].map(value => <button type="button" key={value} aria-pressed={step === value} onClick={() => setStep(value)}>{value}</button>)}</div><section className="preview-section apps-response">{step === 'Finding' ? <><h3>Example configuration needs review</h3><p>A fictional endpoint report flags an unfamiliar startup entry. This example does not establish that a device is compromised.</p><dl><dt>Finding</dt><dd>SAMPLE-FINDING-01</dd><dt>Source</dt><dd>Fictional endpoint report</dd><dt>Classification</dt><dd>Needs human review · example</dd><dt>Observed time</dt><dd>Not observed — no scan was run</dd></dl><button type="button" onClick={() => setStep('Evidence')}>Inspect sample evidence</button></> : step === 'Evidence' ? <><h3>Source and evidence</h3><dl><dt>Source identity</dt><dd>Local design fixture; no external report retrieved</dd><dt>Publisher</dt><dd>Not verified</dd><dt>Freshness</dt><dd>Unknown</dd><dt>Content revision</dt><dd>Sample revision 1; no signed hash</dd><dt>Evidence quality</dt><dd>Insufficient for a real action</dd></dl><p>The sample says a startup entry is unfamiliar. A real reviewer would need source provenance, current endpoint context, and supporting evidence.</p><button type="button" onClick={() => setStep('Response draft')}>Prepare a simulated response</button></> : <><h3>Prepare a response for review</h3><label>Sample response draft<textarea rows={5} maxLength={1000} value={apps.response} onChange={event => apps.setResponse(event.target.value)} /></label><button type="button" onClick={() => { if (apps.response.trim().length < 10) { setNotice('Write at least 10 characters for the sample response.'); return } apps.prepareResponse(); setNotice('Simulated response prepared locally. No action was executed.') }}>Prepare sample draft</button><p role="status">{notice}</p><p>{apps.responsePrepared ? 'Draft prepared · design sample' : 'Draft needs preparation before creating a review task.'}</p><button type="button" disabled={!apps.responsePrepared || (!linked.task && !linked.canCreate)} onClick={() => { linked.create(); setNotice('Review task captures this exact draft version. No scan, block, or device action occurred.') }}>{linked.task ? 'Review task already added' : 'Add sample response-review task'}</button>{!linked.task && !linked.canCreate && <p>Choose an active sample app owner in <a href="#app-settings">Manage apps</a> before creating a task.</p>}{linked.task && <a href={`#work?task=${linked.task.id}`}>Open task {linked.task.id} →</a>}<p>Only a review handoff is demonstrated. This app cannot execute the draft.</p></>}</section></div>
}
function AppManagement({ id, editable }: { id: AppId; editable: boolean }) {
  const apps = useApps()
  const work = usePreviewWork()
  const config = apps.configs[id]
  const app = manifest[id]
  return <section className="apps-management-row"><div className="apps-heading"><div><h2>{app.name}</h2><p>{app.description}</p></div><span className="apps-status">{config.enabled ? 'Enabled · sample' : 'Disabled · sample'}</span></div><div className="apps-management-grid"><div><label>Sample {app.name} owner<select disabled={!editable} value={config.owner} onChange={event => apps.patchConfig(id, { owner: event.target.value, notice: 'Sample owner changed locally. No membership or permission changed.' })}>{!work.assignees.includes(config.owner) && <option value={config.owner} disabled>{config.owner} · paused</option>}{work.assignees.map(owner => <option key={owner}>{owner}</option>)}</select></label><dl><dt>Current version</dt><dd>{config.version} · sample</dd><dt>Available version</dt><dd>{app.available} · sample</dd><dt>Scope</dt><dd>{app.scope} — unchanged</dd><dt>Implementation</dt><dd>HTML design demonstration only</dd><dt>Evidence review</dt><dd>No real installation or compatibility verified</dd></dl><button type="button" disabled={!editable} onClick={() => apps.patchConfig(id, { enabled: !config.enabled, notice: `${app.name} ${config.enabled ? 'disabled' : 'enabled'} in the preview only. No access rights changed.` })}>{config.enabled ? 'Disable sample app' : 'Re-enable sample app'}</button></div><div><h3>What would change?</h3><p>{app.summary}</p><details className="apps-scenarios"><summary>Explore update examples</summary><label>Sample {app.name} update scenario<select disabled={!editable} value={config.scenario} onChange={event => apps.patchConfig(id, { scenario: event.target.value as Scenario, checked: false, notice: '' })}><option value="compatible">Compatible update</option><option value="incompatible">Incompatible update</option><option value="failure">Failure during update</option></select></label><p>These scripted examples are not checks against a real app.</p></details><div className="apps-actions"><button type="button" disabled={!editable || config.version === app.available} onClick={() => apps.checkUpdate(id)}>Preview sample update</button><button type="button" disabled={!editable || !config.checked || config.scenario === 'incompatible' || config.version === app.available} onClick={() => apps.tryUpdate(id)}>Try sample update</button><button type="button" disabled={!editable || !config.previousVersion} onClick={() => apps.restoreVersion(id)}>Restore compatible prior version</button></div><p className="apps-operation-notice" role="status">{config.notice}</p><details><summary>Local app history</summary><ol>{config.history.map((item, index) => <li key={index}>{item}</li>)}</ol></details></div></div></section>
}
export function AppsAdministration({ previewRole }: { previewRole: string }): React.ReactElement {
  const apps = useApps()
  const [notice, setNotice] = useState('')
  const editable = previewRole === 'Admin' || previewRole === 'Administrator'
  return <div className="apps-view"><AppNotice>Manage sample ownership, availability, and update scenarios. This changes no installed software, organization permissions, or credentials.</AppNotice>{!editable && <p className="apps-readonly">Read-only management preview. Choose Preview options → Administrator to explore these local controls. This selector is not an access-control system.</p>}<div className="apps-heading"><p>Each app has its own version and availability. Updates preserve the current local case and finding state.</p><a href="#apps">Return to Apps →</a></div>{appIds.map(id => <AppManagement key={id} id={id} editable={editable} />)}<div className="apps-reset"><button type="button" disabled={!editable} onClick={() => { apps.reset(); setNotice('Both app demonstrations reset with new checklist and draft versions. Earlier Work Board tasks keep their original captured examples; use the board’s reset if you also want to clear those.') }}>Reset Apps demonstration</button><p role="status">{notice}</p></div></div>
}
