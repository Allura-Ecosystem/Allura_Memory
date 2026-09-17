/**
 * Planning Drift Analyzer - Story vs Epic, Code vs AC Drift Detection
 *
 * Detects when:
 * - Story implementation drifts from acceptance criteria
 * - Story progress drifts from epic timeline
 * - Subagent behavior drifts from planned workflow
 *
 * This ensures conceptual integrity over 6+ month operational periods.
 */

import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

/**
 * Drift severity levels
 */
export type DriftSeverity = 'FATAL' | 'WARNING' | 'INFO';

/**
 * Drift types
 */
export type DriftType = 
  | 'story_vs_ac'         // Story implementation doesn't match acceptance criteria
  | 'story_vs_epic'       // Story timeline doesn't match epic timeline
  | 'subagent_vs_plan'   // Subagent behavior doesn't match planned workflow
  | 'code_vs_spec';       // Code implementation doesn't match specification

/**
 * Drift detection result
 */
export interface DriftResult {
  /** Whether drift was detected */
  hasDrift: boolean;
  /** Severity of drift */
  severity: DriftSeverity;
  /** Type of drift */
  type: DriftType;
  /** Description of drift */
  description: string;
  /** Expected value */
  expected: string;
  /** Actual value */
  actual: string;
  /** Remediation suggestion */
  remediation: string;
  /** Timestamp of detection */
  timestamp: Date;
  /** Related story ID */
  storyId?: string;
  /** Related epic ID */
  epicId?: string;
}

/**
 * Story definition schema (simplified)
 */
export const StoryDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  epic_id: z.string(),
  acceptance_criteria: z.array(z.string()),
  implementation_status: z.enum(['backlog', 'ready-for-dev', 'in-progress', 'ready-for-review', 'done']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  estimated_hours: z.number().optional(),
  actual_hours: z.number().optional(),
});

export type StoryDefinition = z.infer<typeof StoryDefinitionSchema>;

/**
 * Epic definition schema (simplified)
 */
