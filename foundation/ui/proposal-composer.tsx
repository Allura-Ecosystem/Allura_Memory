import {useState} from 'react';
import {Confirm} from './controls.tsx';
import {type DashboardRow} from '../src/dashboard-view.ts';
import './forms.css';
type Props={disabled:boolean;mutate:(path:string,body:DashboardRow)=>Promise<void>;memory?:DashboardRow;scopeLabel:string};
export function ProposalComposer({disabled,mutate,memory,scopeLabel}:Props){
 const [content,setContent]=useState(''),[evidence,setEvidence]=useState(''),[reason,setReason]=useState(''),[kind,setKind]=useState('observation'),[submitted,setSubmitted]=useState(false);
 const prefix=memory?'Correction':'Proposal',ids=evidence.trim().split(/[\s,]+/).filter(Boolean),validIds=ids.length>0&&ids.length<=(memory?31:32)&&new Set(ids).size===ids.length&&ids.every(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id));
 const valid=validIds&&content.trim().length>0&&new TextEncoder().encode(content).length<=12000&&(!memory||(reason.trim().length>0&&new TextEncoder().encode(reason).length<=4000));
 async function submit(){setSubmitted(true);await mutate(memory?'/api/review/correction':'/api/review/submit',memory?{baseMemoryId:memory.id,expectedBaseVersion:String(memory.version),content,rationale:reason,evidenceIds:ids,operationKey:crypto.randomUUID()}:{summary:content,assertionKind:kind,evidenceIds:ids});}
 return <section aria-label={`${prefix} composer`} className="composer"><h2>{memory?'Propose a correction':'Draft a proposal'}</h2><p>{memory?'The selected immutable version remains current until a separately entitled independent human approves a valid correction.':'Use evidence already captured by a paired device or agent. Draft submission is not approval.'}</p>
  <label>{prefix} {memory?'text':'summary'}<textarea value={content} onChange={e=>setContent(e.target.value)} maxLength={12000}/></label>
  <label>{prefix} evidence UUIDs<textarea value={evidence} onChange={e=>setEvidence(e.target.value)} maxLength={1216}/></label><p>Separate exact evidence UUIDs with commas or whitespace. The server checks current evidence access.</p>
  {memory?<label>Correction reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={4000}/></label>:<label>Assertion kind<select value={kind} onChange={e=>setKind(e.target.value)}><option value="observation">Observation</option><option value="inference">Inference</option></select></label>}
  <Confirm title={memory?'Submit exact-base correction':'Submit pending proposal'} label={memory?'Review correction':'Review proposal'} disabled={disabled||submitted||!valid} confirm={submit}><p>Requested scope: <code>{scopeLabel}</code></p><p>{content}</p>{memory&&<p>Base <code>{String(memory.id)}</code> · version {String(memory.version)}</p>}<p>Evidence: {ids.join(', ')}</p><p>No knowledge is promoted by this action.</p></Confirm>
  {submitted&&<p>Submission attempted. Inspect the server outcome. No automatic retry: initial proposal submission has no idempotency key. Reconcile the queue before creating another draft.</p>}
 </section>;
}
