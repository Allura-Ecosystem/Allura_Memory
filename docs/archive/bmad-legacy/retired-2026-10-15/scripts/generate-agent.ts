#!/usr/bin/env node
/**
 * Agent Generation Template - Story 6.1
 * Epic 6: Agent Persistence and Lifecycle Management
 * 
 * Usage: npm run agent:create -- --name="agent-name" --module="BMM" --platform="OpenCode"
 */

import * as fs from 'fs';
import * as path from 'path';

interface AgentConfig {
  name: string;
  module: string;
  platform: string;
  description?: string;
  expertise?: string[];
}

const VALID_MODULES = ['Core', 'BMM', 'CIS', 'GDS', 'WDS', 'External'] as const;
const VALID_PLATFORMS = ['OpenClaw', 'OpenCode', 'GPT-4', 'Fal.ai', 'Claude'] as const;

const MODULE_EMOJIS: Record<string, string> = {
  Core: '🧙',
  BMM: '📊',
  CIS: '🧠',
  GDS: '🎮',
  WDS: '🎨',
  External: '🌐'
};

const BASE_PATH = '/home/ronin704/.openclaw/workspace/projects/sabir-ai-os/_bmad';

function parseArgs(): AgentConfig {
  const args = process.argv.slice(2);
  const config: AgentConfig = {
    name: '',
    module: 'BMM',
    platform: 'OpenCode'
  };

  for (let i = 0; i < args.length; i++) {
    // Handle --name=value and --name value formats
    const arg = args[i];
    
    if (arg.startsWith('--name=')) {
      config.name = arg.split('=')[1].toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/"/g, '');
    } else if (arg === '--name' && args[i + 1]) {
      config.name = args[i + 1].toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/"/g, '');
      i++;
    } else if (arg.startsWith('--module=')) {
      config.module = arg.split('=')[1].toUpperCase().replace(/"/g, '');
    } else if (arg === '--module' && args[i + 1]) {
      config.module = args[i + 1].toUpperCase().replace(/"/g, '');
      i++;
    } else if (arg.startsWith('--platform=')) {
      config.platform = arg.split('=')[1].replace(/"/g, '');
    } else if (arg === '--platform' && args[i + 1]) {
      config.platform = args[i + 1].replace(/"/g, '');
      i++;
    } else if (arg.startsWith('--description=')) {
      config.description = arg.split('=')[1].replace(/"/g, '');
    } else if (arg === '--description' && args[i + 1]) {
      config.description = args[i + 1].replace(/"/g, '');
      i++;
    }
  }

  return config;
}

function validateConfig(config: AgentConfig): void {
  if (!config.name) {
    console.error('❌ Error: --name is required');
    process.exit(1);
  }

  if (!VALID_MODULES.includes(config.module as any)) {
    console.error(`❌ Error: Invalid module "${config.module}". Valid modules: ${VALID_MODULES.join(', ')}`);
    process.exit(1);
  }

  if (!VALID_PLATFORMS.includes(config.platform as any)) {
    console.error(`❌ Error: Invalid platform "${config.platform}". Valid platforms: ${VALID_PLATFORMS.join(', ')}`);
    process.exit(1);
  }
}

function checkAgentExists(config: AgentConfig): void {
  const agentFile = path.join(BASE_PATH, config.module.toLowerCase(), 'agents', `${config.name}.md`);
  const skillDir = path.join(BASE_PATH, config.module.toLowerCase(), 'skills', config.name);
  
  if (fs.existsSync(agentFile)) {
    console.error(`❌ Error: Agent "${config.name}" already exists at ${agentFile}`);
    process.exit(1);
  }
  
  if (fs.existsSync(skillDir)) {
    console.error(`❌ Error: Skill directory "${config.name}" already exists at ${skillDir}`);
    process.exit(1);
  }
}

function generateAgentDefinition(config: AgentConfig): string {
  const emoji = MODULE_EMOJIS[config.module] || '🤖';
  const timestamp = new Date().toISOString();
  
  return `---
name: ${config.name}
description: ${config.description || 'Add description here'}
version: 1.0.0
status: Draft
confidence: 0.0
created: ${timestamp}
module: ${config.module}
platform: ${config.platform}
---

# ${emoji} ${config.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}

## Persona
{Add persona description here}

## Expertise
- {Add expertise area 1}
- {Add expertise area 2}
- {Add expertise area 3}

## Activation
1. {Add activation step 1}
2. {Add activation step 2}
3. {Add activation step 3}

## Tools
- {Add tool 1}
- {Add tool 2}

## Memory Access
- PostgreSQL: {read|write|none}
- Neo4j: {read|write|none}
- Notion: {read|write|none}

## Examples
\`\`\`
{Add example usage here}
\`\`\`

## Notes
- Created: ${timestamp}
- Module: ${config.module}
- Platform: ${config.platform}
`;
}

function generateSkillMd(config: AgentConfig): string {
  return `---
name: ${config.name}
description: ${config.description || 'Add description here'}
---

# ${config.name}

Use when: {Add trigger conditions here}

## Workflow
Follow instructions in [workflow.md](workflow.md).

## References
- {Add reference 1}
- {Add reference 2}

## Notes
- Created: ${new Date().toISOString()}
- Module: ${config.module}
`;
}

function generateWorkflowMd(config: AgentConfig): string {
  return `# ${config.name} Workflow

## Steps
1. {Add step 1}
2. {Add step 2}
3. {Add step 3}

## Inputs
- {input-1}: {description}
- {input-2}: {description}

## Outputs
- {output-1}: {description}
- {output-2}: {description}

## Validation
- {validation-criteria-1}
- {validation-criteria-2}

## Error Handling
- {error-case-1}: {handling}
- {error-case-2}: {handling}

## Notes
- Created: ${new Date().toISOString()}
- Module: ${config.module}
`;
}

function updateManifest(config: AgentConfig): void {
  const manifestPath = path.join(BASE_PATH, '_config', 'agent-manifest.csv');
  const timestamp = new Date().toISOString();
  
  let manifestContent = '';
  if (fs.existsSync(manifestPath)) {
    manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  } else {
    manifestContent = 'name,module,platform,status,confidence,created_at\n';
  }
  
  const newRow = `${config.name},${config.module},${config.platform},Draft,0.0,${timestamp}\n`;
  manifestContent += newRow;
  
  fs.writeFileSync(manifestPath, manifestContent);
}

function createAgent(config: AgentConfig): void {
  const moduleLower = config.module.toLowerCase();
  
  // Paths
  const agentPath = path.join(BASE_PATH, moduleLower, 'agents', `${config.name}.md`);
  const skillPath = path.join(BASE_PATH, moduleLower, 'skills', config.name, 'SKILL.md');
  const workflowPath = path.join(BASE_PATH, moduleLower, 'skills', config.name, 'workflow.md');
  const referencesPath = path.join(BASE_PATH, moduleLower, 'skills', config.name, 'references', '.gitkeep');
  
  // Create directories
  fs.mkdirSync(path.dirname(agentPath), { recursive: true });
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.mkdirSync(path.dirname(referencesPath), { recursive: true });
  
  // Write files
  fs.writeFileSync(agentPath, generateAgentDefinition(config));
  fs.writeFileSync(skillPath, generateSkillMd(config));
  fs.writeFileSync(workflowPath, generateWorkflowMd(config));
  fs.writeFileSync(referencesPath, '# References go here\n');
  
  // Update manifest
  updateManifest(config);
  
  console.log('✅ Agent created successfully!');
  console.log('');
  console.log('Files created:');
  console.log(`  - ${agentPath}`);
  console.log(`  - ${skillPath}`);
  console.log(`  - ${workflowPath}`);
  console.log(`  - ${path.dirname(referencesPath)}/`);
  console.log('');
  console.log('Manifest updated:');
  console.log(`  - ${path.join(BASE_PATH, '_config', 'agent-manifest.csv')}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Edit the agent definition in agents/' + config.name + '.md');
  console.log('  2. Edit the SKILL.md trigger conditions');
  console.log('  3. Edit the workflow.md steps');
  console.log('  4. Add references to the references/ folder');
  console.log('  5. Test the agent');
  console.log('  6. Update status from Draft to Testing');
}

// Main
const config = parseArgs();
validateConfig(config);
checkAgentExists(config);
createAgent(config);