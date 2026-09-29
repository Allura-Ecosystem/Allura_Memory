#!/usr/bin/env bun
/**
 * Install Agent Skills
 * 
 * Installs skills for Allura agents based on tier priority.
 * Usage: bun scripts/install-agent-skills.ts --tier=1
 */

import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const SKILLS_DIR = ".claude/skills";
const OPENCODE_SKILLS_DIR = ".opencode/skills";

const TIER_1_SKILLS = [
  {
    id: "mcp-builder",
    name: "MCP Builder",
    description: "Build MCP servers for agent integration",
    agents: ["all"],
    platforms: ["claude", "opencode"],
    content: `# MCP Builder Skill

Build Model Context Protocol (MCP) servers for Allura agents.

## Usage
\`\`\`typescript
// Create MCP server
const server = new MCPServer({
  name: "ruvector-memory",
  version: "1.0.0"
});

// Register tools
server.registerTool("memory_retrieve", async (args) => {
  // Implementation
});
\`\`\`

## Best Practices
- Use stdio transport for local servers
- Implement proper error handling
- Log all operations to PostgreSQL
- Validate group_id on every request
`
  },
  {
    id: "postgres-best-practices",
    name: "PostgreSQL Best Practices",
    description: "Database consistency and query optimization",
    agents: ["knuth", "fowler"],
    platforms: ["claude"],
    content: `# PostgreSQL Best Practices

## Query Patterns
- Use parameterized queries
- Always include group_id filter
- Prefer batch operations
- Implement connection pooling

## Schema Design
- Append-only events table
- JSONB for flexible metadata
- Proper indexing on group_id, agent_id
- Partition by date for large tables

## Example
\`\`\`sql
-- Good: Parameterized with group_id
SELECT * FROM events 
WHERE group_id = $1 AND agent_id = $2;

-- Bad: Missing group_id
SELECT * FROM events WHERE agent_id = 'brooks';
\`\`\`
`
  },
  {
    id: "next-best-practices",
    name: "Next.js Best Practices",
    description: "Framework standards for Next.js 16",
    agents: ["knuth", "woz", "hightower"],
    platforms: ["claude", "opencode"],
    content: `# Next.js Best Practices

## App Router
- Use Server Components by default
- Client Components only when needed
- Implement proper loading states
- Use generateMetadata for SEO

## Data Fetching
- Prefer Server Components for data
- Use React Server Actions for mutations
- Implement caching strategies
- Handle errors with error.tsx

## Performance
- Use next/image for images
- Implement streaming with suspense
- Optimize with next/font
- Use dynamic imports for code splitting
`
  },
  {
    id: "github",
    name: "GitHub Integration",
    description: "GitHub workflows and automation",
    agents: ["all"],
    platforms: ["github"],
    content: `# GitHub Integration

## Workflows
- PR review → Dijkstra
- Code push → Knuth
- Issue open → Brooks
- Feature request → Hopper

## Commands
\`\`\`bash
# Create PR
gh pr create --title "feat: ..." --body "..."

# Review PR
gh pr review --approve --comment "LGTM"

# Merge
gh pr merge --squash
\`\`\`

## Best Practices
- Use conventional commits
- Link issues in PR descriptions
- Request review from appropriate agent
- Squash merge for clean history
`
  },
  {
    id: "code-review",
    name: "Code Review",
    description: "Structured code review process",
    agents: ["carmack"],
    platforms: ["github", "claude"],
    content: `# Code Review Skill

## Review Checklist
- [ ] Follows project conventions
- [ ] No security vulnerabilities
- [ ] Proper error handling
- [ ] Tests included
- [ ] Documentation updated
- [ ] Performance considered

## Review Levels
1. **Syntax** - Style, formatting
2. **Logic** - Correctness, edge cases
3. **Architecture** - Design patterns
4. **Security** - Vulnerabilities
5. **Performance** - Optimization

## Comments
- Be specific and constructive
- Suggest improvements, don't just criticize
- Approve with suggestions for minor issues
- Request changes for major issues
`
  },
  {
    id: "skill-creator",
    name: "Skill Creator",
    description: "Create and manage agent skills",
    agents: ["brooks"],
    platforms: ["claude"],
    content: `# Skill Creator

## Creating Skills
1. Define skill purpose and scope
2. Identify target agents
3. Write skill documentation
4. Test with agent
5. Deploy to skill registry

## Skill Structure
\`\`\`
skill-name/
├── SKILL.md          # Documentation
├── examples/         # Usage examples
└── tests/            # Validation tests
\`\`\`

## Best Practices
- Keep skills focused and atomic
- Document all parameters
- Provide examples
- Version skills
- Test before deployment
`
  }
];

