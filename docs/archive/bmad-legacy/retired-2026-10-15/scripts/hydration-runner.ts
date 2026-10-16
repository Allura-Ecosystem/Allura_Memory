import { approveAdr001 } from './hydration/approve-adr';
import { hydrateAgents } from './hydration/create-agents';
import { hydrateSkills } from './hydration/create-skills';
import { hydrateTasks } from './hydration/create-tasks';
import { seedAdr001 } from './hydration/seed-changes';

interface HydrationSummary {
  tasks: { total: number; created: number; errors: number };
  agents: { total: number; created: number; errors: number };
  skills: { total: number; created: number; errors: number };
  adrChange: { created: boolean; id?: string };
}

export async function runHydration(): Promise<HydrationSummary> {
  console.log('==============================================');
  console.log('Notion Workspace Hydration - Session 2');
  console.log('==============================================');
  console.log();

  const summary: HydrationSummary = {
    tasks: { total: 0, created: 0, errors: 0 },
    agents: { total: 0, created: 0, errors: 0 },
    skills: { total: 0, created: 0, errors: 0 },
    adrChange: { created: false },
  };

  console.log('TASK 1: HYDRATE TASKS');
  console.log();
  try {
    const taskResult = await hydrateTasks(process.cwd());
    summary.tasks = {
      total: taskResult.totalTasks,
      created: taskResult.created,
      errors: taskResult.errors.length,
    };
  } catch (error) {
    console.error('Task hydration failed:', error);
    summary.tasks.errors = 1;
  }

  console.log('TASK 2: HYDRATE AGENTS');
  console.log();
  try {
    const agentResult = await hydrateAgents(process.cwd());
    summary.agents = {
      total: agentResult.totalAgents,
      created: agentResult.created,
      errors: agentResult.errors.length,
    };
  } catch (error) {
    console.error('Agent hydration failed:', error);
    summary.agents.errors = 1;
  }

  console.log('TASK 3: HYDRATE SKILLS');
  console.log();
  try {
    const skillResult = await hydrateSkills(process.cwd());
    summary.skills = {
      total: skillResult.totalSkills,
      created: skillResult.created,
      errors: skillResult.errors.length,
    };
  } catch (error) {
    console.error('Skill hydration failed:', error);
    summary.skills.errors = 1;
  }

  console.log('TASK 4: SEED ADR-001');
  console.log();
  try {
    const changeId = await seedAdr001();
    summary.adrChange = { created: true, id: changeId };
  } catch (error) {
    console.error('ADR seeding failed:', error);
    summary.adrChange = { created: false };
  }

  console.log('TASK 5: APPROVE ADR-001');
  console.log();
  console.log('HITL approval requires human interaction.');
  console.log('Run separately: bun scripts/hydration/approve-adr.ts');
  console.log('Or set environment variable: AUTO_APPROVE_ADR=true');

  if (process.env.AUTO_APPROVE_ADR === 'true') {
    try {
      await approveAdr001();
      console.log('ADR-001 approved (autopilot mode)');
    } catch (error) {
      console.error('ADR approval failed:', error);
    }
  }

  console.log();
  console.log('==============================================');
  console.log('HYDRATION COMPLETE');
  console.log('==============================================');
  console.log();
  console.log('Final Summary:');
  console.log(`Tasks: ${summary.tasks.created}/${summary.tasks.total} created, ${summary.tasks.errors} errors`);
  console.log(`Agents: ${summary.agents.created}/${summary.agents.total} created, ${summary.agents.errors} errors`);
  console.log(`Skills: ${summary.skills.created}/${summary.skills.total} created, ${summary.skills.errors} errors`);
  console.log(`ADR-001: ${summary.adrChange.created ? 'Seeded' : 'Failed'}`);
  console.log();

  const totalErrors = summary.tasks.errors + summary.agents.errors + summary.skills.errors;
  if (totalErrors > 0) {
    console.log(`Completed with ${totalErrors} total error(s)`);
    process.exit(1);
  }

  console.log('All hydration tasks completed successfully!');
  process.exit(0);
}

if (import.meta.main) {
  runHydration().catch((error) => {
    console.error('Fatal error during hydration:', error);
    process.exit(1);
  });
}
