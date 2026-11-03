import { describe, expect, it } from 'vitest'
import { reconcileForceData } from './connections-force-model'
import type { buildConnectionsGraph } from './connections-graph-model'

function graph(): ReturnType<typeof buildConnectionsGraph> {
  return {
    nodes: [{ id: 'person:gabriel', recordId: 'gabriel', kind: 'person', label: 'Gabriel', href: '#profile?person=gabriel', description: 'Sample', facts: [{ label: 'Job title', value: 'COO' }] }, { id: 'vendor:one', recordId: 'one', kind: 'vendor', label: 'Company', href: '#vendors?vendor=one', description: 'Sample', facts: [] }],
    edges: [{ id: 'owner', source: 'vendor:one', target: 'person:gabriel', label: 'Relationship owner', evidence: 'Explicit sample owner', href: '#vendors?vendor=one' }],
  }
}
describe('Force renderer mutation boundary', () => {
  it('isolates engine position and endpoint mutations from canonical graph records', () => {
    const model = graph()
    const before = JSON.stringify(model)
    const renderer = reconcileForceData(model)
    renderer.nodes[0].x = 123; renderer.nodes[0].vx = 7
    renderer.links[0].source = renderer.nodes[1]; renderer.links[0].target = renderer.nodes[0]
    expect(JSON.stringify(model)).toBe(before)
    expect(model.edges[0].source).toBe('vendor:one')
    expect(renderer.nodes[0]).not.toBe(model.nodes[0])
    expect(renderer.links[0]).not.toBe(model.edges[0])
  })
  it('retains mutable positions and graphData identity during record text changes', () => {
    const model = graph()
    const first = reconcileForceData(model)
    first.nodes[0].x = 42; first.nodes[0].y = -12; first.nodes[0].z = 9
    model.nodes[0].label = 'Updated sample label'
    model.nodes[0].facts[0].value = 'Operations lead'
    const next = reconcileForceData(model, first)
    expect(next).toBe(first)
    expect(next.nodes[0]).toMatchObject({ label: 'Updated sample label', x: 42, y: -12, z: 9 })
  })
  it('reconciles topology while retaining existing node identity and only explicit edges', () => {
    const model = graph()
    const first = reconcileForceData(model)
    first.nodes[0].x = 42
    model.edges = []
    const next = reconcileForceData(model, first)
    expect(next).not.toBe(first)
    expect(next.links).toEqual([])
    expect(next.nodes[0]).toBe(first.nodes[0])
    expect(next.nodes[0].x).toBe(42)
  })
})
