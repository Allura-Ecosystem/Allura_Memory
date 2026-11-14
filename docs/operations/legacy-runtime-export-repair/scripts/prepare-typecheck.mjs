import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const source = fs.readFileSync(path.join(root, 'candidate/src/mcp/canonical-tools.ts'), 'utf8')
const ast = ts.createSourceFile('canonical-tools.ts', source, ts.ScriptTarget.Latest, true)
const names = ['tenantPgQuery', 'memory_export']
const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text))
if (selected.length !== names.length) throw new Error('source function not found')
const prefix = `// GENERATED from exact candidate functions. This is focused typecheck only, not the whole app.\n
import type { GroupId, MemoryExportRequest, MemoryExportResponse } from '../candidate/src/lib/memory/canonical-contracts'
import { scopedExport, validateExportRequest } from '../candidate/src/mcp/canonical-tools/scoped-export'
declare function getConnections(): Promise<{ pg: import('pg').Pool }>
declare function getGraphBackend(): string
declare function validateGroupId(groupId: GroupId): GroupId
declare function tenantQuery<T extends import('pg').QueryResultRow>(context: { tenantId: string; principalId: string; workspaceId?: string }, sql: string, values?: unknown[], pool?: import('pg').Pool): Promise<import('pg').QueryResult<T>>
`
fs.writeFileSync(path.join(root, 'evidence/wrapper-typecheck.ts'), prefix + selected.map(node => node.getText(ast)).join('\n\n') + '\n')
const results = []
for (const file of ['candidate/src/mcp/canonical-tools.ts', 'candidate/src/mcp/canonical-tools/scoped-export.ts']) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  const result = ts.transpileModule(text, { fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, isolatedModules: true } })
  const errors = result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error)
  results.push({ file, errors: errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')) })
}
fs.writeFileSync(path.join(root, 'evidence/syntax-results.json'), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify({ exact_functions_typechecked: names, syntax: results }, null, 2))
if (results.some(r => r.errors.length)) process.exitCode = 1