const TIER_2_SKILLS = [
  { id: "security-best-practices", name: "Security Best Practices", agents: ["carmack"] },
  { id: "react-best-practices", name: "React Best Practices", agents: ["woz", "hightower", "bellard"] },
  { id: "create-pr", name: "Create PR", agents: ["knuth", "hightower"] },
  { id: "commit", name: "Commit", agents: ["hightower", "knuth"] },
  { id: "figma-implement-design", name: "Figma Implement Design", agents: ["woz"] },
  { id: "firecrawl-agent", name: "Firecrawl Agent", agents: ["scout"] },
  { id: "notion-knowledge-capture", name: "Notion Knowledge Capture", agents: ["scout"] },
  { id: "claude-settings-audit", name: "Claude Settings Audit", agents: ["brooks"] },
  { id: "semgrep-rule-creator", name: "Semgrep Rule Creator", agents: ["pike"] },
];

async function installSkills(tier: number) {
  console.log('='.repeat(60));
  console.log(`Installing Tier ${tier} Skills`);
  console.log('='.repeat(60));
  console.log();

  // Ensure directories exist
  if (!existsSync(SKILLS_DIR)) {
    await mkdir(SKILLS_DIR, { recursive: true });
  }
  if (!existsSync(OPENCODE_SKILLS_DIR)) {
    await mkdir(OPENCODE_SKILLS_DIR, { recursive: true });
  }

  const skills = tier === 1 ? TIER_1_SKILLS : TIER_2_SKILLS;

  for (const skill of skills) {
    console.log(`[install] ${skill.id}...`);
    
    // Create skill directory
    const skillDir = join(SKILLS_DIR, skill.id);
    if (!existsSync(skillDir)) {
      await mkdir(skillDir, { recursive: true });
    }

    // Write SKILL.md
    const skillContent = (skill as any).content || `# ${skill.name}\n\nSkill for ${skill.agents.join(', ')}\n`;
    await writeFile(join(skillDir, 'SKILL.md'), skillContent);

    // Create metadata
    const metadata = {
      id: skill.id,
      name: skill.name,
      description: (skill as any).description || skill.name,
      agents: skill.agents,
      platforms: (skill as any).platforms || ['claude'],
      tier: tier,
      installed: new Date().toISOString()
    };
    await writeFile(join(skillDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    console.log(`  ✓ Installed to ${skillDir}`);
  }

  // Update agent skill mappings
  await updateAgentSkills(skills, tier);

  console.log();
  console.log('='.repeat(60));
  console.log('Installation Complete');
  console.log('='.repeat(60));
  console.log(`Skills installed: ${skills.length}`);
  console.log(`Location: ${SKILLS_DIR}`);
  console.log();
  console.log('Next steps:');
  console.log('  1. Restart Claude Code to load new skills');
  console.log('  2. Test with: /skill ' + skills[0].id);
  console.log('  3. Validate agents can access skills');
}

async function updateAgentSkills(skills: any[], tier: number) {
  const agentSkills: Record<string, string[]> = {
    'brooks': [],
    'jobs': [],
    'pike': [],
    'fowler': [],
    'scout': [],
    'woz': [],
    'bellard': [],
    'carmack': [],
    'knuth': [],
    'hightower': []
  };

  // Map skills to agents
  for (const skill of skills) {
    if (skill.agents.includes('all')) {
      Object.keys(agentSkills).forEach(agent => agentSkills[agent].push(skill.id));
    } else {
      for (const agent of skill.agents) {
        if (agentSkills[agent]) {
          agentSkills[agent].push(skill.id);
        }
      }
    }
  }

  // Write agent skill mappings
  await writeFile(
    join('.claude', 'agent-skills.json'),
    JSON.stringify({ tier, skills: agentSkills }, null, 2)
  );

  console.log();
  console.log('[update] Agent skill mappings:');
  for (const [agent, agentSkillList] of Object.entries(agentSkills)) {
    if (agentSkillList.length > 0) {
      console.log(`  ${agent}: ${agentSkillList.join(', ')}`);
    }
  }
}

// Parse CLI args
const tierArg = process.argv.find(arg => arg.startsWith('--tier='));
const tier = tierArg ? parseInt(tierArg.split('=')[1]) : 1;

if (tier !== 1 && tier !== 2) {
  console.error('Usage: bun scripts/install-agent-skills.ts --tier=1|2');
  process.exit(1);
}

installSkills(tier);
