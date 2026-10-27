import {Component,useEffect,useRef,useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {Confirm} from './controls.tsx';
import {ProposalComposer} from './proposal-composer.tsx';
import {AccessPanel} from './access-panel.tsx';
import {DeviceApproval} from './device-approval.tsx';
import {MemoryMap} from './memory-map.tsx';
import {DashboardTransport,DashboardError} from '../src/dashboard-transport.ts';
import {DASHBOARD_ROUTES,parseDashboardLocation} from '../src/dashboard-contract.ts';
import {readDashboardContext,dashboardRows,dashboardNotice,knowledgeQuery,type DashboardSession} from '../src/dashboard-view.ts';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './style.css';
type Row=Record<string,unknown>;
type Session=DashboardSession;
const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value):'Not observed';
function object(value:unknown):Row{if(!value||typeof value!=='object'||Array.isArray(value)){throw new DashboardError('unknown');}return value as Row;}
function rows(value:unknown):Row[]{if(!Array.isArray(value)){throw new DashboardError('unknown');}return value.map(object);}
function Json({value}:{value:unknown}){return <pre>{JSON.stringify(value,null,2)}</pre>;}
class Boundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<section role="alert"><h2>This view could not be shown</h2><p>No success is inferred. Return Home or refresh the current view.</p></section>:this.props.children;}}

