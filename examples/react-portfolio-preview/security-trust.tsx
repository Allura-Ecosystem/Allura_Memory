import { type FormEvent, useState } from 'react'
import { usePreviewWork } from './preview-work-state'

const controlSamples = [
  { id: 'CTRL-01', area: 'Access reviews', title: 'Workspace membership review', owner: 'Jordan Lee · HR', requirement: 'Review memberships and role scope with a named owner; distinguish department membership from permission.', implementation: 'Planned · sample', evidence: 'Not reviewed', reviewed: 'No review performed', nextReview: 'Example target: 2026-11-02', issue: 'Membership review evidence is missing.', rationale: 'A role table alone cannot prove that access is enforced. A review would need scoped membership evidence, owner decisions, and revocation results.', prompt: 'Which membership evidence should the workspace owner review?' },
  { id: 'CTRL-02', area: 'Access reviews', title: 'Service identity boundaries', owner: 'Taylor Chen · IT', requirement: 'Separate human and agent identities; grant only the actions and workspace scope each needs.', implementation: 'In progress · sample', evidence: 'Evidence insufficient · sample', reviewed: 'Illustrative review: 2026-10-16', nextReview: 'Example target: 2026-10-30', issue: 'Revocation behavior has not been demonstrated.', rationale: 'An illustrative inventory lists intended scope but provides no signed identity, credential expiry, or tested denial evidence. This is a fictional review scenario.', prompt: 'What would demonstrate effective credential revocation?' },
  { id: 'CTRL-03', area: 'Policies', title: 'Retention and confidential sharing', owner: 'Sam Rivera · Marketing', requirement: 'Define retention owners, review periods, permitted destinations, and explicit confidential-sharing rules.', implementation: 'Draft policy · sample', evidence: 'Not reviewed', reviewed: 'No review performed', nextReview: 'Example target: 2026-11-06', issue: 'Retention periods and exception handling need an owner decision.', rationale: 'A written policy needs approved scope and supporting implementation evidence. The preview does not select a retention period or authorize sharing.', prompt: 'Which retention or sharing decision is still unresolved?' },
  { id: 'CTRL-04', area: 'Incidents', title: 'Incident evidence and accountability', owner: 'Taylor Chen · IT', requirement: 'Preserve incident evidence, identify a response owner, and document decisions before closing an incident.', implementation: 'Workflow draft · sample', evidence: 'Exercise not performed', reviewed: 'No review performed', nextReview: 'Example target: 2026-11-09', issue: 'Escalation and evidence collection have not been exercised.', rationale: 'A sample incident workflow is not proof that notifications, containment, or audit capture work. A real review would examine a bounded exercise and its findings.', prompt: 'What should the incident exercise demonstrate?' },
  { id: 'CTRL-05', area: 'Recovery', title: 'Backup restoration evidence', owner: 'Taylor Chen · IT', requirement: 'Demonstrate a recoverable backup with integrity checks and measured restoration results.', implementation: 'Planned · sample', evidence: 'Recovery not verified', reviewed: 'No review performed', nextReview: 'Example target: 2026-11-12', issue: 'No restoration receipt or integrity result exists in this preview.', rationale: 'A configured backup schedule cannot establish recoverability. A real exercise would need a dated restore receipt, integrity results, and measured recovery duration.', prompt: 'What evidence would make a restoration exercise reviewable?' },
]
const sections = ['Control register', 'Access reviews', 'Policies', 'Incidents', 'Recovery']

