import { describe, expect, it } from 'vitest'
import { buildConnectionsGraph, type ConnectionsInput, filterConnectionsGraph } from './connections-graph-model'

function sample(): ConnectionsInput {
  return {
    people: [{ id: 'person-1', name: 'Avery', title: 'Editor', bio: 'Sample profile', status: 'Active', role: 'Editor' }],
    files: [{ id: 'shared-id', name: 'Handbook', owner: 'Avery', workspace: 'Company Knowledge', version: 3, content: 'Sample guidance', source: 'Fictional file' }],
    tasks: [{ id: 'shared-id', title: 'Review handbook', assignee: 'Avery', workspace: 'Company Knowledge', stage: 'To do', href: '#files?file=shared-id', related: 'Handbook' }],
    links: [{ fileId: 'shared-id', taskId: 'shared-id', fileVersion: 2 }],
    apps: [{ id: 'mortgage', name: 'Mortgage', owner: 'Avery', version: '1.1.0', enabled: true, href: '#mortgage', description: 'Sample app' }],
  }
}

describe('Connections derives only explicit shared sample relationships', () => {
  it('namespaces overlapping IDs and never creates dangling or duplicate attachment edges', () => {
    const input = sample()
    input.links.push({ ...input.links[0] }, { fileId: 'missing', taskId: 'shared-id', fileVersion: 1 })
    const graph = buildConnectionsGraph(input)
    expect(new Set(graph.nodes.map(node => node.id)).size).toBe(4)
    expect(graph.edges).toHaveLength(4)
    const ids = new Set(graph.nodes.map(node => node.id))
    expect(graph.edges.every(edge => ids.has(edge.source) && ids.has(edge.target))).toBe(true)
  })

  it('does not infer an app relationship from a shared owner, team or similar text', () => {
    const input = sample()
    input.tasks[0].title = 'Mortgage knowledge'
    input.tasks[0].href = '#mortgage-lookalike'
    const graph = buildConnectionsGraph(input)
    expect(graph.edges.some(edge => edge.source === 'file:shared-id' && edge.target === 'app:mortgage')).toBe(false)
    expect(graph.edges.some(edge => edge.label === 'Work from')).toBe(false)
  })

  it('refuses ambiguous name matches while preserving both people as visible records', () => {
    const input = sample()
    input.people.push({ ...input.people[0], id: 'person-2' })
    const graph = buildConnectionsGraph(input)
    expect(graph.nodes.filter(node => node.kind === 'person')).toHaveLength(2)
    expect(graph.edges.map(edge => edge.label)).toEqual(['Linked to task'])
  })

  it('reflects rename, unlink, disabled app and paused person without changing captured evidence', () => {
    const input = sample()
    const before = buildConnectionsGraph(input)
    input.files[0].name = 'Updated handbook'
    input.links = []
    input.apps[0].enabled = false
    input.people[0].status = 'Paused'
    const after = buildConnectionsGraph(input)
    expect(after.nodes.find(node => node.id === 'file:shared-id')?.label).toBe('Updated handbook')
    expect(after.edges).toHaveLength(before.edges.length - 1)
    expect(after.nodes.find(node => node.id === 'app:mortgage')?.facts).toContainEqual({ label: 'Availability', value: 'Disabled in preview' })
    expect(after.nodes.find(node => node.id === 'person:person-1')?.facts).toContainEqual({ label: 'Status', value: 'Paused' })
    expect(before.edges.find(edge => edge.label === 'Linked to task')?.evidence).toContain('file version 2')
  })

  it('keeps task capture version and source text distinct from current app version', () => {
    const input = sample()
    input.tasks[0].href = '#mortgage?document=case-1&revision=2'
    input.tasks[0].sourceVersion = 2
    input.tasks[0].sourceSnapshot = 'Captured case text'
    const graph = buildConnectionsGraph(input)
    const task = graph.nodes.find(node => node.kind === 'task')!
    expect(task.facts).toContainEqual({ label: 'Captured source version', value: '2' })
    expect(task.facts).toContainEqual({ label: 'Captured source details', value: 'Captured case text' })
    expect(task.facts.some(fact => fact.value === '1.1.0')).toBe(false)
    expect(graph.nodes.find(node => node.kind === 'app')?.facts).toContainEqual({ label: 'Current app version', value: '1.1.0' })
    expect(graph.edges.find(edge => edge.label === 'Work from')?.target).toBe('app:mortgage')
  })

  it('filters visible endpoints without losing isolated records or inventing neighbors', () => {
    const input = sample()
    input.people.push({ ...input.people[0], id: 'isolated', name: 'Robin' })
    const graph = buildConnectionsGraph(input)
    const lonely = filterConnectionsGraph(graph, { selectedId: 'person:isolated', neighborhood: true })
    expect(lonely.nodes.map(node => node.id)).toEqual(['person:isolated'])
    expect(lonely.edges).toEqual([])
    const files = filterConnectionsGraph(graph, { kind: 'file' })
    expect(files.nodes).toHaveLength(1)
    expect(files.edges).toEqual([])
    expect(filterConnectionsGraph(graph, { query: '  handbook  ' }).nodes).toHaveLength(2)
  })
})