export const EpicDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  stories: z.array(z.string()),
  estimated_completion_date: z.string().datetime().optional(),
  status: z.enum(['planning', 'in-progress', 'done']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type EpicDefinition = z.infer<typeof EpicDefinitionSchema>;

/**
 * Planning drift analyzer configuration
 */
export interface DriftAnalyzerConfig {
  /** Path to stories directory */
  storiesDir: string;
  /** Path to epics file */
  epicsFile: string;
  /** Tolerance for timeline drift (days) */
  timelineDriftTolerance: number;
  /** Enable strict AC validation */
  strictAcValidation: boolean;
}

const DEFAULT_CONFIG: DriftAnalyzerConfig = {
  storiesDir: '_bmad_output/implementation-artifacts',
  epicsFile: '_bmad_output/planning-artifacts/epics.md',
  timelineDriftTolerance: 7, // 7 days
  strictAcValidation: true,
};

/**
 * Planning Drift Analyzer
 *
 * Detects drift between:
 * - Story implementation and acceptance criteria
 * - Story progress and epic timeline
 * - Subagent behavior and planned workflow
 */
export class PlanningDriftAnalyzer {
  private config: DriftAnalyzerConfig;
  private stories: Map<string, StoryDefinition> = new Map();
  private epics: Map<string, EpicDefinition> = new Map();

  constructor(config?: Partial<DriftAnalyzerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load planning artifacts
   */
  async loadPlanningArtifacts(): Promise<void> {
    // Load stories
    await this.loadStories();

    // Load epics
    await this.loadEpics();
  }

  /**
   * Load stories from implementation artifacts
   */
  private async loadStories(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.storiesDir);
      
      for (const file of files) {
        if (!file.endsWith('.md') && !file.endsWith('.yaml')) {
          continue;
        }

        const filePath = path.join(this.config.storiesDir, file);
        const content = await fs.readFile(filePath, 'utf8');

        // Parse story (simplified - actual parsing would be more robust)
        const story = this.parseStory(file, content);
        if (story) {
          this.stories.set(story.id, story);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[DriftAnalyzer] Failed to load stories:', error);
      }
    }
  }

  /**
   * Parse story from file content
   */
  private parseStory(filename: string, content: string): StoryDefinition | null {
    // Simplified parsing - would use proper YAML/Markdown parser in production
    const idMatch = filename.match(/story-(\d+\.\d+)/);
    if (!idMatch) {
      return null;
    }

    const id = `story-${idMatch[1]}`;
    
    // Extract acceptance criteria (simplified)
    const acMatch = content.match(/Acceptance Criteria:\s*([\s\S]*?)(?=\n##|\n$)/);
    const acceptanceCriteria = acMatch
      ? acMatch[1]
          .trim()
          .split('\n')
          .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
          .map(line => line.replace(/^[-*]\s*/, '').trim())
      : [];

    // Extract status (simplified)
    const statusMatch = content.match(/Status:\s*(backlog|ready-for-dev|in-progress|ready-for-review|done)/i);
    const status = (statusMatch?.[1] || 'backlog') as StoryDefinition['implementation_status'];

    // Extract epic ID (simplified)
    const epicMatch = content.match(/Epic:\s*(\d+)/);
    const epicId = epicMatch ? `epic-${epicMatch[1]}` : 'unknown';

    return {
      id,
      title: id,
      epic_id: epicId,
      acceptance_criteria: acceptanceCriteria,
      implementation_status: status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Load epics from planning artifacts
   */
  private async loadEpics(): Promise<void> {
    try {
      const content = await fs.readFile(this.config.epicsFile, 'utf8');

      // Parse epics (simplified)
      const epicMatches = content.matchAll(/##\s+Epic\s+(\d+):\s+(.+?)(?=\n##\s+Epic|\n$)/gs);
      
      for (const match of epicMatches) {
        const id = `epic-${match[1]}`;
        const title = match[2].trim();
        
        // Extract story IDs (simplified)
        const storyMatches = content.matchAll(/Story\s+(\d+\.\d+)/g);
        const stories = Array.from(storyMatches).map(m => `story-${m[1]}`);

        this.epics.set(id, {
          id,
          title,
          stories,
          status: 'planning',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[DriftAnalyzer] Failed to load epics:', error);
      }
    }
  }

  /**
   * Analyze story vs acceptance criteria drift
   */
  analyzeStoryVsAc(storyId: string, implementedFeatures: string[]): DriftResult | null {
    const story = this.stories.get(storyId);
    if (!story) {
      return null;
    }

    // Check if all AC items are implemented
    const missingAc = story.acceptance_criteria.filter(
      ac => !implementedFeatures.some(feature => 
        feature.toLowerCase().includes(ac.toLowerCase()) || 
        ac.toLowerCase().includes(feature.toLowerCase())
      )
    );

    if (missingAc.length === 0) {
      return null; // No drift
    }

    const severity: DriftSeverity = missingAc.length > story.acceptance_criteria.length / 2 
      ? 'FATAL' 
      : 'WARNING';

    return {
      hasDrift: true,
      severity,
      type: 'story_vs_ac',
      description: `Story ${storyId} is missing ${missingAc.length} acceptance criteria`,
      expected: story.acceptance_criteria.join('\n'),
      actual: implementedFeatures.join('\n'),
      remediation: `Implement missing acceptance criteria:\n${missingAc.map(ac => `- ${ac}`).join('\n')}`,
      timestamp: new Date(),
      storyId,
      epicId: story.epic_id,
    };
  }

  /**
   * Analyze story vs epic timeline drift
   */
  analyzeStoryVsEpic(storyId: string, storyProgress: number): DriftResult | null {
    const story = this.stories.get(storyId);
    if (!story) {
      return null;
    }

    const epic = this.epics.get(story.epic_id);
    if (!epic) {
      return null;
    }

    // Calculate expected progress based on epic
    const totalStories = epic.stories.length;
    if (totalStories === 0) {
      return null;
    }

    // For now, assume linear progression through epic stories
    const storyIndex = epic.stories.indexOf(storyId);
    const expectedProgress = storyIndex === -1 ? 0 : (storyIndex / totalStories) * 100;

    // Check if progress drifts from expected
    const progressDiff = Math.abs(storyProgress - expectedProgress);

    if (progressDiff <= 20) {
      return null; // Within acceptable range
    }

    const severity: DriftSeverity = progressDiff > 50 ? 'WARNING' : 'INFO';

    return {
      hasDrift: true,
      severity,
      type: 'story_vs_epic',
      description: `Story ${storyId} progress (${storyProgress}%) drifts from epic timeline (expected ~${expectedProgress.toFixed(0)}%)`,
      expected: `Progress around ${expectedProgress.toFixed(0)}%`,
      actual: `Progress at ${storyProgress}%`,
      remediation: storyProgress < expectedProgress 
        ? 'Consider prioritizing this story to catch up with epic timeline'
        : 'Story is ahead of schedule, ensure quality is not compromised',
      timestamp: new Date(),
      storyId,
      epicId: story.epic_id,
    };
  }

  /**
   * Analyze subagent vs planned workflow drift
   */
  analyzeSubagentVsPlan(
    subagentType: string,
    plannedWorkflow: string[],
    actualActions: string[]
  ): DriftResult | null {
    // Check if actual actions follow planned workflow
    const plannedSet = new Set(plannedWorkflow.map(w => w.toLowerCase()));
    const actualSet = new Set(actualActions.map(a => a.toLowerCase()));

    // Find actions outside planned workflow
    const unplannedActions = actualActions.filter(a => !plannedSet.has(a.toLowerCase()));

    // Find skipped planned steps
    const skippedSteps = plannedWorkflow.filter(w => !actualSet.has(w.toLowerCase()));

    if (unplannedActions.length === 0 && skippedSteps.length === 0) {
      return null; // No drift
    }

    const severity: DriftSeverity = skippedSteps.length > 0 ? 'WARNING' : 'INFO';

    return {
      hasDrift: true,
      severity,
      type: 'subagent_vs_plan',
      description: `Subagent ${subagentType} drifted from planned workflow`,
      expected: plannedWorkflow.join(' -> '),
      actual: actualActions.join(' -> '),
      remediation: skippedSteps.length > 0
        ? `Execute skipped steps:\n${skippedSteps.map(s => `- ${s}`).join('\n')}`
        : `Review unplanned actions:\n${unplannedActions.map(a => `- ${a}`).join('\n')}`,
      timestamp: new Date(),
    };
  }

  /**
   * Analyze code vs specification drift
   */
  analyzeCodeVsSpec(
    specification: string,
    codeStructure: string[]
  ): DriftResult | null {
    // Simplified analysis - would use AST parsing in production
    const specKeywords = specification.toLowerCase().split(/\s+/);
    const codeKeywords = codeStructure.join(' ').toLowerCase().split(/\s+/);

    // Find specification keywords not present in code
    const missingKeywords = specKeywords.filter(
      keyword => keyword.length > 3 && !codeKeywords.includes(keyword)
    );

    if (missingKeywords.length === 0) {
      return null; // No drift
    }

    const severity: DriftSeverity = missingKeywords.length > specKeywords.length / 4 
      ? 'WARNING' 
      : 'INFO';

    return {
      hasDrift: true,
      severity,
      type: 'code_vs_spec',
      description: `Code implementation may not fully cover specification`,
      expected: specification,
      actual: codeStructure.join('\n'),
      remediation: `Review specification coverage. Missing keywords: ${missingKeywords.slice(0, 10).join(', ')}`,
      timestamp: new Date(),
    };
  }

  /**
   * Run full drift analysis
   */
  async analyzeAll(): Promise<DriftResult[]> {
    const results: DriftResult[] = [];

    // Analyze all stories
    for (const [storyId, story] of this.stories) {
      // Story vs AC drift
      const acDrift = this.analyzeStoryVsAc(storyId, []);
      if (acDrift) {
        results.push(acDrift);
      }

      // Story vs Epic drift
      const epicDrift = this.analyzeStoryVsEpic(storyId, 0);
      if (epicDrift) {
        results.push(epicDrift);
      }
    }

    return results;
  }

  /**
   * Get story by ID
   */
  getStory(storyId: string): StoryDefinition | undefined {
    return this.stories.get(storyId);
  }

  /**
   * Get epic by ID
   */
  getEpic(epicId: string): EpicDefinition | undefined {
    return this.epics.get(epicId);
  }

  /**
   * Check if drift is fatal (requires immediate attention)
   */
  isFatal(drift: DriftResult): boolean {
    return drift.severity === 'FATAL';
  }

  /**
   * Get remediation priority
   */
  getRemediationPriority(drift: DriftResult): number {
    const severityWeight = {
      FATAL: 100,
      WARNING: 50,
      INFO: 10,
    };

    const typeWeight = {
      story_vs_ac: 30,
      story_vs_epic: 20,
      subagent_vs_plan: 25,
      code_vs_spec: 15,
    };

    return severityWeight[drift.severity] + typeWeight[drift.type];
  }
}

/**
 * Factory function to create planning drift analyzer
 */
export function createPlanningDriftAnalyzer(
  config?: Partial<DriftAnalyzerConfig>
): PlanningDriftAnalyzer {
  return new PlanningDriftAnalyzer(config);
}

/**
 * Default export
 */
export default PlanningDriftAnalyzer;