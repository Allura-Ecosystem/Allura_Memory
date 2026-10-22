import { type FormEvent, useEffect, useState } from 'react'
import { canLinkFile, usePreviewFiles } from './files-state'
import { useOrganization } from './organization-state'
import { type PreviewTask, usePreviewWork, WORK_STAGES, type WorkStage } from './preview-work-state'
import { type BoardView, Kanban } from './studio-adapters/kanban/kanban'

function TaskInspector({ task, announce, canEdit }: { task: PreviewTask; announce: (message: string) => void; canEdit: boolean }) {
  const work = usePreviewWork()
  const files = usePreviewFiles()
  const organization = useOrganization()
  const [fileId, setFileId] = useState('')
  const eligibleReviewers = work.reviewersForTask(task)
  const [title, setTitle] = useState(task.title)
  const [owner, setOwner] = useState(task.assignee)
  const [editError, setEditError] = useState('')
  const [reviewer, setReviewer] = useState(eligibleReviewers[0] || '')
  const [rationale, setRationale] = useState('')
  const [decision, setDecision] = useState<'Approved' | 'Changes requested'>('Approved')
  const [reviewMessage, setReviewMessage] = useState('')
  useEffect(() => { setTitle(task.title); setOwner(task.assignee) }, [task.title, task.assignee])
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitted = new FormData(event.currentTarget)
    const submittedTitle = String(submitted.get('title') ?? '').trim()
    const submittedOwner = String(submitted.get('assignee') ?? '')
    const submittedDate = String(submitted.get('dueDate') ?? '')
    if (submittedTitle.length < 3 || submittedTitle.length > 120) { setEditError('Enter a title between 3 and 120 characters.'); return }
    if (!work.assignees.includes(submittedOwner) && submittedOwner !== task.assignee) { setEditError('Choose a sample task owner.'); return }
    work.editTask(task.id, { title: submittedTitle, assignee: submittedOwner, dueDate: submittedDate }); setEditError(''); announce('Sample task updated. Any earlier review needs to be done again.')
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const error = work.reviewTask(task.id, eligibleReviewers.includes(reviewer) ? reviewer : (eligibleReviewers[0] || ''), decision, rationale)
    setReviewMessage(error || 'Fictional decision recorded locally. No live approval, identity check, or audit receipt was created.')
  }
  return <aside className="preview-inspector work-inspector" aria-label="Sample work task inspector"><p className="eyebrow">Fictional task · {task.id}</p><h2>{task.title}</h2><a href={`#graph?focus=${encodeURIComponent(`task:${task.id}`)}`}>See connections →</a><dl><dt>Workspace</dt><dd>{task.workspace}</dd><dt>Author</dt><dd>{task.author}</dd><dt>Assignee</dt><dd>{organization.people.find(person => person.name === task.assignee) ? <a href={`#profile?person=${organization.people.find(person => person.name === task.assignee)?.id}`}>{task.assignee}</a> : task.assignee}</dd><dt>Due date</dt><dd>{task.dueDate || 'Not set'}</dd><dt>Stage</dt><dd>{task.stage} · sample</dd><dt>Review</dt><dd>{task.reviewRequired ? `${task.reviewDecision} · fictional` : 'Not required for this sample draft'}</dd></dl>
    <label htmlFor="work-stage">Move sample task to</label><select id="work-stage" disabled={!canEdit} value={task.stage} onChange={event => { const stage = event.target.value as WorkStage; announce(work.moveTask(task.id, stage) || `Moved “${task.title}” to ${stage}. No real work item changed.`) }}>{WORK_STAGES.map(stage => <option key={stage}>{stage}</option>)}</select>
    {task.sourceSnapshot && <section aria-label="Captured source example"><h3>Captured example · version {task.sourceVersion}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{task.sourceSnapshot}</p><p>A fictional review covers only this captured version. Later source edits need a fresh review. Completing a sample task does not publish knowledge or perform an external action.</p></section>}
    <section className="work-file-links enterprise-preview" aria-label="Task files"><h3>Linked files</h3><p>Open the source alongside the work. Adding or removing a file resets any earlier sample review.</p>
      <ul>{files.filesForTask(task.id).map(file => <li key={file.id}><span><a href={`#files?file=${file.id}`}>{file.name}</a><small>Version {files.links.find(link => link.taskId === task.id && link.fileId === file.id)?.fileVersion} · {file.workspace}<br />{file.source}</small></span><button type="button" disabled={!canEdit} onClick={() => { files.unlinkFileFromTask(file.id, task.id); announce('File unlinked locally; prior sample review is Pending.') }}>Unlink {file.name}</button></li>)}</ul>
      {!files.filesForTask(task.id).length && <p>No files linked yet.</p>}
      <label>Choose a file for this task<select disabled={!canEdit} value={fileId} onChange={event => setFileId(event.target.value)}><option value="">Select a sample file</option>{files.files.filter(file => canLinkFile(file, task) && !files.links.some(link => link.fileId === file.id && link.taskId === task.id)).map(file => <option key={file.id} value={file.id}>{file.name}{file.source.startsWith('Simulated Shopify') ? ` · ${file.source.split(' · ').at(-1)}` : ''}</option>)}</select></label>
      <button type="button" disabled={!canEdit || !fileId} onClick={() => { const error = files.linkFileToTask(fileId, task.id); announce(error || 'File linked locally; prior sample review is Pending.'); if (!error) setFileId('') }}>Link file to task</button><a href="#files">Browse the file manager →</a>
    </section>
    <a href={task.href}>Open related design screen: {task.related} →</a>
    <details className="work-edit"><summary>Edit title, owner, and due date</summary><form className="work-edit-form" onSubmit={save} noValidate><fieldset className="work-edit-fields" disabled={!canEdit}><label>Task title<input name="title" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} aria-invalid={Boolean(editError)} /></label><label>Task owner<select name="assignee" value={owner} onChange={event => setOwner(event.target.value)}>{[...new Set([task.assignee, ...work.assignees])].map(person => <option key={person}>{person}</option>)}</select></label><label>Due date<input key={`${task.id}:${task.dueDate}`} type="date" name="dueDate" defaultValue={task.dueDate} /></label><p role="status">{editError}</p><button type="submit">Save sample edits</button></fieldset></form></details>
    <fieldset className="work-checklist"><legend>Sample checklist</legend>{task.checklist.map(item => <label key={item.id}><input type="checkbox" disabled={!canEdit} checked={item.checked} onChange={() => { work.toggleChecklist(task.id, item.id); announce('Checklist changed locally; any previous fictional review is now Pending.') }} />{item.text}</label>)}</fieldset>
    {task.reviewRequired && <section className="work-review"><h3>Independent review demonstration</h3><p>Choose a fictional reviewer different from the author and current assignee. This is a design interaction, not authenticated approval.</p><p>Eligible reviewers need an active sample role and explicit membership in this task’s team.</p>{!eligibleReviewers.length && <p>No independent reviewer is currently eligible for this sample team. <a href="#people">Review roles in People →</a><a href="#teams">Adjust sample team membership →</a></p>}<form onSubmit={review}><fieldset className="work-review-fields" disabled={!canEdit}><label>Fictional reviewer<select disabled={!eligibleReviewers.length} value={eligibleReviewers.includes(reviewer) ? reviewer : (eligibleReviewers[0] || '')} onChange={event => setReviewer(event.target.value)}>{eligibleReviewers.map(person => <option key={person}>{person}</option>)}</select></label><label>Sample review decision<select value={decision} onChange={event => setDecision(event.target.value as 'Approved' | 'Changes requested')}><option>Approved</option><option>Changes requested</option></select></label><label>Sample rationale<textarea rows={3} maxLength={500} value={rationale} onChange={event => setRationale(event.target.value)} /></label><button type="submit" disabled={!canEdit || !eligibleReviewers.length}>Record fictional review</button></fieldset></form><p role="status">{reviewMessage}</p>{task.reviewer && <p>Latest sample review: {task.reviewer} · {task.reviewDecision}. {task.reviewRationale}</p>}</section>}
    <h3>Local task activity</h3><ol className="work-history">{task.history.map((item, index) => <li key={index}>{item}</li>)}</ol>
  </aside>
}
export function WorkBoard({ previewRole }: { previewRole: string }): React.ReactElement {
  const canEdit = previewRole === 'Curator' || previewRole === 'Admin'
  const work = usePreviewWork()
  const files = usePreviewFiles()
  const [view, setView] = useState<BoardView>('board')
  const [query, setQuery] = useState('')
  const [workspace, setWorkspace] = useState('All workspaces')
  const [assignee, setAssignee] = useState('All assignees')
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(location.hash.split('?')[1] || '').get('task') || work.tasks[0]?.id)
  const [title, setTitle] = useState('')
  const [newWorkspace, setNewWorkspace] = useState(work.workspaces[0])
  const [newAssignee, setNewAssignee] = useState(work.assignees[0] || '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { if (!work.assignees.includes(newAssignee)) setNewAssignee(work.assignees[0] || '') }, [work.assignees, newAssignee])
  const visible = work.tasks.filter(task => `${task.id} ${task.title} ${task.workspace} ${task.assignee}`.toLowerCase().includes(query.trim().toLowerCase()) && (workspace === 'All workspaces' || task.workspace === workspace) && (assignee === 'All assignees' || task.assignee === assignee))
  const selected = visible.find(task => task.id === selectedId) ?? visible[0]
  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit) return
    if (title.trim().length < 3 || title.trim().length > 120) { setError('Enter a task title between 3 and 120 characters.'); return }
    if (!work.assignees.includes(newAssignee)) { setError('Choose an active sample person for this task.'); return }
    const id = work.addTask({ title, workspace: newWorkspace, assignee: newAssignee })
    setSelectedId(id); setQuery(''); setWorkspace('All workspaces'); setAssignee('All assignees'); setTitle(''); setError(''); setNotice(`Added “${title.trim()}” to To do. Nothing was saved to Allura.`)
  }
  function reset() { work.reset(); setQuery(''); setWorkspace('All workspaces'); setAssignee('All assignees'); setSelectedId('WORK-001'); setTitle(''); setNewWorkspace(work.workspaces[0]); setNewAssignee(work.assignees[0] || ''); setError(''); setNotice('Work board reset to the starting sample. No real records changed.') }
  return <div className="work-view studio-source"><p className="sample-note">Interactive design sample · Fictional tasks and people. Local edits survive preview navigation but reset on page reload. Done does not approve knowledge or complete a real security control.</p>
    <p>{canEdit ? 'You can edit this sample board. Reviews still require an eligible independent fictional person.' : 'Reader example: view tasks and files. Choose Editor or Administrator in Preview options to try local edits.'}</p><div className="preview-toolbar work-filters"><label>Work workspace<select value={workspace} onChange={event => setWorkspace(event.target.value)}><option>All workspaces</option>{work.workspaces.map(value => <option key={value}>{value}</option>)}</select></label><label>Assignee<select value={assignee} onChange={event => setAssignee(event.target.value)}><option>All assignees</option>{[...new Set([...work.tasks.map(task => task.assignee), ...work.assignees])].map(value => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={reset}>Reset work board</button></div>
    <p className="muted">{visible.length} of {work.tasks.length} sample tasks match. Select a task to edit it or change its stage.</p><p className="work-notice" role="status" aria-live="polite">{notice}</p>
    <Kanban tasks={visible} selectedId={selected?.id} canEdit={canEdit} fileCount={taskId => files.filesForTask(taskId).length} onSelect={setSelectedId} onMove={(taskId, stage) => { if (!canEdit) return; const task = work.tasks.find(item => item.id === taskId); setNotice(work.moveTask(taskId, stage) || `Moved “${task?.title || 'sample task'}” to ${stage}. No real work item changed.`) }} view={view} onViewChange={setView} query={query} onQueryChange={setQuery} />
    <div className="preview-split work-details">{selected ? <TaskInspector key={selected.id} task={selected} announce={setNotice} canEdit={canEdit} /> : <aside className="preview-inspector"><h2>No matching task</h2><p>Change the workspace or assignee filter.</p></aside>}
      <section className="preview-section work-add"><h2>Add a sample task</h2><form onSubmit={addTask} noValidate><fieldset className="work-edit-fields" disabled={!canEdit}><label htmlFor="work-title">Title<input id="work-title" value={title} maxLength={120} onChange={event => { setTitle(event.target.value); setError('') }} aria-invalid={Boolean(error)} aria-describedby="work-title-error" placeholder="Describe a bounded piece of work" /></label><p id="work-title-error" role={error ? 'alert' : undefined}>{error}</p><label>New task workspace<select value={newWorkspace} onChange={event => setNewWorkspace(event.target.value)}>{work.workspaces.map(value => <option key={value}>{value}</option>)}</select></label><label>Assign sample task to<select value={newAssignee} onChange={event => setNewAssignee(event.target.value)}>{work.assignees.map(value => <option key={value}>{value}</option>)}</select></label><button type="submit" className="primary">Add sample task</button></fieldset></form><p>New tasks start in To do and require a separate fictional review before Done. Nobody is notified.</p></section>
    </div></div>
}
