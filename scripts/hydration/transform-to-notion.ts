// scripts/hydration/transform-to-notion.ts
// Property transformation layer for Notion schemas

import { DEFAULT_NOTION_GROUP_ID } from './agent-identity';


/**
 * Transform date to Notion date format
 */
export function toNotionDate(date: Date | string | undefined): { date: { start: string } } | null {
  if (!date) return null;

  const dateStr = typeof date === 'string' ? date : date.toISOString();
  return { date: { start: dateStr } };
}

/**
 * Transform multi-select array to Notion format
 */
export function toNotionMultiSelect(items: string[]): { multi_select: Array<{ name: string }> } {
  return {
    multi_select: items.map(item => ({ name: item })),
  };
}

/**
 * Transform select value to Notion format
 */
export function toNotionSelect(value: string): { select: { name: string } } {
  return { select: { name: value } };
}

/**
 * Transform relation IDs to Notion format
 */
export function toNotionRelation(ids: string | string[]): { relation: Array<{ id: string }> } {
  const idArray = Array.isArray(ids) ? ids : [ids];
  return {
    relation: idArray.map(id => ({ id })),
  };
}

/**
 * Transform text to Notion rich_text format
 */
export function toNotionText(text: string): { rich_text: Array<{ text: { content: string } }> } {
  return {
    rich_text: [{ text: { content: text.substring(0, 2000) } }], // Notion limit
  };
}

/**
 * Transform title to Notion title format
 */
export function toNotionTitle(title: string): { title: Array<{ text: { content: string } }> } {
  return {
    title: [{ text: { content: title.substring(0, 100) } }], // Notion limit
  };
}

/**
 * Transform Task object to Notion properties
 */
export function transformTaskToNotion(
  task: {
    name: string;
    status: string;
    priority: string;
    type: string;
    tags?: string[];
    projectId?: string;
    frameworkIds?: string[];
    dueDate?: string;
  }
): Record<string, unknown> {
  return {
    Name: toNotionTitle(task.name),
    Status: toNotionSelect(task.status),
    Priority: toNotionSelect(task.priority),
    Type: toNotionSelect(task.type),
    Tags: task.tags ? toNotionMultiSelect(task.tags) : { multi_select: [] },
    Project: task.projectId ? toNotionRelation(task.projectId) : { relation: [] },
    Framework: task.frameworkIds ? toNotionRelation(task.frameworkIds) : { relation: [] },
    'Due Date': task.dueDate ? toNotionDate(task.dueDate) : null,
  };
}

/**
 * Transform Agent object to Notion properties
 */
export function transformAgentToNotion(
  agent: {
    name: string;
    type: 'OpenAgent' | 'Specialist' | 'Worker';
    status: 'active' | 'idle' | 'error' | 'deprecated';
    role: string;
    groupId?: string;
    skills?: string[];
    tokenBudget?: number;
    usdBudget?: number;
    lastHeartbeat?: string;
  }
): Record<string, unknown> {
  return {
    Name: toNotionTitle(agent.name),
    Type: toNotionSelect(agent.type),
    Status: toNotionSelect(agent.status),
    Role: toNotionText(agent.role),
    'Group ID': toNotionText(agent.groupId || DEFAULT_NOTION_GROUP_ID),
    Skills: agent.skills ? toNotionMultiSelect(agent.skills) : { multi_select: [] },
    'Token Budget': { number: agent.tokenBudget || 100000 },
    'USD Budget': { number: agent.usdBudget || 0 },
    'Last Heartbeat': agent.lastHeartbeat ? toNotionDate(agent.lastHeartbeat) : null,
  };
}

/**
 * Transform Skill object to Notion properties
 */
export function transformSkillToNotion(
  skill: {
    name: string;
    description: string;
    category: string;
    status: 'active' | 'deprecated' | 'experimental';
    filePath: string;
    requiredTools?: string[];
    usageCount?: number;
    lastUsed?: string;
  }
): Record<string, unknown> {
  return {
    Name: toNotionTitle(skill.name),
    Description: toNotionText(skill.description),
    Category: toNotionSelect(skill.category),
    Status: toNotionSelect(skill.status),
    'File Path': toNotionText(skill.filePath),
    'Required Tools': skill.requiredTools ? toNotionMultiSelect(skill.requiredTools) : { multi_select: [] },
    'Usage Count': { number: skill.usageCount || 0 },
    'Last Used': skill.lastUsed ? toNotionDate(skill.lastUsed) : null,
  };
}

/**
 * Transform Change object to Notion properties
 */
export function transformChangeToNotion(
  change: {
    name: string;
    status: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Promoted';
    changeType: 'Agent Design' | 'Insight Promotion' | 'Skill Addition' | 'Command Update' | 'Policy Change';
    riskLevel: 'Low' | 'Medium' | 'High';
    source: 'ADAS Discovery' | 'Curator' | 'Human Input' | 'Sync Drift';
    summary: string;
    affectedComponents: string[];
    projectId?: string;
    aerReference?: string;
    approvedBy?: string;
    approvedAt?: string;
  }
): Record<string, unknown> {
  return {
    Name: toNotionTitle(change.name),
    Status: toNotionSelect(change.status),
    'Change Type': toNotionSelect(change.changeType),
    'Risk Level': toNotionSelect(change.riskLevel),
    Source: toNotionSelect(change.source),
    Summary: toNotionText(change.summary),
    'Affected Components': toNotionMultiSelect(change.affectedComponents),
    Project: change.projectId ? toNotionRelation(change.projectId) : { relation: [] },
    'AER Reference': change.aerReference ? toNotionText(change.aerReference) : null,
    'Approved By': change.approvedBy ? { people: [{ name: change.approvedBy }] } : null,
    'Approved At': change.approvedAt ? toNotionDate(change.approvedAt) : null,
  };
}
