// Adapted from Studio Base UI dashboard/kanban/_components/task-card.tsx (MIT).
// Retains the source article, title/description, owner/date and insight composition.
// Allura supplies real sample fields; unsupported priorities/comments were removed.
import { Avatar, AvatarFallback } from '@studio/components/ui/avatar'
import { Badge } from '@studio/components/ui/badge'
import { Separator } from '@studio/components/ui/separator'
import { CalendarDays, Paperclip } from 'lucide-react'
import type { PreviewTask } from '../../preview-work-state'

export const TASK_DRAG_TYPE = 'application/x-allura-preview-task'

export function TaskCard({ task, selected, fileCount, canEdit, onSelect }: {
  task: PreviewTask
  selected: boolean
  fileCount: number
  canEdit: boolean
  onSelect: () => void
}) {
  const initials = task.assignee.split(' ').map(part => part[0]).slice(0, 2).join('')
  return (
    <article
      className="studio-task-card"
      data-selected={selected}
      data-task-id={task.id}
      draggable={canEdit}
      onDragStart={event => {
        if (!canEdit) { event.preventDefault(); return }
        event.dataTransfer.setData(TASK_DRAG_TYPE, task.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
    >
      <div className="studio-task-heading">
        <h3><button type="button" aria-pressed={selected} onClick={onSelect} aria-label={`Open task ${task.id}: ${task.title}`}>{task.title}</button></h3>
        <p>{task.workspace}</p>
      </div>
      <div className="studio-task-owner-row">
        <div className="studio-task-owner">
          <Avatar aria-hidden="true"><AvatarFallback>{initials}</AvatarFallback></Avatar>
          <span>{task.assignee}</span>
        </div>
        <span className="studio-task-date"><CalendarDays aria-hidden="true" />{task.dueDate || 'No due date'}</span>
      </div>
      <Separator />
      <div className="studio-task-insights">
        <span><Paperclip aria-hidden="true" />{fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
        <Badge variant="outline">{task.reviewRequired ? `Review: ${task.reviewDecision}` : 'Draft · no review required'}</Badge>
      </div>
      <small>{task.id} · sample</small>
    </article>
  )
}