describe('Company and contact scorecards', () => {
  it('creates only declared company-owner and contact-company relationships', () => {
    const input = sample()
    input.people.push({ id: 'gabriel', name: 'Gabriel', title: 'Chief Operating Officer (COO)', bio: 'Fictional colleague', status: 'Active', role: 'Reader', email: 'gabriel@example.test' })
    input.vendors = [{ id: 'vendor-1', name: 'Sample company', ownerId: 'gabriel', email: 'hello@example.test', phone: '', website: 'company.example.test', description: 'Fictional vendor' }]
    input.contacts = [{ id: 'contact-1', name: 'Contact example', vendorId: 'vendor-1', title: 'Account contact', email: 'contact@example.test', phone: '' }]
    const graph = buildConnectionsGraph(input)
    expect(graph.edges.find(edge => edge.label === 'Relationship owner')).toMatchObject({ source: 'vendor:vendor-1', target: 'person:gabriel' })
    expect(graph.edges.find(edge => edge.label === 'Contact at')).toMatchObject({ source: 'contact:contact-1', target: 'vendor:vendor-1' })
    expect(graph.edges.some(edge => edge.source === 'contact:contact-1' && edge.target === 'person:gabriel')).toBe(false)
    const person = graph.nodes.find(node => node.id === 'person:gabriel')!
    expect(person.facts).toContainEqual({ label: 'Sample role', value: 'Reader' })
    expect(person.facts).toContainEqual({ label: 'Job title', value: 'Chief Operating Officer (COO)' })
    const contact = graph.nodes.find(node => node.id === 'contact:contact-1')!
    expect(contact.facts).toContainEqual({ label: 'Phone', value: 'Not provided' })
    expect(contact.facts).toContainEqual({ label: 'Email', value: 'contact@example.test' })
    expect(contact.href).toBe('#vendors?contact=contact-1')
    expect(graph.nodes.some(node => node.facts.some(fact => /score|rating/i.test(fact.label)))).toBe(false)
  })
  it('does not infer a company link from a matching name or unknown foreign key', () => {
    const input = sample()
    input.vendors = [{ id: 'vendor-1', name: 'Avery', ownerId: 'missing', email: '', phone: '', website: '', description: 'Fictional vendor' }]
    input.contacts = [{ id: 'contact-1', name: 'Avery', vendorId: 'missing', title: '', email: '', phone: '' }]
    const graph = buildConnectionsGraph(input)
    expect(graph.edges.some(edge => edge.source.startsWith('vendor:') || edge.source.startsWith('contact:'))).toBe(false)
    expect(graph.nodes.filter(node => node.kind === 'vendor' || node.kind === 'contact')).toHaveLength(2)
  })
})

describe('Exact relationship depth', () => {
  it('shows Gabriel → company → contact without inventing a Gabriel → contact shortcut', () => {
    const input = sample()
    input.people.push({ id: 'gabriel', name: 'Gabriel', title: 'COO', bio: 'Sample', status: 'Active', role: 'Reader' })
    input.vendors = [{ id: 'company', name: 'Company', ownerId: 'gabriel', email: '', phone: '', website: '', description: 'Sample' }]
    input.contacts = [{ id: 'contact', name: 'Contact', vendorId: 'company', title: '', email: '', phone: '' }]
    const graph = buildConnectionsGraph(input)
    const direct = filterConnectionsGraph(graph, { selectedId: 'person:gabriel', hops: 1 })
    const further = filterConnectionsGraph(graph, { selectedId: 'person:gabriel', hops: 2 })
    expect(direct.nodes.map(node => node.id).sort()).toEqual(['person:gabriel', 'vendor:company'])
    expect(further.nodes.map(node => node.id).sort()).toEqual(['contact:contact', 'person:gabriel', 'vendor:company'])
    expect(direct.edges).toHaveLength(1)
    expect(further.edges).toHaveLength(2)
    expect(further.edges.some(edge => [edge.source, edge.target].includes('person:gabriel') && [edge.source, edge.target].includes('contact:contact'))).toBe(false)
    expect(filterConnectionsGraph(graph, { selectedId: 'person:gabriel', hops: 0 }).nodes).toHaveLength(graph.nodes.length)
  })
})
