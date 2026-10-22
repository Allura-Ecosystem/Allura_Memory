import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react'
import { useOrganization } from './organization-state'

export const WORK_STAGES = ['To do', 'In progress', 'In review', 'Done'] as const
export type WorkStage = typeof WORK_STAGES[number]
export const WORK_ASSIGNEES = ['Alex Morgan', 'Jordan Lee', 'Sam Rivera', 'Taylor Chen']
export const WORK_WORKSPACES = ['Company Knowledge', 'HR', 'Marketing', 'IT', 'Sales', 'Mortgage']
export interface PreviewTask {
  sourceSnapshot?: string; sourceVersion?: number
  id: string; title: string; workspace: string; assignee: string; stage: WorkStage
  related: string; href: string; dueDate: string; author: string; controlId?: string
  reviewRequired: boolean; reviewDecision: 'Pending' | 'Approved' | 'Changes requested'
  reviewer: string | null; reviewRationale: string
  checklist: { id: string; text: string; checked: boolean }[]
  history: string[]
}
export interface NewPreviewTask {
  sourceSnapshot?: string; sourceVersion?: number
  title: string; workspace: string; assignee: string; related?: string; href?: string; controlId?: string
}
function seedTasks(): PreviewTask[] {
  return [
    { title: 'Clarify handbook onboarding', workspace: 'Company Knowledge', assignee: 'Alex Morgan', stage: 'To do', related: 'Sample handbook proposal', href: '#review' },
    { title: 'Review workspace membership evidence', workspace: 'HR', assignee: 'Jordan Lee', stage: 'In progress', related: 'Sample access review control', href: '#trust?control=CTRL-01', controlId: 'CTRL-01' },
    { title: 'Check campaign source attribution', workspace: 'Marketing', assignee: 'Sam Rivera', stage: 'In review', related: 'Sample campaign memory', href: '#memories' },
    { title: 'Draft restoration exercise checklist', workspace: 'IT', assignee: 'Taylor Chen', stage: 'To do', related: 'Sample recovery control', href: '#trust?control=CTRL-05', controlId: 'CTRL-05' },
    { title: 'Prepare sales onboarding draft', workspace: 'Sales', assignee: 'Alex Morgan', stage: 'Done', related: 'Sample sales onboarding memory', href: '#memories' },
  ].map((item, index) => ({ ...item, stage: item.stage as WorkStage, id: `WORK-${String(index + 1).padStart(3, '0')}`, dueDate: '', author: item.assignee, reviewRequired: index !== 4, reviewDecision: 'Pending', reviewer: null, reviewRationale: '', checklist: [{ id: 'source', text: 'Inspect the relevant sample source', checked: index === 4 }, { id: 'evidence', text: 'Describe the evidence needed for review', checked: index === 4 }], history: ['Starting fictional task. No live work item exists.'] }))
}
interface WorkContextValue {
  resetEpoch: number
  assignees: string[]
  workspaces: string[]
  reviewersForTask: (task: PreviewTask) => string[]
  touchTaskEvidence: (id: string, reason: string) => void
  tasks: PreviewTask[]
  addTask: (input: NewPreviewTask) => string
  editTask: (id: string, input: { title: string; assignee: string; dueDate: string }) => void
  moveTask: (id: string, stage: WorkStage) => string | null
  toggleChecklist: (id: string, checkId: string) => void
  reviewTask: (id: string, reviewer: string, decision: 'Approved' | 'Changes requested', rationale: string) => string | null
  reset: () => void
}
const WorkContext = createContext<WorkContextValue | null>(null)
export function PreviewWorkProvider({ children }: { children: ReactNode }): React.ReactElement {
  const organization = useOrganization()
  const [tasks, setTasks] = useState<PreviewTask[]>(seedTasks)
  const [resetEpoch, setResetEpoch] = useState(0)
  const nextId = useRef(6)
  const assignees = useMemo(() => organization.people.filter(person => person.status === 'Active').map(person => person.name), [organization.people])
  const workspaces = useMemo(() => [...new Set([...organization.teams.map(team => team.name), 'Mortgage'])], [organization.teams])
  function reviewersForTask(task: PreviewTask) {
    const team = organization.teams.find(item => item.name === task.workspace)
    if (!team) return []
    return organization.people.filter(person => person.status === 'Active' && (person.role === 'Reviewer' || person.role === 'Administrator') && person.teamIds.includes(team.id) && person.name !== task.author && person.name !== task.assignee).map(person => person.name)
  }
  function change(id: string, transform: (task: PreviewTask) => PreviewTask) { setTasks(items => items.map(task => task.id === id ? transform(task) : task)) }
  function touchTaskEvidence(id: string, reason: string) {
    change(id, task => ({ ...task, reviewDecision: 'Pending', reviewer: null, reviewRationale: '', stage: task.stage === 'Done' && task.reviewRequired ? 'In review' : task.stage, history: [...task.history, `${reason} Any earlier sample review must be repeated.`] }))
  }
  function addTask(input: NewPreviewTask) {
    if (input.controlId) { const existing = tasks.find(task => task.controlId === input.controlId); if (existing) return existing.id }
    const id = `WORK-${String(nextId.current++).padStart(3, '0')}`
    const task: PreviewTask = { ...input, id, title: input.title.trim(), stage: 'To do', dueDate: '', author: input.assignee, related: input.related || 'Local sample task', href: input.href || '#overview', reviewRequired: true, reviewDecision: 'Pending', reviewer: null, reviewRationale: '', checklist: [{ id: 'scope', text: 'Describe the bounded task and evidence', checked: false }, { id: 'review', text: 'Prepare the sample for independent review', checked: false }], history: ['Created locally in To do. No person was notified.'] }
    setTasks(items => [...items, task]); return id
  }
  function editTask(id: string, input: { title: string; assignee: string; dueDate: string }) {
    change(id, task => ({ ...task, ...input, title: input.title.trim(), reviewDecision: 'Pending', reviewer: null, reviewRationale: '', stage: task.stage === 'Done' && task.reviewRequired ? 'In review' : task.stage, history: [...task.history, `Edited title, owner, or due date locally. Any previous sample review must be repeated.`] }))
  }
  function moveTask(id: string, stage: WorkStage) {
    const task = tasks.find(item => item.id === id)
    if (!task) return 'Choose an existing sample task.'
    if (stage === 'Done' && task.reviewRequired && task.reviewDecision !== 'Approved') return 'This task needs an independent fictional reviewer decision before Done. Use the sample review section below.'
    if (stage !== task.stage) change(id, item => ({ ...item, stage, history: [...item.history, `${item.stage} → ${stage}. Local demonstration only.`] }))
    return null
  }
  function toggleChecklist(id: string, checkId: string) {
    change(id, task => ({ ...task, checklist: task.checklist.map(check => check.id === checkId ? { ...check, checked: !check.checked } : check), reviewDecision: 'Pending', reviewer: null, reviewRationale: '', stage: task.stage === 'Done' && task.reviewRequired ? 'In review' : task.stage, history: [...task.history, 'Checklist changed locally; sample review reset to Pending.'] }))
  }
  function reviewTask(id: string, reviewer: string, decision: 'Approved' | 'Changes requested', rationale: string) {
    const task = tasks.find(item => item.id === id)
    if (!task) return 'Choose an existing sample task.'
    if (!assignees.includes(reviewer)) return 'Choose an active fictional reviewer.'
    if (reviewer === task.author || reviewer === task.assignee) return 'Choose a reviewer different from the sample author and current assignee.'
    if (!reviewersForTask(task).includes(reviewer)) return 'This example needs an active Reviewer or Administrator with explicit membership in the task’s team. Adjust the sample in People & teams.'
    if (rationale.trim().length < 3) return 'Enter a sample review rationale with at least 3 characters.'
    change(id, item => ({ ...item, reviewer, reviewDecision: decision, reviewRationale: rationale.trim(), stage: decision === 'Changes requested' ? 'In progress' : item.stage, history: [...item.history, `${reviewer}: ${decision} — ${rationale.trim()} (fictional decision; no live approval).`] }))
    return null
  }
  return <WorkContext.Provider value={{ tasks, assignees, workspaces, reviewersForTask, resetEpoch, touchTaskEvidence, addTask, editTask, moveTask, toggleChecklist, reviewTask, reset: () => { setTasks(seedTasks()); nextId.current = 6; setResetEpoch(epoch => epoch + 1) } }}>{children}</WorkContext.Provider>
}
export function usePreviewWork(): WorkContextValue {
  const value = useContext(WorkContext)
  if (!value) throw new Error('PreviewWorkProvider must wrap the HTML preview.')
  return value
}
