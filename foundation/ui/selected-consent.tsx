import {useEffect,useRef,useState} from 'react';
import {Confirm} from './controls.tsx';
import {SelectedConsentTransport,selectedConsentTransaction,type SelectedConsentDisplay} from '../src/selected-consent-transport.ts';
import {DashboardError} from '../src/dashboard-transport.ts';
export function SelectedConsent(){
 const [group,setGroup]=useState(''),[workspace,setWorkspace]=useState(''),[phase,setPhase]=useState<'entry'|'displayed'|'closed'>('entry'),[busy,setBusy]=useState(false),[shown,setShown]=useState<SelectedConsentDisplay|null>(null),[notice,setNotice]=useState('Enter the known namespace and workspace for this connection request.');
 const client=useRef<SelectedConsentTransport|null>(null),generation=useRef(0),locked=useRef(false);
 let transaction:string|undefined;try{transaction=selectedConsentTransaction(window.location.href);}catch{/* neutral invalid navigation */}
 const fail=(error:unknown)=>{client.current?.close();setShown(null);setPhase('closed');setNotice(`${error instanceof DashboardError&&error.code==='denied'?'Access denied.':'Request unavailable or outcome unknown.'} Start a fresh authorization from your client. No success or rollback is inferred.`);};
 async function run(work:(current:()=>void)=>Promise<void>){if(locked.current){return;}locked.current=true;setBusy(true);const id=generation.current;try{await work(()=>{if(id!==generation.current){throw new DashboardError('stale');}});}catch(error){if(id===generation.current){fail(error);}}finally{if(id===generation.current){setBusy(false);locked.current=false;}}}
 const display=()=>run(async current=>{if(!transaction||phase!=='entry'){return;}const next=new SelectedConsentTransport(window.location.origin,{groupId:group,workspaceId:workspace},transaction);client.current=next;const result=await next.display();current();setShown(result);setPhase('displayed');setNotice('Review the exact request before deciding.');});
 const decide=(decision:'approve'|'cancel')=>run(async current=>{if(phase!=='displayed'||!client.current){return;}const target=await client.current.decide(decision);current();setShown(null);setPhase('closed');setNotice('Returning to your client.');window.location.assign(target);});
 useEffect(()=>{
  const discard=()=>{generation.current++;locked.current=true;client.current?.close();setShown(null);setGroup('');setWorkspace('');setBusy(false);setPhase('closed');setNotice('This request is stale. Start a fresh authorization from your client.');};
  const restored=(event:PageTransitionEvent)=>{if(event.persisted){discard();}};
  if(['reload','back_forward'].includes((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type??'')){discard();}
  window.addEventListener('pagehide',discard);window.addEventListener('popstate',discard);window.addEventListener('pageshow',restored);
  return()=>{generation.current++;client.current?.close();window.removeEventListener('pagehide',discard);window.removeEventListener('popstate',discard);window.removeEventListener('pageshow',restored);};
 },[]);
 return <div className="oauth-consent"><header><img src="/assets/allura-lettermark.png" alt="Allura AL icon" width="64" height="64"/><strong>Allura Memory</strong></header><main><h1>Connect an app</h1><p>This app may read only exact versions separately approved for you. Connecting adds no shares or workspace access and does not make the app a human approver. Current per-version sharing still applies to every read.</p>
 {!transaction?<p role="alert">Invalid connection request. Start a fresh authorization from your client.</p>:<><form className="scope" onSubmit={e=>{e.preventDefault();void display();}}><label>Tenant namespace<input required autoComplete="off" value={group} disabled={busy||phase!=='entry'} onChange={e=>setGroup(e.target.value)}/></label><label>Workspace UUID<input required autoComplete="off" value={workspace} disabled={busy||phase!=='entry'} onChange={e=>setWorkspace(e.target.value)}/></label><button disabled={busy||phase!=='entry'}>Review connection request</button></form>
 <p role={phase==='closed'?'alert':'status'} aria-live="polite">{notice}</p>
 {shown&&<section aria-label="Connection request"><h2>Connection request</h2><dl><dt>Application</dt><dd>{shown.name}</dd><dt>Application ID</dt><dd><code>{shown.clientId}</code></dd><dt>Callback</dt><dd><code>{shown.redirectUri}</code></dd><dt>Tenant namespace</dt><dd><code>{shown.groupId}</code></dd><dt>Workspace</dt><dd><code>{shown.workspaceId}</code></dd></dl><h3>Requested actions</h3><ul>{shown.actions.map(action=><li key={action}><code>{action}</code></li>)}</ul><Confirm title="Approve this connection" label="Approve connection" disabled={busy} confirm={()=>decide('approve')}><p>Connect {shown.name} for selected-version reading only, with the request displayed. Dismissing this dialog does not cancel the OAuth request.</p></Confirm><button disabled={busy} onClick={()=>void decide('cancel')}>Cancel connection</button></section>}</>}
 </main></div>;
}
