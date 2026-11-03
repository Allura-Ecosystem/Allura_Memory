import { type MouseEvent, type ReactNode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AccessDenied } from '@/components/dashboard/access-denied'
import brand from '@/components/dashboard/brand-tokens.module.css'
import { KnowledgeGraphView } from '@/components/dashboard/knowledge-graph'
import type { KnowledgeGraph } from '@/lib/dashboard/read-model'
import { AppsAdministration, AppsHome, BumblebeeApp, MortgageApp, PreviewAppsProvider } from './apps-preview'
import { AuditOperations } from './audit-operations'
import { ConnectionsGraph } from './connections-graph'
import { ConnectionsPage } from './connections-preview'
import { FilesPage } from './files-preview'
import { PreviewFilesProvider } from './files-state'
import './studio-ui.css'
import { previewHref } from './link'
import { PeoplePage, ProfilePage, RolesPage, TeamsPage, VendorsPage } from './organization-preview'
import { OrganizationProvider, useOrganization } from './organization-state'
import { PreviewShell } from './preview-shell'
import { ReviewWalkthrough, useReviewWalkthrough } from './review-walkthrough'
import { PreviewWorkProvider } from './preview-work-state'
import { SecurityTrust } from './security-trust'
import { StudioEcommercePage } from './studio-ecommerce-preview'
import { WorkBoard } from './work-board'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/600.css'
import './reset.css'
import './studio-utilities.css'
import './studio-brand.css'
import './modern-experience.css'

const workspaces = ['Company Knowledge', 'HR', 'Marketing', 'IT', 'Sales']
const records = [
  { title: 'Company handbook v2', workspace: 'Company Knowledge', owner: 'HR team', text: 'Sample policy: new colleagues start with the company handbook and ask their team lead about department-specific onboarding.', version: 2 },
  { title: 'Company handbook v1', workspace: 'Company Knowledge', owner: 'HR team', text: 'Historical sample handbook. A newer version replaces this record.', version: 1 },
  { title: 'Sales onboarding', workspace: 'Sales', owner: 'Alex Morgan', text: 'Sample playbook: review the approved product overview, practice a discovery conversation, and record account questions for review.', version: 1 },
  { title: 'Review checklist', workspace: 'HR', owner: 'Jordan Lee', text: 'Sample internal checklist: confirm the source, identify the policy owner, and request independent review before publishing a change.', version: 1 },
  { title: 'Shared product knowledge', workspace: 'Company Knowledge', owner: 'Marketing team', text: 'Sample shared knowledge: published product language is available to Sales and Marketing. Draft campaigns stay in their workspace.', version: 1 },
  { title: 'Campaign brief', workspace: 'Marketing', owner: 'Sam Rivera', text: 'Sample brief for a campaign in planning. Audience, approved claims, and publication date require review.', version: 1 },
  { title: 'IT operations runbook', workspace: 'IT', owner: 'Taylor Chen', text: 'Sample operations note: investigate the incident, record evidence, and request authorization before changing a production system.', version: 1 },
  { title: 'Device enrollment guide', workspace: 'IT', owner: 'Taylor Chen', text: 'Sample enrollment guidance: a device request records ownership and intended scope. Connection alone does not grant trust.', version: 1 },
]
const graph: KnowledgeGraph = {
  nodes: records.map((record, index) => ({ id: `memory:fixture-${index}`, recordId: `fixture-${index}`, kind: 'memory', label: record.title, content: `${record.text} This is local sample data, not an organization record.`, createdAt: '2026-10-19T12:00:00Z', version: record.version, provenance: 'Local design sample · no real approval receipt', lifecycle: index === 1 ? 'superseded' : 'active' })),
  edges: [{ id: 'fixture-lineage', source: 'memory:fixture-0', target: 'memory:fixture-1', relationship: 'supersedes', createdAt: '2026-10-19T12:00:00Z', sourceTable: 'graph_supersedes' }, ...[2, 3, 5, 6, 7].map(index => ({ id: `fixture-edge-${index}`, source: `memory:fixture-${index}`, target: 'memory:fixture-4', relationship: 'references', createdAt: '2026-10-19T12:00:00Z', sourceTable: 'graph_structural_edges' as const }))],
  nodeLimit: 50, edgeLimit: 100, nodesTruncated: false, edgesTruncated: false, focusNodeId: 'memory:fixture-0',
}
const routes = [ ['vendors', 'Vendors & contacts'], ['ecommerce', 'Store overview'], ['profile', 'My profile'], ['people', 'People'], ['teams', 'Teams'], ['roles', 'Roles & access'], ['files', 'File manager'], ['connections', 'Connected tools'], ['overview', 'Home'], ['apps', 'Apps'], ['mortgage', 'Mortgage'], ['bumblebee', 'Bumblebee'], ['app-settings', 'Manage apps'], ['graph', 'Connections'], ['memory-graph', 'Related knowledge'], ['memories', 'Company Knowledge'], ['embeddings', 'Search settings'], ['admin', 'Administration'], ['review', 'Review changes'], ['devices', 'Devices & agents'], ['audit', 'Audit & Operations'], ['trust', 'Security & Trust'], ['work', 'Work Board'], ['denied', 'Access denied'] ]
function readRoute() { return location.hash.slice(1) || 'overview' }
function SampleNote({ children }: { children: ReactNode }) { return <p className="sample-note">Design sample · {children}</p> }
function Table({ children, label }: { children: ReactNode; label: string }) { return <div className="table-scroll" role="region" aria-label={label} tabIndex={0}><table>{children}</table></div> }

