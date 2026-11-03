// Adapted from Studio Base UI dashboard/kanban/_components/kanban.tsx (MIT).
// Source toolbar and column composition now read Allura's shared preview providers.
// Board/List/Table are working views; unsupported upstream actions are omitted.
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@studio/components/ui/table'
import { Kanban as KanbanIcon, List, Table2 } from 'lucide-react'
import { KanbanColumn } from './kanban-column'
import { TaskCard } from './task-card'
import { type PreviewTask, WORK_STAGES, type WorkStage } from '../../preview-work-state'
import './kanban.css'

export type BoardView = 'board' | 'list' | 'table'
export function Kanban({ tasks, selectedId, canEdit, fileCount, onSelect, onMove, view, onViewChange, query, onQueryChange }: {
  tasks: PreviewTask[]
  selectedId?: string
  canEdit: boolean
  fileCount: (taskId: string) => number
  onSelect: (taskId: string) => void
  onMove: (taskId: string, stage: WorkStage) => void
  view: BoardView
  onViewChange: (view: BoardView) => void
  query: string
  onQueryChange: (query: string) => void
}) {
  return <>
    <div className="studio-kanban-toolbar">
      <div className="studio-kanban-views" role="group" aria-label="Task view">
        <Button variant="ghost" aria-pressed={view === 'board'} onClick={() => onViewChange('board')}><KanbanIcon aria-hidden="true" />Board</Button>
        <Button variant="ghost" aria-pressed={view === 'list'} onClick={() => onViewChange('list')}><List aria-hidden="true" />List</Button>
        <Button variant="ghost" aria-pressed={view === 'table'} onClick={() => onViewChange('table')}><Table2 aria-hidden="true" />Table</Button>
      </div>
      <label className="studio-kanban-search">Search tasks<Input type="search" placeholder="Title, owner, team or task number" value={query} onChange={event => onQueryChange(event.target.value)} /></label>
    </div>
    {view === 'board' && <><p className="muted">{canEdit ? 'Drag a task to another stage, or open it and use Move sample task to. Done still requires an independent sample review.' : 'Open a task to see its files and review details.'}</p><div className="studio-kanban-board" aria-label="Sample work board">{WORK_STAGES.map(stage => <KanbanColumn key={stage} stage={stage} tasks={tasks.filter(task => task.stage === stage)} selectedId={selectedId} canEdit={canEdit} fileCount={fileCount} onSelect={onSelect} onMove={onMove} />)}</div></>}
    {view === 'list' && <div className="studio-kanban-list" aria-label="Sample task list">{WORK_STAGES.map(stage => <section className="studio-kanban-list-group" key={stage}><h2>{stage} · {tasks.filter(task => task.stage === stage).length}</h2><ul>{tasks.filter(task => task.stage === stage).map(task => <li key={task.id}><TaskCard task={task} selected={selectedId === task.id} fileCount={fileCount(task.id)} canEdit={false} onSelect={() => onSelect(task.id)} /></li>)}</ul>{!tasks.some(task => task.stage === stage) && <p>No matching sample tasks.</p>}</section>)}</div>}
    {view === 'table' && <div className="studio-kanban-table"><Table><TableCaption>Fictional tasks. Open a task for files, stage changes and independent review.</TableCaption><TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Team</TableHead><TableHead>Owner</TableHead><TableHead>Stage</TableHead><TableHead>Due date</TableHead><TableHead>Files</TableHead></TableRow></TableHeader><TableBody>{tasks.map(task => <TableRow key={task.id}><TableCell><button type="button" aria-pressed={selectedId === task.id} onClick={() => onSelect(task.id)}>{task.id} · {task.title}</button></TableCell><TableCell>{task.workspace}</TableCell><TableCell>{task.assignee}</TableCell><TableCell>{task.stage}</TableCell><TableCell>{task.dueDate || 'Not set'}</TableCell><TableCell>{fileCount(task.id)}</TableCell></TableRow>)}</TableBody></Table>{!tasks.length && <p>No matching sample tasks.</p>}</div>}
  </>
}
