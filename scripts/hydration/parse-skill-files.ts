// scripts/hydration/parse-skill-files.ts
// Parse skill markdown files and extract metadata from frontmatter

import yaml from 'yaml';
import fs from 'fs';
import path from 'path';
import { SkillSchema } from './notion-client';

export interface ParsedSkill {
  filename: string;
  filePath: string;
  name: string;
  description: string;
  argumentHint?: string;
  category: 'context' | 'research' | 'writing' | 'testing' | 'review' | 'governance' | 'deployment';
  status: 'active' | 'deprecated' | 'experimental';
}

// Categorization rules based on skill name patterns
const SKILL_CATEGORY_MAP: Record<string, ParsedSkill['category']> = {
  'memory-': 'context',
  'wds-': 'governance',
  'context7': 'context',
  'multi-search': 'research',
  'testing': 'testing',
  'testarch': 'testing',
  'review': 'review',
  'deployment': 'deployment',
} as const;

/**
 * Categorize a skill based on its name
 */
function categorizeSkill(skillName: string): ParsedSkill['category'] {
  // Check prefix patterns
  for (const [prefix, category] of Object.entries(SKILL_CATEGORY_MAP)) {
    if (skillName.toLowerCase().startsWith(prefix)) {
      return category;
    }
  }

  // Default categorization based on keywords
  const lowerName = skillName.toLowerCase();

  if (lowerName.includes('test') || lowerName.includes('qa')) return 'testing';
  if (lowerName.includes('review') || lowerName.includes('audit')) return 'review';
  if (lowerName.includes('deploy') || lowerName.includes('security')) return 'deployment';
  if (lowerName.includes('research') || lowerName.includes('search')) return 'research';
  if (lowerName.includes('write') || lowerName.includes('doc')) return 'writing';
  if (lowerName.includes('govern') || lowerName.includes('valid')) return 'governance';

  return 'context'; // Default fallback
}

/**
 * Parse a skill markdown file and extract frontmatter metadata
 */
export function parseSkillFile(filePath: string): ParsedSkill {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract frontmatter (YAML between --- delimiters)
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error(`No frontmatter found in skill file: ${filePath}`);
  }

  try {
    const frontmatter = yaml.parse(frontmatterMatch[1]);

    const name = frontmatter.name;
    const description = frontmatter.description || '';
    const argumentHint = frontmatter['argument-hint'];

    // Determine status (default to active, unless explicitly set)
    const status: ParsedSkill['status'] = 'active';

    return {
      filename: path.basename(filePath),
      filePath,
      name,
      description,
      argumentHint,
      category: categorizeSkill(name),
      status,
    };
  } catch (error) {
    throw new Error(`Failed to parse frontmatter in ${filePath}: ${error}`);
  }
}

/**
 * Find all skill files in .opencode/skills directory
 */
export function findSkillFiles(baseDir: string): string[] {
  const skillsDir = path.join(baseDir, '.opencode', 'skills');

  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const files: string[] = [];

  // Each skill is in its own directory with a SKILL.md file
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        files.push(skillFile);
      }
    }
  }

  return files;
}

/**
 * Transform parsed skills to Notion Skill properties
 */
export function skillsToNotionProperties(
  skills: ParsedSkill[]
): Array<Record<string, unknown>> {
  return skills.map(skill => {
    // Validate with Zod
    const skillData = SkillSchema.parse({
      name: skill.name,
      description: skill.description.substring(0, 500), // Truncate for Notion
      category: skill.category,
      status: skill.status,
      filePath: skill.filePath,
      requiredTools: [], // Will be enriched later if needed
      usageCount: 0,
    });

    // Transform to Notion property format
    return {
      Name: { title: [{ text: { content: skillData.name } }] },
      Description: { rich_text: [{ text: { content: skillData.description } }] },
      Category: { select: { name: skillData.category } },
      Status: { select: { name: skillData.status } },
      'File Path': { rich_text: [{ text: { content: skillData.filePath } }] },
      'Required Tools': { multi_select: [] },
      'Usage Count': { number: skillData.usageCount },
      'Last Used': { date: null },
    };
  });
}

/**
 * Extract required tools from skill content (heuristic)
 */
export function extractRequiredTools(content: string): string[] {
  const tools: string[] = [];

  // Common patterns for tool usage
  const toolPatterns = [
    /MCP_DOCKER_(\w+)/g,
    /bash\s*\(/g,
    /read\s*\(/g,
    /write\s*\(/g,
    /edit\s*\(/g,
    /glob\s*\(/g,
  ];

  for (const pattern of toolPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(m => {
        // Extract tool name
        const toolName = m.replace(/[()]/g, '').trim();
        if (!tools.includes(toolName)) {
          tools.push(toolName);
        }
      });
    }
  }

  return tools;
}
