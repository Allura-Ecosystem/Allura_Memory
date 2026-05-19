import { AuditEventRecord } from './query-builder';

/**
 * AuditEventExport — Story 7.7 frozen interface for export/transfer
 * This is a superset of the database schema; missing fields are filled with sensible defaults
 */
export interface AuditEventExport {
  id: string;
  group_id: string;
  actor_id: string;
  actor_type: 'agent' | 'user' | 'system' | 'unknown';
  resource?: string;
  action?: string;
  before?: unknown;
  after?: unknown;
  evidence_ids: string[];
  policy_decision_id?: string;
  approval_decision_id?: string;
  timestamp: string;
  hash?: string;
  prev_hash?: string;
}

/**
 * Event type → action mapping
 * Derives the action from event_type prefix (memory_/user_/debug_/etc.)
 */
function deriveActionFromEventType(eventType: string): string | undefined {
  const mapping: Record<string, string> = {
    memory_add: 'create',
    memory_get: 'read',
    memory_list: 'read',
    memory_delete: 'delete',
    memory_promoted: 'promote',
    memory_restore: 'restore',
    memory_update: 'update',
    memory_search: 'search',
    memory_promote: 'request_promotion',
    promotion_failed: 'promotion_failed',
    proposal_approved: 'approve',
    proposal_created: 'create',
    notion_sync_pending: 'queue_sync',
    tool_approved: 'tool_approve',
    tool_denied: 'tool_deny',
    request_trace: 'trace',
    session_start: 'start',
    health_check: 'health_check',
    sync_contract: 'sync',
  };
  // Also handle debug: prefix events
  if (eventType.startsWith('debug:')) {
    return eventType.replace('debug:', '');
  }
  return mapping[eventType] || eventType;
}

/**
 * Event type → actor_type mapping
 * Derives actor_type from event_type (memory_* → agent, user_* → user, system events → system)
 */
function deriveActorTypeFromEventType(eventType: string): AuditEventExport['actor_type'] {
  if (eventType.startsWith('memory_') || eventType.startsWith('promotion_') || eventType.startsWith('neo4j_')) {
    return 'agent';
  }
  if (eventType.startsWith('user_') || eventType.startsWith('proposal_') || eventType.startsWith('notion_')) {
    return 'user';
  }
  if (eventType.startsWith('debug:') || eventType === 'health_check' || eventType === 'request_trace' || eventType === 'sync_contract') {
    return 'system';
  }
  if (eventType === 'tool_approved' || eventType === 'tool_denied') {
    return 'system';
  }
  // Fallback: unknown if we can't determine
  return 'unknown';
}

/**
 * Map database AuditEventRecord to exportable AuditEventExport
 * Handles missing story-fields with derived or "N/A" values per spec.
 */
export function mapEventToExport(record: AuditEventRecord): AuditEventExport {
  const metadata = (record.metadata as Record<string, unknown>) || {};

  // Determine actor_id — try metadata.actor_id first, fallback to agent_id
  const actor_id =
    typeof metadata.actor_id === 'string' ? metadata.actor_id : record.agent_id;

  // Determine actor_type — derive from event_type if not in metadata
  const actor_type = metadata.actor_type
    ? (metadata.actor_type as AuditEventExport['actor_type'])
    : deriveActorTypeFromEventType(record.event_type);

  // Determine resource — metadata.resource takes precedence
  const resource = typeof metadata.resource === 'string' ? metadata.resource : undefined;

  // Determine action — derive if not in metadata
  const action = metadata.action
    ? String(metadata.action)
    : deriveActionFromEventType(record.event_type);

  // Evidence IDs — may be in metadata or empty array
  const evidence_ids: string[] =
    Array.isArray(metadata.evidence_ids)
      ? metadata.evidence_ids.filter((e) => typeof e === 'string')
      : [];

  // policy_decision_id and approval_decision_id — may be in metadata
  const policy_decision_id =
    typeof metadata.policy_decision_id === 'string' ? metadata.policy_decision_id : undefined;
  const approval_decision_id =
    typeof metadata.approval_decision_id === 'string' ? metadata.approval_decision_id : undefined;

  // before/after — may be in metadata, otherwise N/A
  const before = metadata.before ?? 'N/A (not captured)';
  const after = metadata.after ?? 'N/A (not captured)';

  // hash/prev_hash — not in current schema, always N/A per spec
  const hash: string | undefined = metadata.hash ? String(metadata.hash) : undefined;
  const prev_hash: string | undefined = metadata.prev_hash ? String(metadata.prev_hash) : undefined;

  // timestamp — cast postgres timestamp to ISO string
  const timestamp = new Date(record.created_at).toISOString();

  return {
    id: String(record.id),
    group_id: record.group_id,
    actor_id,
    actor_type,
    resource,
    action,
    before,
    after,
    evidence_ids,
    policy_decision_id,
    approval_decision_id,
    timestamp,
    hash,
    prev_hash,
  };
}