function App(){
 const [location,setLocation]=useState(()=>({path:window.location.pathname,search:window.location.search})),[group,setGroup]=useState(''),[workspace,setWorkspace]=useState('');
 const [session,setSession]=useState<Session|null>(null),[model,setModel]=useState<Row|Row[]|null>(null),[detail,setDetail]=useState<Row|null>(null),[evidence,setEvidence]=useState<Row[]>([]),[notice,setNotice]=useState('Choose an authorized workspace.'),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState<Row|null>(null);
 const [query,setQuery]=useState(''),[history,setHistory]=useState(false),[decision,setDecision]=useState('approve'),[rationale,setRationale]=useState(''),[retry,setRetry]=useState<{path:string;payload:Row}|null>(null);
 const [records,setRecords]=useState<Row[]>([]);
 const client=useRef<DashboardTransport|null>(null),generation=useRef(0),menu=useRef<HTMLDetailsElement>(null);let page='overview',focus:string|undefined,invalid=false;
 try{const parsed=parseDashboardLocation(location.path,location.search);page=parsed.page;focus=parsed.focus;}catch{invalid=true;}
 const currentRoute=DASHBOARD_ROUTES.find(r=>r.page===page)!;
 const clear=()=>{generation.current++;setModel(null);setRecords([]);setDetail(null);setEvidence([]);setReceipt(null);setRetry(null);setRationale('');setBusy(false);setNotice('Loading…');};
 const failure=(error:unknown)=>{const code=error instanceof DashboardError?error.code:'unknown';setNotice(({denied:'Access denied. Sign in again or ask for an explicit workspace grant.',conflict:'Conflict. This version changed. Reload before a new decision.',unknown:'Outcome unknown. No success or rollback is inferred.',stale:'The previous view was discarded.',invalid:'Invalid request. Check the supplied values.',unavailable:'Unavailable. Try again explicitly later.',not_found:'Not found in this authorized scope.'} as Record<string,string>)[code]??'Outcome unknown.');};
 const invoke=async(path:string,body?:Row)=>{if(!client.current){throw new DashboardError('denied');}return client.current.request(path,body);};
 async function load(target=page,cursor?:string){
  if(!client.current||!session){return false;}clear();const id=generation.current;setBusy(true);setNotice('Loading…');
  try{const current=readDashboardContext(await invoke('/api/dashboard/context'),session.scope);if(id!==generation.current){return false;}setSession(current);let result:unknown;
   if(target==='overview'||target==='memories'){result=query.trim()?await invoke('/api/memory/search',knowledgeQuery(query,history)):await invoke('/api/memory/list',{limit:20,history,...(cursor?{cursor}:{})});}
   else if(target==='curator'){result=await invoke('/api/dashboard/proposals',{limit:20});}
   else if(target==='audit'){result=await invoke('/api/operations',{limit:100});}
   else if(target==='embeddings'){result=await invoke('/api/health');}
   else if(target==='devices'){result=await invoke('/api/devices/command',{kind:'list'});}
   else{result=null;}
   if(id!==generation.current){return false;}const fetchedRows=result===null?[]:dashboardRows(target,result);setRecords(fetchedRows);setModel(result===null?null:Array.isArray(result)?rows(result):object(result));setNotice(dashboardNotice(result));return true;
  }catch(error){if(id===generation.current){failure(error);}return false;}finally{if(id===generation.current){setBusy(false);}}
 }
 async function connect(){
  clear();setSession(null);client.current?.close();const id=++generation.current;setBusy(true);setNotice('Checking current access…');let transport:DashboardTransport|undefined;
  try{transport=new DashboardTransport(window.location.origin,{groupId:group,workspaceId:workspace},reason=>{clear();setSession(null);setBusy(false);setNotice(reason==='denied'?'Access denied. Sign in again or ask for an explicit workspace grant.':'Workspace content cleared.');});client.current=transport;const value=object(await transport.request('/api/dashboard/context'));
   if(client.current!==transport){return;}setSession(readDashboardContext(value,{groupId:group,workspaceId:workspace}));setNotice('Current access verified.');
  }catch(error){if(id===generation.current){failure(error);}}finally{if(id===generation.current){setBusy(false);}}
 }
 useEffect(()=>{const pop=()=>{clear();setLocation({path:window.location.pathname,search:window.location.search});};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 useEffect(()=>{if(session&&!invalid){void load().then(current=>{if(current&&focus&&['memories','curator'].includes(page)){void inspect({id:focus});}});}if(menu.current){menu.current.open=false;}},[page,session?.principalId,session?.scope.groupId,session?.scope.workspaceId,history,focus]);
 useEffect(()=>()=>client.current?.close(),[]);
 const navigate=(path:string)=>{clear();window.history.pushState(null,'',path);setLocation({path:window.location.pathname,search:window.location.search});document.getElementById('content')?.focus();};
 async function inspect(row:Row){
  setDetail(null);setEvidence([]);setReceipt(null);setRetry(null);setRationale('');const id=++generation.current;setBusy(true);
  try{const value=object(await invoke(page==='curator'?'/api/review/proposal':'/api/memory/get',page==='curator'?{proposalId:row.id}:{id:row.id,history}));if(id!==generation.current){return;}const linked:Row[]=[];
   if(page==='curator'){if(!Array.isArray(value.evidenceIds)||value.evidenceIds.length>32){throw new DashboardError('unknown');}for(const eventId of value.evidenceIds){linked.push(object(await invoke('/api/review/evidence',{proposalId:value.id,version:value.version,eventId})));if(id!==generation.current){return;}}}
   if(id!==generation.current){return;}setDetail(value);setEvidence(linked);setNotice('Exact service version loaded for inspection.');
  }catch(error){if(id===generation.current){failure(error);}}finally{if(id===generation.current){setBusy(false);}}
 }
 async function mutate(path:string,payload:Row){const id=generation.current;setBusy(true);setReceipt(null);try{const result=object(await invoke(path,payload));if(id!==generation.current){return;}setReceipt(result);setRetry(null);setNotice('Server receipt received. Inspect its outcome below.');}catch(error){if(id===generation.current){if(typeof payload.operationKey==='string'&&['/api/review/decision','/api/review/correction','/api/review/restoration','/api/memory/delete','/api/devices/command'].includes(path)&&error instanceof DashboardError&&error.code==='unknown'){setRetry({path,payload:structuredClone(payload)});}failure(error);}}finally{if(id===generation.current){setBusy(false);}}}
 const nav=<nav aria-label="Workspace navigation">{DASHBOARD_ROUTES.map(route=><a key={route.page} href={route.path} aria-current={page===route.page?'page':undefined} onClick={e=>{e.preventDefault();navigate(route.path);}}>{route.label}</a>)}</nav>;

 const can=(action:string)=>session?.actions.includes(action)===true;
 return <div className="shell"><a className="skip" href="#content">Skip to content</a><aside className="sidebar"><a href="/dashboard" aria-label="Allura Home" onClick={e=>{e.preventDefault();navigate('/dashboard');}}><img src="/assets/allura-lettermark.png" alt="Allura AL icon" width="64" height="64"/></a><p>A space for shared knowledge</p>{nav}<p className="muted">Evidence first.<br/>Independent human decisions.</p></aside><div className="column"><header><strong>Allura Memory</strong><details className="mobile-menu" ref={menu}><summary>Menu</summary>{nav}</details><span>{session?`Current role: ${session.role}`:'No workspace access verified'}</span></header><main id="content" tabIndex={-1}><h1>{currentRoute.label}</h1><p className="muted">Tenant and workspace → source → evidence → allowed action → receipt.</p>
  <form className="scope" onSubmit={e=>{e.preventDefault();void connect();}}><label>Tenant namespace<input value={group} onChange={e=>setGroup(e.target.value)} autoComplete="off" required/></label><label>Workspace UUID<input value={workspace} onChange={e=>setWorkspace(e.target.value)} autoComplete="off" required/></label><button disabled={busy}>Open workspace</button></form>
  {session&&<p className="scope-read"><strong>Active scope</strong> <code>{session.scope.groupId} / {session.scope.workspaceId}</code><br/><span>Identity: <code>{session.principalId}</code> · checked {session.observedAt}</span></p>}
  {invalid?<section role="alert"><h2>Invalid navigation</h2><p>No record was selected. Fractional, malformed or ambiguous identifiers are rejected.</p><a href="/dashboard" onClick={e=>{e.preventDefault();navigate('/dashboard');}}>Return Home</a></section>:<Boundary key={page}>
   <p role={notice.startsWith('Access denied')?'alert':'status'} aria-live="polite">{notice}</p>
   {page==='settings'&&<AccessPanel key={`${group}/${workspace}`} groupId={group} workspaceId={workspace} onChanged={()=>{client.current?.close();setSession(null);}}/>}
   {session&&<><div className="toolbar"><button disabled={busy} onClick={()=>void load()}>Refresh current view</button>{busy&&<span>Loading…</span>}</div>
    {(page==='overview'||page==='memories')&&<><form className="toolbar" onSubmit={e=>{e.preventDefault();void load();}}><label>Search company knowledge<input value={query} onChange={e=>setQuery(e.target.value)} maxLength={2000}/></label><button disabled={busy}>Search</button><label className="check"><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)}/>Include immutable history</label></form><p>Capture evidence with an enrolled device or agent. Saving evidence does not approve knowledge.</p></>}
    {['overview','memories','curator'].includes(page)&&<div className="split"><section aria-label={page==='curator'?'Pending proposals':'Memory results'}>
     {records.length===0&&!busy&&model!==null&&(!('outcome' in model)||model.outcome!=='failed')&&<p>No records returned in this bounded result.</p>}
     <ul className="records">{records.map(row=><li key={text(row.id)}><button aria-pressed={detail?.id===row.id} onClick={()=>void inspect(row)}>{text(row.summary??row.content)}</button><span className="muted">Version {text(row.version)} · {text(row.state??row.lifecycle)}{detail?.id===row.id?' · Selected':''}</span>{(row.summaryTruncated===true||row.contentTruncated===true)&&<span>Excerpt — open full details</span>}</li>)}</ul>
     {model&&!Array.isArray(model)&&model.hasMore===true&&<p>More records exist; this view is bounded.{typeof model.nextCursor==='string'&&<button onClick={()=>void load(page,text(model.nextCursor))}>Next page</button>}</p>}
     {model&&!Array.isArray(model)&&model.paths!==undefined&&<details><summary>Search execution evidence</summary><Json value={{outcome:model.outcome,degraded:model.degraded,paths:model.paths,storesUsed:model.storesUsed,candidateTruncated:model.candidateTruncated}}/></details>}
    </section>
     <aside className="inspector" aria-label="Record inspector">{detail?<><h2>{page==='curator'?'Proposal details':'Memory details'}</h2><p>{text(detail.summary??detail.content)}</p><dl><dt>Exact version</dt><dd>{text(detail.version)}</dd><dt>Record</dt><dd><code>{text(detail.id)}</code></dd><dt>State</dt><dd>{text(detail.state??detail.lifecycle)}</dd></dl>{page==='curator'&&<><h3>Linked evidence</h3>{evidence.map(item=><section key={text(item.id)}><p>{text(object(item.payload).content)}</p><details><summary>Source technical details</summary><Json value={item}/></details></section>)}<label>Decision<select aria-label="Decision" value={decision} onChange={e=>setDecision(e.target.value)}><option value="approve">Approve exact version</option><option value="request_evidence">Request evidence</option><option value="reject">Reject</option></select></label><label>Decision reason<textarea value={rationale} onChange={e=>setRationale(e.target.value)} maxLength={4000}/></label><Confirm title="Confirm independent human decision" disabled={busy||!can('review:approve')||session.principalId===detail.requesterId||session.principalId===detail.producerId||!rationale.trim()||!evidence.length} confirm={()=>mutate('/api/review/decision',{proposalId:detail.id,reviewedProposalVersion:detail.version,evidenceIds:detail.evidenceIds,decision,rationale,operationKey:crypto.randomUUID()})}><p>{decision} · exact version {text(detail.version)}</p><p>{rationale}</p><p>The server rechecks independence, entitlement and the reviewed version. A stale decision writes nothing.</p></Confirm>{!can('review:approve')&&<p>Independent human approval entitlement is required.</p>}</>}<details><summary>Technical details</summary><Json value={detail}/></details></>:<p>Select a record to inspect its source and exact version.</p>}</aside></div>}
    {page==='governance'&&<section><h2>Evidence and access have different jobs</h2><p>Organization administration does not grant content access. Workspace grants are explicit. Semantic approval requires a separately entitled independent human.</p><p>Events and receipts are append-only. Corrections create immutable versions. No compliance certification is claimed.</p><h3>Current allowed actions</h3><ul>{session.actions.map(a=><li key={a}><code>{a}</code></li>)}</ul></section>}
    {page==='settings'&&<section><h2>Current workspace access</h2><p>No role switch or browser control can grant access. Access changes require the governed consent and independent-administrator workflow.</p><Json value={session}/><p>Work Board, runs and resource telemetry are unavailable; their deferred backends are not adopted.</p></section>}
    {page==='graph'&&<MemoryMap key={`${session.scope.groupId}/${session.scope.workspaceId}/${generation.current}`} invoke={invoke} canEvidence={can('evidence:read')} focus={focus}/>}
    {page==='curator'&&can('proposal:write')&&<ProposalComposer key={`proposal-${generation.current}`} disabled={busy} mutate={mutate} scopeLabel={`${session.scope.groupId} / ${session.scope.workspaceId}`}/>}
    {page==='memories'&&detail&&can('proposal:write')&&<ProposalComposer key={`correction-${detail.id}-${detail.version}`} disabled={busy||detail.lifecycle!=='current'} memory={detail} mutate={mutate} scopeLabel={`${session.scope.groupId} / ${session.scope.workspaceId}`}/>}
    {page==='audit'&&<section><h2>Authorized operation observations</h2><p>At most100 recent scope-bound observations. This is not the entire audit history.</p>{records.length?<Json value={records}/>:<p>{model===null?'Observations not loaded.':'No observations returned.'}</p>}<button disabled={busy||!records.length} onClick={()=>{const id=generation.current;void invoke('/api/operations',{limit:100}).then(value=>{if(id!==generation.current){return;}const snapshot=dashboardRows('audit',value),url=URL.createObjectURL(new Blob([JSON.stringify({scope:session.scope,observations:snapshot},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='allura-observations.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}).catch(error=>{if(id===generation.current){failure(error);}});}}>Export visible observations</button></section>}
    {page==='embeddings'&&<section><h2>Observed search readiness</h2>{model?<Json value={model}/>:<p>Health unknown until a successful authorized probe.</p>}<Confirm title="Run one bounded indexing job" label="Review indexing action" disabled={busy||!can('proposal:write')} confirm={()=>mutate('/api/index/drain',{})}><p>Run at most one queued job. An empty result is not proof that all content is searchable.</p></Confirm></section>}
    {page==='devices'&&<section><h2>Your scoped devices</h2><p>Enrollment and rotation use the Linux secure-store SDK. This browser never receives a device secret. Last seen and connection state are not observed by this service.</p>{records.length?records.map(row=><article key={text(row.deviceId)}><Json value={row}/><Confirm title="Revoke this device" label="Review revocation" disabled={busy||row.revoked===true} confirm={()=>mutate('/api/devices/command',{kind:'revoke',deviceId:row.deviceId,operationKey:crypto.randomUUID()})}><p>Revoke <code>{text(row.deviceId)}</code>. Existing device credentials will be denied.</p></Confirm></article>):<p>No devices returned for this owner.</p>}</section>}
    {page==='devices'&&can('workspace:grants:manage')&&<DeviceApproval key={`${session.scope.workspaceId}-${generation.current}`} invoke={invoke} mutate={mutate} disabled={busy} scopeLabel={`${session.scope.groupId} / ${session.scope.workspaceId}`}/>}
    {retry&&<button disabled={busy} onClick={()=>void mutate(retry.path,retry.payload)}>{retry.path==='/api/review/decision'?'Retry exact decision':'Retry exact operation'}</button>}{receipt&&<section aria-label="Decision outcome"><h2>Server receipt</h2><Json value={receipt}/></section>}
   </>}
  </Boundary>}
 </main><footer>Allura · Governed memory · No synthetic records in this interface. Deployed and actual-human acceptance remain separate.</footer></div></div>;
}
const root=document.getElementById('root');if(root){createRoot(root).render(<App/>);}
