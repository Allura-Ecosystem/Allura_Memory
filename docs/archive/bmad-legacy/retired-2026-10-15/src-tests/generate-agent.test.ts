import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BASE_PATH = '/home/ronin704/.openclaw/workspace/projects/sabir-ai-os/_bmad';
const TEST_AGENT = 'test-agent-story-6-1';

// Pre-Phase-4 baseline — tracked in docs/deferred/pre-existing-failures.md
// Reason: uses hardcoded filesystem paths (/home/ronin704/.openclaw/...) and execSync
// to call npm scripts on a different project; paths don't exist in CI/test environments
const shouldRunGenerator = process.env.RUN_GENERATOR_INTEGRATION === "true";

describe.skipIf(!shouldRunGenerator)('Agent Generator (Story 6.1)', () => {
  beforeEach(() => {
    // Clean up any test agent before each test
    cleanupTestAgent();
  });

  afterEach(() => {
    // Clean up after each test
    cleanupTestAgent();
  });

  function cleanupTestAgent() {
    const moduleLower = 'bmm';
    const agentPath = path.join(BASE_PATH, moduleLower, 'agents', `${TEST_AGENT}.md`);
    const skillPath = path.join(BASE_PATH, moduleLower, 'skills', TEST_AGENT);
    
    if (fs.existsSync(agentPath)) {
      fs.unlinkSync(agentPath);
    }
    
    if (fs.existsSync(skillPath)) {
      fs.rmSync(skillPath, { recursive: true });
    }
  }

  it('should create all required files when valid config provided', () => {
    const result = execSync(
      `cd /home/ronin704/dev/projects/memory && npm run agent:create -- --name="${TEST_AGENT}" --module="BMM" --platform="OpenCode"`,
      { encoding: 'utf-8' }
    );

    expect(result).toContain('✅ Agent created successfully');

    const moduleLower = 'bmm';
    
    // Check agent file
    const agentPath = path.join(BASE_PATH, moduleLower, 'agents', `${TEST_AGENT}.md`);
    expect(fs.existsSync(agentPath)).toBe(true);
    
    // Check SKILL.md
    const skillPath = path.join(BASE_PATH, moduleLower, 'skills', TEST_AGENT, 'SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);
    
    // Check workflow.md
    const workflowPath = path.join(BASE_PATH, moduleLower, 'skills', TEST_AGENT, 'workflow.md');
    expect(fs.existsSync(workflowPath)).toBe(true);
    
    // Check references folder
    const referencesPath = path.join(BASE_PATH, moduleLower, 'skills', TEST_AGENT, 'references', '.gitkeep');
    expect(fs.existsSync(referencesPath)).toBe(true);
  });

  it('should validate module parameter', () => {
    let error: Error | null = null;
    try {
      execSync(
        `cd /home/ronin704/dev/projects/memory && npm run agent:create -- --name="bad-agent" --module="INVALID" --platform="OpenCode"`,
        { encoding: 'utf-8' }
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain('Invalid module');
  });

  it('should validate platform parameter', () => {
    let error: Error | null = null;
    try {
      execSync(
        `cd /home/ronin704/dev/projects/memory && npm run agent:create -- --name="bad-agent" --module="BMM" --platform="INVALID"`,
        { encoding: 'utf-8' }
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain('Invalid platform');
  });

  it('should prevent duplicate agents', () => {
    // Create first agent
    execSync(
      `cd /home/ronin704/dev/projects/memory && npm run agent:create -- --name="${TEST_AGENT}" --module="BMM" --platform="OpenCode"`,
      { encoding: 'utf-8' }
    );

    // Try to create duplicate
    let error: Error | null = null;
    try {
      execSync(
        `cd /home/ronin704/dev/projects/memory && npm run agent:create -- --name="${TEST_AGENT}" --module="BMM" --platform="OpenCode"`,
        { encoding: 'utf-8' }
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain('already exists');
  });

  it('should update agent manifest', () => {
    execSync(
      `cd /home/ronin704/dev/projects/memory && npm run agent:create -- --name="${TEST_AGENT}" --module="BMM" --platform="OpenCode"`,
      { encoding: 'utf-8' }
    );

    const manifestPath = path.join(BASE_PATH, '_config', 'agent-manifest.csv');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    
    expect(manifestContent).toContain(TEST_AGENT);
    expect(manifestContent).toContain('BMM');
    expect(manifestContent).toContain('OpenCode');
    expect(manifestContent).toContain('Draft');
  });

  it('should complete in under 10 seconds', () => {
    const start = Date.now();
    
    execSync(
      `cd /home/ronin704/dev/projects/memory && npm run agent:create -- --name="${TEST_AGENT}" --module="BMM" --platform="OpenCode"`,
      { encoding: 'utf-8' }
    );
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000); // 10 seconds
  });
});