export function SecurityTrust(): React.ReactElement {
  const work = usePreviewWork()
  const requestedControl = new URLSearchParams(location.hash.split('?')[1] || '').get('control')
  const initialControl = controlSamples.find(item => item.id === requestedControl) || controlSamples[0]
  const [section, setSection] = useState(requestedControl ? initialControl.area : 'Control register')
  const [filter, setFilter] = useState('All evidence states')
  const [selectedId, setSelectedId] = useState(initialControl.id)
  const [question, setQuestion] = useState('')
  const [questions, setQuestions] = useState<{ id: string; text: string }[]>([])
  const [message, setMessage] = useState('')
  const [taskMessage, setTaskMessage] = useState('')
  const visible = controlSamples.filter(item => (section === 'Control register' || item.area === section)
    && (filter === 'All evidence states' || item.evidence === filter))
  const selected = visible.find(item => item.id === selectedId) ?? visible[0]
  const linkedTask = selected && work.tasks.find(task => task.controlId === selected.id)
  function addControlTask() {
    if (!selected) return
    work.addTask({ title: `Review evidence: ${selected.title}`, workspace: selected.owner.split(' · ')[1], assignee: selected.owner.split(' · ')[0], related: selected.title, controlId: selected.id, href: `#trust?control=${selected.id}` })
    setTaskMessage('Control-linked sample task is on the work board. Unsaved local change; no notification or real task was created.')
  }
  function recordQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || question.trim().length < 3) { setMessage('Enter an evidence question with at least 3 characters.'); return }
    setQuestions(items => [...items, { id: selected.id, text: question.trim() }])
    setQuestion('')
    setMessage('Sample evidence question recorded locally. Nobody was notified and no control was approved.')
  }
  return <div className="trust-view">
    <p className="sample-note">Design sample · All owners, controls, review dates, and findings are fictional. No live control is verified or compliance claimed. Evidence questions reset when leaving this screen; linked tasks survive navigation until page reload.</p>
    <section className="trust-aspiration"><p className="eyebrow">Portfolio aspiration</p><h2>Make trust understandable and accountable.</h2><p>Allura’s design ambition is one place to see who owns a control, what it requires, what exists, and what evidence still needs review. Implementation status and evidence review are separate claims.</p></section>
    <div className="preview-toolbar trust-sections" aria-label="Security and trust sections">{sections.map(value => <button key={value} type="button" aria-pressed={section === value} onClick={() => { setSection(value); setFilter('All evidence states'); setQuestion(''); setMessage(''); setTaskMessage('') }}>{value}</button>)}</div>
    <div className="preview-toolbar"><label>Evidence review filter<select value={filter} onChange={event => { setFilter(event.target.value); setQuestion(''); setMessage(''); setTaskMessage('') }}><option>All evidence states</option>{[...new Set(controlSamples.map(item => item.evidence))].map(value => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setSection('Control register'); setFilter('All evidence states'); setSelectedId(controlSamples[0].id); setQuestions([]); setQuestion(''); setTaskMessage(''); setMessage('Evidence questions reset. Linked work tasks remain on the work board; no real records changed.') }}>Reset trust demonstration</button></div>
    <p className="muted" role="status">{visible.length} sample controls shown · {questions.length} local evidence questions</p>
    <div className="preview-split trust-layout">
      <div className="table-scroll trust-register" role="region" aria-label="Sample security control register" tabIndex={0}><table><thead><tr><th>Control / owner</th><th>Implementation status</th><th>Evidence review</th></tr></thead><tbody>{visible.map(item => <tr key={item.id}><td><button type="button" className="text-button" aria-pressed={selected?.id === item.id} onClick={() => { setSelectedId(item.id); setQuestion(''); setMessage(''); setTaskMessage('') }}>{item.title}</button><small>{item.owner}</small></td><td>{item.implementation}</td><td>{item.evidence}</td></tr>)}</tbody></table>{!visible.length && <p className="sample-note">No sample controls match. Change the evidence filter or section.</p>}</div>
      <aside className="preview-inspector trust-inspector" aria-label="Security control detail">
        {selected ? <><p className="eyebrow">Fictional control · {selected.id}</p><h2>{selected.title}</h2><dl><dt>Owner</dt><dd>{selected.owner}</dd><dt>Requirement</dt><dd>{selected.requirement}</dd><dt>Implementation</dt><dd>{selected.implementation}</dd><dt>Evidence review</dt><dd>{selected.evidence}</dd><dt>Review date</dt><dd>{selected.reviewed}</dd><dt>Next review</dt><dd>{selected.nextReview}</dd><dt>Open issue</dt><dd>{selected.issue}</dd></dl><h3>Evidence rationale</h3><p>{selected.rationale}</p><div className="trust-work-action"><button type="button" onClick={addControlTask}>{linkedTask ? "Confirm linked sample task" : "Add to work board"}</button><p role="status">{taskMessage}</p>{linkedTask && <a href={`#work?task=${linkedTask.id}`}>Open linked work task {linkedTask.id} →</a>}</div><form className="trust-question-form" onSubmit={recordQuestion}><label htmlFor="trust-evidence-question">{selected.prompt}</label><textarea id="trust-evidence-question" rows={3} maxLength={500} value={question} onChange={event => setQuestion(event.target.value)} aria-describedby="trust-question-status" /><button type="submit">Record sample evidence question</button></form><p id="trust-question-status" role="status">{message}</p><h3>Local questions for this control</h3>{questions.some(item => item.id === selected.id) ? <ul className="trust-questions">{questions.filter(item => item.id === selected.id).map((item, index) => <li key={index}>{item.text}</li>)}</ul> : <p>No sample questions recorded yet.</p>}</> : <><h2>No control selected</h2><p>Change the filter to inspect a control.</p></>}
      </aside>
    </div>
  </div>
}
