import {useEffect,useRef,useState} from 'react';
import {Confirm} from './controls.tsx';
import {OAuthConsentTransport,consentTransaction,type ConsentDisplay} from '../src/oauth-consent-transport.ts';
import {DashboardError} from '../src/dashboard-transport.ts';
export function OAuthConsent(){
 const [group,setGroup]=useState(''),[workspace,setWorkspace]=useState(''),[phase,setPhase]=useState<'entry'|'verified'|'displayed'|'closed'>('entry'),[busy,setBusy]=useState(false),[shown,setShown]=useState<ConsentDisplay|null>(null),[notice,setNotice]=useState('Enter the workspace you are authorized to administer.');
 const client=useRef<OAuthConsentTransport|null>(null),generation=useRef(0),locked=useRef(false);
 let transaction:string|undefined;try{transaction=consentTransaction(window.location.href);}catch{/* neutral invalid navigation */}
 const fail=(error:unknown)=>{client.current?.close();setShown(null);setPhase('closed');setNotice(`${error instanceof DashboardError&&error.code==='denied'?'Access denied.':'Request unavailable or outcome unknown.'} Start a fresh authorization from your client. No success or rollback is inferred.`);};
 async function run(work:(current:()=>void)=>Promise<void>){if(locked.current){return;}locked.current=true;setBusy(true);const id=generation.current;try{await work(()=>{if(id!==generation.current){throw new DashboardError('stale');}});}catch(error){if(id===generation.current){fail(error);}}finally{if(id===generation.current){setBusy(false);locked.current=false;}}}
 const verify=()=>run(async current=>{if(!transaction||phase!=='entry'){return;}const next=new OAuthConsentTransport(window.location.origin,{groupId:group,workspaceId:workspace},transaction);client.current=next;await next.verify();current();setPhase('verified');setNotice('Current workspace administration access verified. Review this one-use request explicitly.');});
 const display=()=>run(async current=>{if(phase!=='verified'||!client.current){return;}const result=await client.current.display();current();setShown(result);setPhase('displayed');setNotice('Review the exact request before deciding.');});
 const decide=(decision:'approve'|'cancel')=>run(async current=>{if(phase!=='displayed'||!client.current){return;}const target=await client.current.decide(decision);current();setShown(null);setPhase('closed');setNotice('Returning to your client.');window.location.assign(target);});
 useEffect(()=>{
  const discard=()=>{generation.current++;locked.current=true;client.current?.close();setShown(null);setGroup('');setWorkspace('');setBusy(false);setPhase('closed');setNotice('This request is stale. Start a fresh authorization from your client.');};
  const restored=(event:PageTransitionEvent)=>{if(event.persisted){discard();}};
  if(['reload','back_forward'].includes((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type??'')){discard();}
  window.addEventListener('pagehide',discard);window.addEventListener('popstate',discard);window.addEventListener('pageshow',restored);
  return()=>{generation.current++;client.current?.close();window.removeEventListener('pagehide',discard);window.removeEventListener('popstate',discard);window.removeEventListener('pageshow',restored);};
 },[]);
 return <div className="oauth-consent"><header><img src="/assets/allura-lettermark.png" alt="Allura AL icon" width="64" height="64"/><strong>Allura Memory</strong></header><main><h1>Connect an app</h1><p>This connects an app using your current permitted content access. It does not make the app a human approver or add anyone to a workspace.</p>
 {!transaction?<p role="alert">Invalid connection request. Start a fresh authorization from your client.</p>:<><form className="scope" onSubmit={e=>{e.preventDefault();void verify();}}><label>Tenant namespace<input required autoComplete="off" value={group} disabled={busy||phase!=='entry'} onChange={e=>setGroup(e.target.value)}/></label><label>Workspace UUID<input required autoComplete="off" value={workspace} disabled={busy||phase!=='entry'} onChange={e=>setWorkspace(e.target.value)}/></label><button disabled={busy||phase!=='entry'}>Verify workspace</button></form>
 <p role={phase==='closed'?'alert':'status'} aria-live="polite">{notice}</p>
 {phase==='verified'&&<button disabled={busy} onClick={()=>void display()}>Review connection request</button>}
 {shown&&<section aria-label="Connection request"><h2>Connection request</h2><dl><dt>Application</dt><dd>{shown.name}</dd><dt>Application ID</dt><dd><code>{shown.clientId}</code></dd><dt>Callback</dt><dd><code>{shown.redirectUri}</code></dd><dt>Tenant namespace</dt><dd><code>{shown.groupId}</code></dd><dt>Workspace</dt><dd><code>{shown.workspaceId}</code></dd></dl><h3>Requested actions</h3><ul>{shown.actions.map(action=><li key={action}><code>{action}</code></li>)}</ul><Confirm title="Approve this connection" label="Approve connection" disabled={busy} confirm={()=>decide('approve')}><p>Connect {shown.name} to this exact workspace with the actions displayed. Dismissing this dialog does not cancel the OAuth request.</p></Confirm><button disabled={busy} onClick={()=>void decide('cancel')}>Cancel connection</button></section>}</>}
 </main></div>;
}
