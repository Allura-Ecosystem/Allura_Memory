import type { PreviewFile, PreviewFileLink } from './files-state'
import type { OrganizationContact, OrganizationPerson, OrganizationVendor } from './organization-state'
import type { PreviewTask } from './preview-work-state'

export type ConnectionKind = 'file' | 'task' | 'person' | 'app' | 'vendor' | 'contact'
export interface ConnectionApp {
  id: string; name: string; owner: string; version: string; enabled: boolean; href: string; description: string
}
export interface ConnectionNode {
  id: string; recordId: string; kind: ConnectionKind; label: string; href: string
  description: string; facts: { label: string; value: string }[]
}
export interface ConnectionEdge {
  id: string; source: string; target: string; label: string; evidence: string; href: string
}
export interface ConnectionsInput {
  files: Pick<PreviewFile, 'id' | 'name' | 'owner' | 'workspace' | 'version' | 'content' | 'source'>[]
  links: PreviewFileLink[]
  tasks: Pick<PreviewTask, 'id' | 'title' | 'assignee' | 'workspace' | 'stage' | 'href' | 'related' | 'sourceVersion' | 'sourceSnapshot'>[]
  people: (Pick<OrganizationPerson, 'id' | 'name' | 'title' | 'bio' | 'status' | 'role'> & Partial<Pick<OrganizationPerson, 'email'>>)[]
  vendors?: OrganizationVendor[]
  contacts?: OrganizationContact[]
  apps: ConnectionApp[]
}
const recordId = (kind: ConnectionKind, id: string) => `${kind}:${id}`
const fileHref = (id: string) => `#files?file=${encodeURIComponent(id)}`
const taskHref = (id: string) => `#work?task=${encodeURIComponent(id)}`
const route = (href: string) => href.split('?')[0]

