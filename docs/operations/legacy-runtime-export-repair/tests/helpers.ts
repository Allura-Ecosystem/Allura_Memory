import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { vi } from 'vitest'
import { tenantQuery } from '../base/src/lib/db/tenant-transaction'
import { scopedExport, validateExportRequest } from '../candidate/src/mcp/canonical-tools/scoped-export'

// Compile the exact selected function declarations from the runtime-derived
// source, not hand-written wrapper equivalents. Avoid unrelated write-tool
// imports (dotenv, embeddings, etc.). The core exporter is imported normally.
export function extractFunctions(path: string, names: string[], dependencies: Record<string, unknown>) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text))
  if (selected.length !== names.length) throw new Error('missing source function')
  const code = selected.map(node => node.getText(ast).replace(/^export /, '')).join('\n')
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  return new Function(...Object.keys(dependencies), `${js}\nreturn {${names.join(',')}}`)(...Object.values(dependencies))
}

export const request = (extra: Record<string, unknown> = {}) => ({
  group_id: 'allura-test', scope: { group_id: 'allura-test', workspace_id: 'ws-a', agent_id: 'fixture-agent' }, ...extra,
}) as any

export function makeWrapper(pool: any) {
  const getConnections = vi.fn(async () => ({ pg: pool, neo4j: null }))
  const retired = vi.fn(() => { throw new Error('retired tenant-only graph operation: exportMemories') })
  const functions = extractFunctions('../candidate/src/mcp/canonical-tools.ts', ['tenantPgQuery', 'memory_export'], {
    tenantQuery, scopedExport, validateExportRequest,
    validateGroupId: (group: string) => { if (!/^allura-[a-z0-9_-]+$/.test(group)) throw new Error('invalid group'); return group },
    getConnections, getGraphBackend: () => 'ruvector', createGraphAdapter: retired,
  })
  return { ...functions, getConnections, retired }
}

export const row = (id = 'a', source = 'semantic') => ({
  id, source, content: `content-${id}`, score: 0.9, provenance: 'manual', user_id: 'fixture-agent',
  created_at: '2026-01-01T00:00:00.000Z', version: 2, tags: ['test'],
})