function Memories({ workspace, initialQuery }: { workspace: string; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery)
  const [selected, setSelected] = useState(0)
  const shown = records.map((record, index) => ({ ...record, index })).filter(record => record.workspace === workspace && `${record.title} ${record.text}`.toLowerCase().includes(query.toLowerCase()))
  const record = shown.find(row => row.index === selected) ?? shown[0]
  return <><SampleNote>Browse example documents. Search matches words in their titles and text; this preview does not generate answers or check permissions.</SampleNote>
    <div className="preview-toolbar"><label>Search company knowledge<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Try handbook or onboarding" /></label><a href="#memory-graph">Explore related information →</a></div>
    <p className="muted">{shown.length} example documents in {workspace}</p>
    {shown.length ? <div className="preview-split"><Table label="Example documents"><thead><tr><th>Document</th><th>Team or shared space</th><th>Version</th></tr></thead><tbody>{shown.map(row => <tr key={row.index}><td><button className="text-button" aria-pressed={record?.index === row.index} onClick={() => setSelected(row.index)}>{row.title}</button></td><td>{row.workspace}</td><td>{row.version}</td></tr>)}</tbody></Table>
      {record && <aside className="preview-inspector" aria-label="Document details"><p className="eyebrow">Example document</p><h2>{record.title}</h2><dl><dt>Maintained by</dt><dd>{record.owner}</dd><dt>Shared with</dt><dd>{record.workspace} · example only</dd><dt>Source</dt><dd>Fictional portfolio document</dd><dt>Version</dt><dd>{record.version}{record.index === 1 ? ' · Older version' : ''}</dd></dl><p>{record.text}</p><a href={`#memory-graph?focusNodeId=memory:fixture-${record.index}`}>See related information →</a><a href="#review">Suggest a correction →</a></aside>}</div> : <section className="preview-section" role="status"><h2>No matching documents</h2><p>Try a shorter keyword or choose another team or shared space above.</p><button onClick={() => setQuery('')}>Clear search</button></section>}</>
}
function Embeddings({ initialRecord }: { initialRecord: number }) {
  const [selected, setSelected] = useState(initialRecord)
  return <><a href="#admin">← Administration</a><SampleNote>Example search statuses only. No documents are being processed and no live search readiness has been checked.</SampleNote><div className="preview-toolbar"><label>Document<select value={selected} onChange={e => setSelected(Number(e.target.value))}>{records.map((record, index) => <option key={index} value={index}>{record.title}</option>)}</select></label></div>
    <section className="preview-section"><h2>{records[selected].title}</h2><p><strong>{selected % 2 ? 'Preparing for search' : 'Ready to search'} · example status</strong></p><p>{selected % 2 ? 'This illustrates a document still being prepared. In a live service, it would appear in search once processing finishes.' : 'This illustrates a document available to search. A live service would confirm that the current version has been processed.'}</p><p>If a document needs attention, its owner should see what went wrong and the next step to take.</p><a href="#memories">Browse company knowledge →</a>
    <details><summary>Advanced details for IT</summary><p>Embeddings are numerical representations that help search compare meaning. Employees do not need to manage them.</p><Table label="Illustrative technical search details"><thead><tr><th>Technical detail</th><th>Example or limitation</th></tr></thead><tbody><tr><td>Embedding model</td><td>Example model only</td></tr><tr><td>Dimensions</td><td>1,024 · illustrative, not measured</td></tr><tr><td>Source version</td><td>{records[selected].version}</td></tr><tr><td>Vector values</td><td>Not available; no vectors retrieved</td></tr><tr><td>Similarity scores</td><td>Not calculated</td></tr></tbody></Table></details></section></>
}
function Administration({ previewRole }: { previewRole: string }) {
  const { people, teams } = useOrganization()
  return <div className="enterprise-preview"><p className="sample-note">Portfolio organization · Fictional people, files and connections. This page demonstrates management journeys; no real permissions change.</p>
    <section className="preview-section"><h2>Bring your organization together</h2><p>{people.length} sample people across {teams.length} sample teams. Manage membership, explain access, and keep the source of work easy to find.</p>
      <div className="admin-destinations"><a href="#people"><strong>People</strong><span>Profiles, example invitations and account status</span></a><a href="#teams"><strong>Teams</strong><span>Departments and explicit memberships</span></a><a href="#roles"><strong>Roles & access</strong><span>Understand what each role may do</span></a><a href="#files"><strong>File manager</strong><span>Owners, versions and linked work tasks</span></a><a href="#connections"><strong>Connected tools</strong><span>Explore a sample Shopify connection</span></a><a href="#app-settings"><strong>Manage apps</strong><span>Sample updates for Mortgage and Bumblebee</span></a></div>
      <p>{previewRole === 'Admin' ? 'You are exploring administrator controls with fictional records.' : 'You are exploring a reader or editor view. Open Preview options to try the Administrator example.'}</p></section>
    <div className="preview-toolbar" aria-label="Other administration tools"><a href="#embeddings">Search settings →</a><a href="#devices">Devices & agents →</a><a href="#audit">Activity & service health →</a><a href="#trust">Security & Trust →</a></div>
    <section className="preview-section"><h2>Membership and access have different jobs</h2><p>A team describes who works together. A role describes what someone may do. Being an IT administrator does not automatically grant access to HR files.</p><a href="#roles">Explore the role examples →</a><a href="#denied">Preview an access-denied state →</a></section>
  </div>
}
const devices = [ ['Design laptop', 'Computer', 'Marketing', 'Connected · sample'], ['Office tablet', 'Tablet', 'Sales', 'Stale · sample'], ['Knowledge worker', 'Agent', 'Company Knowledge', 'Awaiting approval · sample'], ['Operations host', 'Server', 'IT', 'Offline · sample'] ]
function Devices() {
  const [selected, setSelected] = useState(0)
  const [message, setMessage] = useState('')
  return <><SampleNote>Fictional inventory. No computers, servers, or agents are contacted or controlled.</SampleNote><div className="preview-split"><Table label="Sample devices and agents"><thead><tr><th>Name</th><th>Type</th><th>Example status</th></tr></thead><tbody>{devices.map((device, index) => <tr key={device[0]}><td><button className="text-button" onClick={() => { setSelected(index); setMessage('') }}>{device[0]}</button></td><td>{device[1]}</td><td>{device[3]}</td></tr>)}</tbody></Table><aside className="preview-inspector"><p className="eyebrow">Sample inventory detail</p><h2>{devices[selected][0]}</h2><dl><dt>Workspace</dt><dd>{devices[selected][2]}</dd><dt>Owner</dt><dd>Fictional {devices[selected][2]} team</dd><dt>Last seen</dt><dd>Not observed — sample only</dd><dt>Credential expiry</dt><dd>No credential issued</dd><dt>Intended capability</dt><dd>Read authorized workspace knowledge · illustration</dd></dl><p>Connected status does not establish trust or successful execution.</p><button onClick={() => setMessage('Enrollment would require an owner, requested scope, and approval. This preview does not enroll devices.')}>Preview enrollment</button><button onClick={() => setMessage('Revocation would invalidate the selected credential and create an audit event. No credential exists in this sample.')}>Preview revocation</button><p role="status">{message}</p></aside></div></>
}
function App() {
  const walkthrough = useReviewWalkthrough()
  const [hash, setHash] = useState(readRoute)
  const [workspace, setWorkspace] = useState('Company Knowledge')
  const [role, setRole] = useState('Viewer')
  useEffect(() => { const changed = () => setHash(readRoute()); addEventListener('hashchange', changed); return () => removeEventListener('hashchange', changed) }, [])
  const [rawRoute, query = ''] = hash.split('?')
  const params = new URLSearchParams(query)
  const route = rawRoute === 'graph' && params.has('focusNodeId') ? 'memory-graph' : rawRoute === 'security' ? 'trust' : rawRoute === 'unavailable' && params.get('target') === '/dashboard/kanban' ? 'work' : rawRoute
  const current = routes.find(item => item[0] === route)
  const data = route === 'dense' ? { ...graph, nodes: Array.from({ length: 50 }, (_, index) => ({ ...graph.nodes[index % 8], id: `memory:dense-${index}`, recordId: `dense-${index}`, label: `Sample memory ${index + 1}`, lifecycle: 'active' as const })), edges: Array.from({ length: 49 }, (_, index) => ({ ...graph.edges[0], id: `dense-edge-${index}`, source: 'memory:dense-0', target: `memory:dense-${index + 1}`, relationship: 'references' })), focusNodeId: 'memory:dense-0' } : { ...graph, focusNodeId: params.get('focusNodeId') || graph.focusNodeId }
  function interceptNavigation(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as Element).closest('a')
    const href = anchor?.getAttribute('href')
    if (href === '#dashboard-content') { event.preventDefault(); document.getElementById('dashboard-content')?.focus(); return }
    if (href?.startsWith('/')) { event.preventDefault(); location.hash = previewHref(href).slice(1) }
  }
  let content: ReactNode
  if (route === 'graph') content = <ConnectionsGraph focusId={params.get('focus') || undefined} />
  else if (route === 'memory-graph' || route === 'dense') content = <><SampleNote>Every node and relationship below is an invented local fixture. The reused graph component’s “stored” and “read” labels describe its application design; this preview makes no reads.</SampleNote><KnowledgeGraphView key={hash} data={data} /><a href="#dense">Explore the 50-node density example →</a></>
  else if (route === 'memories') content = <Memories key={hash} workspace={workspace} initialQuery={params.get('q') || ''} />
  else if (route === 'embeddings') content = <Embeddings key={hash} initialRecord={Math.min(7, Math.max(0, Number(params.get('record')) || 0))} />
  else if (route === 'profile') content = <ProfilePage personId={params.get('person') || 'alex'} previewRole={role} />
  else if (route === 'vendors') content = <VendorsPage vendorId={params.get('vendor') || undefined} contactId={params.get('contact') || undefined} />
  else if (route === 'people') content = <PeoplePage previewRole={role} />
  else if (route === 'teams') content = <TeamsPage previewRole={role} />
  else if (route === 'roles') content = <RolesPage previewRole={role} />
  else if (route === 'files') content = <FilesPage previewRole={role} />
  else if (route === 'ecommerce') content = <StudioEcommercePage previewRole={role} />
  else if (route === 'connections') content = <ConnectionsPage previewRole={role} />
  else if (route === 'apps') content = <><AppsHome /><section className="preview-section"><h2>Connect the tools you already use</h2><p>Bring sample product and stock information into Files, then link it to a review task.</p><a href="#connections">Explore the Shopify connection →</a><a href="#ecommerce">Open the sample store overview →</a></section></>
  else if (route === 'mortgage') content = <MortgageApp />
  else if (route === 'bumblebee') content = <BumblebeeApp />
  else if (route === 'app-settings') content = <AppsAdministration previewRole={role} />
  else if (route === 'admin') content = <Administration previewRole={role} />
  else if (route === 'review') content = <ReviewWalkthrough controller={walkthrough} source={records[0]} onOpenSource={() => setWorkspace(records[0].workspace)} />
  else if (route === 'devices') content = <Devices />
  else if (route === 'audit') content = <AuditOperations />
  else if (route === 'trust') content = <SecurityTrust key={hash} />
  else if (route === 'work') content = <WorkBoard key={hash} previewRole={role} />
  else if (route === 'overview') content = <>
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <p className="eyebrow">A space for shared understanding</p>
      <h1 id="welcome-title">What do you need<br /><span>to find today?</span></h1>
      <p>Find company guidance, check its source, and keep your team’s work moving.</p>
      <form className="preview-toolbar home-search" onSubmit={event => { event.preventDefault(); const query = String(new FormData(event.currentTarget).get('query') || ''); location.hash = `memories?q=${encodeURIComponent(query)}` }}><label>Search company knowledge<input name="query" placeholder="Try handbook or onboarding" /></label><button className="primary" type="submit">Find documents</button></form><div className="welcome-actions"><a href="#memories">Browse Company Knowledge →</a><a href="#work">Open the Work Board →</a><a href="#apps">Explore your apps →</a></div>
      <p className="welcome-caption">A portfolio preview of a more connected working day.</p>
    </section>
    <section className="welcome-paths" aria-labelledby="next-step-title"><div><p className="eyebrow">Make yourself at home</p><h2 id="next-step-title">Where would you like to begin?</h2><p>Try a small journey with sample data. Nothing changes in a live system.</p></div>
      <ol className="welcome-journeys">
        <li><span aria-hidden="true">01</span><div><a href="#work">See what needs doing →</a><p>Create a sample task, choose a reviewer, and follow its progress.</p></div></li>
        <li><span aria-hidden="true">02</span><div><a href="#trust">Explore the security and trust plan →</a><p>Explore proposed controls and the evidence they would need.</p></div></li>
        <li><span aria-hidden="true">03</span><div><a href="#review">Start the guided walkthrough →</a><p>Read a sample source, suggest a change, and explore each review outcome.</p></div></li>
      </ol>
    </section>
    <p className="muted">Across HR, Marketing, IT, Sales and Company Knowledge · all people and records are fictional.</p>
  </>
  else content = <section className="preview-section"><h2>Preview screen not included</h2><p>{params.get('target') || route} is an application navigation reference. This HTML preview includes the journeys in the preview navigation.</p><a href="#overview">Return to preview overview →</a></section>
  if (['profile', 'people', 'teams', 'roles', 'vendors', 'files', 'connections'].includes(route)) content = <div className="enterprise-preview">{content}</div>
  const appView = ['apps', 'mortgage', 'bumblebee', 'app-settings', 'connections', 'ecommerce'].includes(route)
  const knowledgeView = ['memories', 'memory-graph', 'dense', 'embeddings'].includes(route)
  const contextControls = <div className="preview-toolbar preview-context">{knowledgeView && <label>Team or shared space<select value={workspace} onChange={e => setWorkspace(e.target.value)}>{workspaces.map(space => <option key={space}>{space}</option>)}</select></label>}<details><summary>Preview options</summary><label>Example role<select value={role} onChange={e => setRole(e.target.value)}>{['Viewer', 'Curator', 'Admin'].map(value => <option key={value} value={value}>{value === 'Viewer' ? 'Reader' : value === 'Curator' ? 'Editor' : 'Administrator'}</option>)}</select></label><span>Fictional roles only. No access changes.</span></details></div>
  return <div onClickCapture={interceptNavigation}>{route === 'denied' ? <div className={brand.theme}><div className="fixture-banner" role="note">Portfolio preview · Sample data only. SOC 2 readiness is a goal; no compliance or audit claim.</div><AccessDenied /></div> : <PreviewShell route={route} title={current?.[1] || (route === 'dense' ? 'Graph · density example' : 'Preview')} workspace={appView ? (current?.[1] || 'Apps') : knowledgeView ? workspace : 'Allura sample organization'} contextLabel={appView ? 'Sample app area' : knowledgeView ? 'Sample workspace' : 'Portfolio workspace'} role={role} contextControls={contextControls}>{content}</PreviewShell>}</div>
}
createRoot(document.getElementById('root')!).render(<OrganizationProvider><PreviewWorkProvider><PreviewFilesProvider><PreviewAppsProvider><App /></PreviewAppsProvider></PreviewFilesProvider></PreviewWorkProvider></OrganizationProvider>)
