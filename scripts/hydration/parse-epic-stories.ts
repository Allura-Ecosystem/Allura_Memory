// scripts/hydration/parse-epic-stories.ts
// Parse epic markdown files and extract story entries

import yaml from 'yaml';
import fs from 'fs';
import path from 'path';
import { TaskSchema } from './notion-client';

export interface Story {
  id: string;
  epicId: string;
  title: string;
  estimate: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'Todo' | 'In Progress' | 'Blocked' | 'Review' | 'Done' | 'Canceled';
}

/**
 * Parse an epic markdown file and extract story entries
 */
export function parseEpicFile(filePath: string): {
  epicId: string;
  epicTitle: string;
  stories: Story[];
} {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract epic ID from filename (e.g., "epic-7-openagents-control-registry.md" -> "7")
  const filename = path.basename(filePath, '.md');
  const epicMatch = filename.match(/epic-(\d+)/);
  if (!epicMatch) {
    throw new Error(`Invalid epic filename: ${filename}`);
  }
  const epicId = epicMatch[1];

  // Extract epic title from first heading
  const titleMatch = content.match(/^#\s+Epic\s+\d+:\s+(.+)$/m);
  const epicTitle = titleMatch ? titleMatch[1] : `Epic ${epicId}`;

  // Parse frontmatter for stepsCompleted
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let stepsCompleted: number[] = [];
  let epicStatus = 'backlog';

  if (frontmatterMatch) {
    try {
      const frontmatter = yaml.parse(frontmatterMatch[1]);
      if (frontmatter.stepsCompleted) {
        stepsCompleted = frontmatter.stepsCompleted;
      }
      epicStatus = frontmatter.status || 'backlog';
    } catch (e) {
      // Continue without frontmatter
    }
  }

  // Parse stories from markdown table
  // Format: | Story ID | Title | Estimate | Priority |
  const stories: Story[] = [];
  const tableRegex = /\|\s*(\d+\.\d+)\s*\|\s*([^|]+)\s*\|\s*(\d+h)\s*\|\s*(P\d)\s*\|/g;

  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const [, storyId, title, estimate, priority] = match;

    // Trim and clean title
    const cleanTitle = title.trim();

    // Extract story number
    const storyNum = parseFloat(storyId);

    // Map story number to status
    let status: Story['status'] = 'Todo';
    if (stepsCompleted.includes(storyNum)) {
      status = 'Done';
    } else if (epicStatus === 'ready-for-dev') {
      status = 'Todo';
    } else if (epicStatus === 'in-progress') {
      status = 'In Progress';
    } else if (epicStatus === 'blocked') {
      status = 'Blocked';
    }

    stories.push({
      id: storyId,
      epicId,
      title: cleanTitle,
      estimate,
      priority: priority as Story['priority'],
      status,
    });
  }

  return { epicId, epicTitle, stories };
}

/**
 * Find all epic files in the _bmad_output/planning-artifacts directory
 */
export function findEpicFiles(baseDir: string): string[] {
  const epicDir = path.join(baseDir, '_bmad_output', 'planning-artifacts');

  if (!fs.existsSync(epicDir)) {
    // Preserve the historical archive fallback when no current output exists.
    const archivedDir = path.join(baseDir, 'archive', 'bmad-output', 'planning-artifacts');
    if (fs.existsSync(archivedDir)) {
      return fs.readdirSync(archivedDir)
        .filter(f => f.startsWith('epic-') && f.endsWith('.md'))
        .map(f => path.join(archivedDir, f));
    }
    return [];
  }

  return fs.readdirSync(epicDir)
    .filter(f => f.startsWith('epic-') && f.endsWith('.md'))
    .map(f => path.join(epicDir, f));
}

/**
 * Transform parsed stories to Notion Task properties
 */
export function storiesToNotionTasks(
  stories: Story[],
  projectId: string
): Array<Record<string, unknown>> {
  return stories.map(story => {
    // Validate with Zod
    const taskData = TaskSchema.parse({
      name: `Story ${story.id}: ${story.title}`,
      status: story.status,
      priority: story.priority,
      type: 'Code' as const,
      tags: ['Memory System', 'Agent'],
      projectId,
    });

    // Transform to Notion property format
    return {
      Name: { title: [{ text: { content: taskData.name } }] },
      Status: { select: { name: taskData.status } },
      Priority: { select: { name: taskData.priority } },
      Type: { select: { name: taskData.type } },
      Tags: { multi_select: (taskData.tags || []).map(t => ({ name: t })) },
      Project: { relation: { id: projectId } },
    };
  });
}