/**
 * Export format union type
 */
export type ExportFormat = 'markdown' | 'json' | 'csv';

/**
 * Render AuditEventExport as Markdown following Story 7.7 template convention
 */
export function renderMarkdownExport(exported: AuditEventExport): string {
  const fields: { label: string; value: string; condition?: boolean }[] = [
    { label: 'Type', value: 'AuditEvent' },
    { label: 'Tenant (group_id)', value: exported.group_id },
    { label: 'Exported at', value: new Date().toISOString() },
    { label: 'Record ID', value: exported.id },
  ];

  const provenance: { label: string; value: string; condition?: boolean }[] = [
    { label: 'Actor', value: `${exported.actor_id} (${exported.actor_type})` },
    { label: 'Timestamp', value: exported.timestamp },
    ...(exported.resource ? [{ label: 'Source / Resource', value: exported.resource }] : []),
    ...(exported.action ? [{ label: 'Action', value: exported.action }] : []),
    ...(exported.hash ? [{ label: 'Hash', value: exported.hash }] : []),
    ...(exported.prev_hash ? [{ label: 'Previous Hash', value: exported.prev_hash }] : []),
    // before/after shown in Content section, not provenance
  ];

  const contentLines: string[] = [];

  if (typeof exported.before === 'string' && typeof exported.after === 'string') {
    if (exported.before === 'N/A (not captured)' && exported.after === 'N/A (not captured)') {
      contentLines.push('- before: N/A (not captured by database schema)');
      contentLines.push('- after: N/A (not captured by database schema)');
    } else {
      contentLines.push('- before:', exported.before);
      contentLines.push('- after:', exported.after);
    }
  } else {
    contentLines.push('- before:', String(exported.before));
    contentLines.push('- after:', String(exported.after));
  }

  const evidenceLines = exported.evidence_ids.length
    ? exported.evidence_ids.map((id) => `- ${id}`)
    : ['- No evidence IDs captured'];

  const relatedLines: string[] = [];
  if (exported.policy_decision_id) {
    relatedLines.push(`- **Policy Decision:** \`${exported.policy_decision_id}\``);
  }
  if (exported.approval_decision_id) {
    relatedLines.push(`- **Approval Decision:** \`${exported.approval_decision_id}\``);
  }

  return [
    '# Allura Record Export',
    '',
    `**Type:** ${fields[0].value}`,
    `**Tenant (group_id):** \`${exported.group_id}\``,
    `**Exported at:** \`${fields[3].value}\``,
    `**Record ID:** \`${exported.id}\``,
    '',
    '## Provenance',
    '',
    ...provenance.map((f) => `- **${f.label}:** ${f.value}`),
    '',
    '## Content',
    '',
    ...contentLines,
    '',
    '## Evidence',
    '',
    ...evidenceLines,
    '',
    ...(relatedLines.length ? ['## Related', '', ...relatedLines] : []),
  ].join('\n');
}

/**
 * Export error types
 */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}
