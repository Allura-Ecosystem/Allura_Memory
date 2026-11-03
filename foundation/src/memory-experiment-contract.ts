import { createHash } from 'node:crypto';
import { validScope, type Scope } from './authority.ts';

/** Local engineering ceilings, not product SLOs or approved production policy. */
export const experimentLimits = Object.freeze({
  branches: 8, records: 128, bytes: 131072, contentBytes: 12000,
  checkpoints: 4, operations: 128, defaultTtlMs: 900000, maxTtlMs: 3600000,
});
export class ExperimentError extends Error {
  constructor(public readonly code: 'invalid' | 'not_found' | 'conflict' | 'quota' | 'expired' | 'quarantined' | 'disposed' | 'busy' | 'unavailable') {
    super(code); this.name = 'ExperimentError';
  }
}
export type ExperimentRecord = Readonly<{
  scope: Scope; memoryId: string; knowledgeId: string; version: string;
  content: string; evidenceIds: readonly string[];
}>;
export type BaseSnapshot = Readonly<{
  schema: 'memory-experiment-base-v1'; snapshotId: string; scope: Scope;
  records: readonly ExperimentRecord[];
}>;
export function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) { throw new ExperimentError('invalid'); }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(k => !Object.hasOwn(descriptors, k)) ||
      Object.values(descriptors).some(d => !Object.hasOwn(d, 'value') || !d.enumerable)) { throw new ExperimentError('invalid'); }
  return Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]));
}
export function boundedArray(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max ||
      Reflect.ownKeys(value).length !== value.length + 1 || Object.getPrototypeOf(value) !== Array.prototype) { throw new ExperimentError('invalid'); }
  return Array.from({ length: value.length }, (_, i) => {
    const property = Object.getOwnPropertyDescriptor(value, String(i));
    if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) { throw new ExperimentError('invalid'); }
    return property.value;
  });
}
export function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > max ||
      /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) { throw new ExperimentError('invalid'); }
  return value;
}
export function experimentId(value: unknown): string {
  const text = boundedText(value, 128);
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(text)) { throw new ExperimentError('invalid'); }
  return text;
}
export function memoryId(value: unknown): string {
  if (typeof value !== 'string' || !validScope({ groupId: 'allura-validation', workspaceId: value })) { throw new ExperimentError('invalid'); }
  // UUID case is rejected rather than silently normalized: exact tokens are retained.
  if (value !== value.toLowerCase()) { throw new ExperimentError('invalid'); }
  return value;
}
export function parseScope(value: unknown): Scope {
  const input = exactObject(value, ['groupId', 'workspaceId']);
  if (typeof input.groupId !== 'string' || !validScope(input as Scope)) { throw new ExperimentError('invalid'); }
  return Object.freeze({ groupId: input.groupId, workspaceId: memoryId(input.workspaceId) });
}
export const sameScope = (a: Scope, b: Scope): boolean => a.groupId === b.groupId && a.workspaceId === b.workspaceId;
export function parseRecord(value: unknown, scope: Scope): ExperimentRecord {
  const row = exactObject(value, ['scope', 'memoryId', 'knowledgeId', 'version', 'content', 'evidenceIds']);
  const rowScope = parseScope(row.scope);
  if (!sameScope(rowScope, scope)) { throw new ExperimentError('not_found'); }
  if (typeof row.version !== 'string' || !/^[1-9][0-9]{0,9}$/.test(row.version) || Number(row.version) >= 2147483647 ||
      !Array.isArray(row.evidenceIds) || row.evidenceIds.length < 1 || row.evidenceIds.length > 31) { throw new ExperimentError('invalid'); }
  const evidence = boundedArray(row.evidenceIds, 1, 31).map(memoryId).sort();
  if (new Set(evidence).size !== evidence.length) { throw new ExperimentError('invalid'); }
  return Object.freeze({ scope: rowScope, memoryId: memoryId(row.memoryId), knowledgeId: memoryId(row.knowledgeId),
    version: row.version, content: boundedText(row.content, experimentLimits.contentBytes), evidenceIds: Object.freeze(evidence) });
}
export function parseSnapshot(value: unknown, expectedScope: Scope): BaseSnapshot {
  const input = exactObject(value, ['schema', 'snapshotId', 'scope', 'records']);
  const scope = parseScope(input.scope);
  if (!sameScope(scope, parseScope(expectedScope))) { throw new ExperimentError('not_found'); }
  if (input.schema !== 'memory-experiment-base-v1' || !Array.isArray(input.records) || input.records.length > experimentLimits.records) { throw new ExperimentError('invalid'); }
  const records = boundedArray(input.records, 0, experimentLimits.records).map(row => parseRecord(row, scope)).sort((a, b) => a.memoryId < b.memoryId ? -1 : a.memoryId > b.memoryId ? 1 : 0);
  if (new Set(records.map(r => r.memoryId)).size !== records.length || new Set(records.map(r => r.knowledgeId)).size !== records.length) { throw new ExperimentError('invalid'); }
  const result: BaseSnapshot = Object.freeze({ schema: 'memory-experiment-base-v1', snapshotId: experimentId(input.snapshotId), scope, records: Object.freeze(records) });
  if (Buffer.byteLength(JSON.stringify(result)) > experimentLimits.bytes) { throw new ExperimentError('quota'); }
  return result;
}
export function snapshotDigest(snapshot: BaseSnapshot): string {
  const value = parseSnapshot(snapshot, snapshot.scope);
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
