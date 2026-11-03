// Adapted from Studio Base UI dashboard/kanban/_components/kanban-column.tsx (MIT).
// Keeps section/header/count/scrolling-card composition; unused controls are omitted.
// Native drag moves through the same reviewed-task contract as the inspector select.
import { useState } from 'react'
import { TASK_DRAG_TYPE, TaskCard } from './task-card'
import type { PreviewTask, WorkStage } from '../../preview-work-state'

export function KanbanColumn({ stage, tasks, selectedId, canEdit, fileCount, onSelect, onMove }: {
  stage: WorkStage
  tasks: PreviewTask[]
  selectedId?: string
  canEdit: boolean
  fileCount: (taskId: string) => number
  onSelect: (taskId: string) => void
  onMove: (taskId: string, stage: WorkStage) => void
}) {
  const [over, setOver] = useState(false)
  return (
    <section
      className="studio-kanban-column"
      data-drop-target={over}
      aria-label={`${stage} tasks`}
      onDragOver={event => {
        if (!canEdit || !event.dataTransfer.types.includes(TASK_DRAG_TYPE)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false) }}
      onDrop={event => {
        setOver(false)
        if (!canEdit) return
        event.preventDefault()
        const taskId = event.dataTransfer.getData(TASK_DRAG_TYPE)
        if (taskId) onMove(taskId, stage)
      }}
    >
      <header className="studio-kanban-column-header"><h2>{stage}</h2><p>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</p></header>
      <div className="studio-kanban-column-body">
        {tasks.map(task => <TaskCard key={task.id} task={task} selected={selectedId === task.id} canEdit={canEdit} fileCount={fileCount(task.id)} onSelect={() => onSelect(task.id)} />)}
        {!tasks.length && <p className="studio-kanban-empty">No matching sample tasks.</p>}
      </div>
    </section>
  )
}