/** A read-only projection of current preview state. Same-team membership is not a relationship. */
export function buildConnectionsGraph({ files, links, tasks, people, apps, vendors = [], contacts = [] }: ConnectionsInput) {
  const nodes: ConnectionNode[] = [
    ...files.map(file => ({
      id: recordId('file', file.id), recordId: file.id, kind: 'file' as const, label: file.name,
      href: fileHref(file.id), description: file.content,
      facts: [{ label: 'Owner', value: file.owner }, { label: 'Team', value: file.workspace }, { label: 'Current version', value: String(file.version) }, { label: 'Source', value: file.source }],
    })),
    ...tasks.map(task => ({
      id: recordId('task', task.id), recordId: task.id, kind: 'task' as const, label: task.title,
      href: taskHref(task.id), description: task.related,
      facts: [{ label: 'Assigned to', value: task.assignee }, { label: 'Team', value: task.workspace }, { label: 'Stage', value: task.stage }, ...(task.sourceVersion !== undefined ? [{ label: 'Captured source version', value: String(task.sourceVersion) }] : []), ...(task.sourceSnapshot ? [{ label: 'Captured source details', value: task.sourceSnapshot }] : [])],
    })),
    ...people.map(person => ({
      id: recordId('person', person.id), recordId: person.id, kind: 'person' as const, label: person.name,
      href: `#profile?person=${encodeURIComponent(person.id)}`, description: person.bio,
      facts: [{ label: 'Email', value: person.email || 'Not provided' }, { label: 'Phone', value: 'Not provided' }, { label: 'Job title', value: person.title }, { label: 'Sample role', value: person.role }, { label: 'Status', value: person.status }],
    })),
    ...vendors.map(vendor => ({
      id: recordId('vendor', vendor.id), recordId: vendor.id, kind: 'vendor' as const, label: vendor.name,
      href: `#vendors?vendor=${encodeURIComponent(vendor.id)}`, description: vendor.description,
      facts: [{ label: 'Email', value: vendor.email || 'Not provided' }, { label: 'Phone', value: vendor.phone || 'Not provided' }, { label: 'Website', value: vendor.website || 'Not provided' }],
    })),
    ...contacts.map(contact => ({
      id: recordId('contact', contact.id), recordId: contact.id, kind: 'contact' as const, label: contact.name,
      href: `#vendors?contact=${encodeURIComponent(contact.id)}`, description: 'Fictional vendor contact. Contact details are examples only.',
      facts: [{ label: 'Job title', value: contact.title }, { label: 'Email', value: contact.email || 'Not provided' }, { label: 'Phone', value: contact.phone || 'Not provided' }],
    })),
    ...apps.map(app => ({
      id: recordId('app', app.id), recordId: app.id, kind: 'app' as const, label: app.name,
      href: app.href, description: app.description,
      facts: [{ label: 'Owner', value: app.owner }, { label: 'Current app version', value: app.version }, { label: 'Availability', value: app.enabled ? 'Enabled in preview' : 'Disabled in preview' }],
    })),
  ]
  const nodeIds = new Set(nodes.map(node => node.id))
  const edges = new Map<string, ConnectionEdge>()
  function add(source: string, target: string, label: string, evidence: string, href: string) {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return
    const id = JSON.stringify([source, label, target])
    edges.set(id, { id, source, target, label, evidence, href })
  }
  // Name matching reflects these providers' explicit owner fields, never fuzzy identity inference.
  function personId(name: string) {
    const matches = people.filter(person => person.name === name)
    return matches.length === 1 ? recordId('person', matches[0].id) : ''
  }
  for (const file of files) add(recordId('file', file.id), personId(file.owner), 'Owned by', `File owner: ${file.owner}.`, fileHref(file.id))
  for (const task of tasks) {
    add(recordId('task', task.id), personId(task.assignee), 'Assigned to', `Task assignee: ${task.assignee}.`, taskHref(task.id))
    for (const app of apps) {
      if (['#mortgage', '#bumblebee'].includes(route(task.href)) && route(task.href) === route(app.href)) {
        add(recordId('task', task.id), recordId('app', app.id), 'Work from', `Task source links to ${task.href}.`, task.href)
      }
    }
  }
  for (const link of links) add(recordId('file', link.fileId), recordId('task', link.taskId), 'Linked to task', `Explicit file link captures file version ${link.fileVersion}.`, taskHref(link.taskId))
  for (const app of apps) add(recordId('app', app.id), personId(app.owner), 'Owned by', `App settings name ${app.owner} as owner.`, '#app-settings')
  for (const vendor of vendors) add(recordId('vendor', vendor.id), recordId('person', vendor.ownerId), 'Relationship owner', 'The sample vendor record names this person as relationship owner.', `#vendors?vendor=${encodeURIComponent(vendor.id)}`)
  for (const contact of contacts) add(recordId('contact', contact.id), recordId('vendor', contact.vendorId), 'Contact at', 'The sample contact record explicitly names this company.', `#vendors?contact=${encodeURIComponent(contact.id)}`)
  return { nodes, edges: [...edges.values()] }
}

export function filterConnectionsGraph(
  graph: ReturnType<typeof buildConnectionsGraph>,
  { query = '', kind = '', selectedId = '', neighborhood = false, hops }: { query?: string; kind?: ConnectionKind | ''; selectedId?: string; neighborhood?: boolean; hops?: 0 | 1 | 2 },
) {
  const selected = graph.nodes.some(node => node.id === selectedId)
  const neighbors = new Set([selectedId])
  const depth = hops ?? (neighborhood ? 1 : 0)
  if (depth && selected) {
    let frontier = new Set([selectedId])
    for (let step = 0; step < depth; step++) {
      const next = new Set<string>()
      for (const edge of graph.edges) {
        if (frontier.has(edge.source)) next.add(edge.target)
        if (frontier.has(edge.target)) next.add(edge.source)
      }
      next.forEach(id => neighbors.add(id)); frontier = next
    }
  }
  const search = query.trim().toLocaleLowerCase()
  const nodes = graph.nodes.filter(node => (!kind || node.kind === kind)
    && (!search || `${node.label} ${node.recordId} ${node.description} ${node.facts.map(fact => fact.value).join(' ')}`.toLocaleLowerCase().includes(search))
    && (!depth || !selected || neighbors.has(node.id)))
  const ids = new Set(nodes.map(node => node.id))
  return { nodes, edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) }
}
