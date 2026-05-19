import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

type Check = {
  file: string;
  label: string;
  needle: string | RegExp;
};

const checks: Check[] = [
  {
    file: "AGENTS.md",
    label: "Codex gate section",
    needle: "## Codex Invocation Gate (MANDATORY)",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "Codex gate section",
    needle: "## Codex Invocation Gate (MANDATORY)",
  },
  {
    file: "AGENTS.override.md",
    label: "Default Codex Startup Role section",
    needle: "## Default Codex Startup Role",
  },
  {
    file: "AGENTS.override.md",
    label: "Brooks default role",
    needle: "Default role: `BROOKS_ARCHITECT`.",
  },
  {
    file: "AGENTS.override.md",
    label: "Brooks primary orchestrator",
    needle: "Brooks is the primary orchestrator",
  },
  {
    file: "AGENTS.override.md",
    label: "Brooks fast hydration contract",
    needle: "## Brooks Fast Hydration Contract",
  },
  {
    file: "AGENTS.override.md",
    label: "30 second hydration budget",
    needle: "Target startup budget: 30 seconds",
  },
  {
    file: "AGENTS.override.md",
    label: "budget is not light hydration",
    needle: "The budget is a cap, not permission to do light hydration.",
  },
  {
    file: "AGENTS.override.md",
    label: "Brooks greeting is project work",
    needle: "A direct\nBrooks, Team RAM, Scout, Woz, Ralph, Allura, status, story, task, memory, or\nproject greeting is not pure casual chat in this repo.",
  },
  {
    file: "AGENTS.md",
    label: "Root fast hydration budget",
    needle: "Fast hydration target: first useful answer within 30 seconds.",
  },
  {
    file: "AGENTS.md",
    label: "Root hydration budget is not thin context",
    needle: "That target is a budget, not permission to thin the context.",
  },
  {
    file: ".agents/TEAM-RAM-RUNTIME.md",
    label: "shared fast hydration budget",
    needle: "## Fast Hydration Budget",
  },
  {
    file: ".agents/TEAM-RAM-RUNTIME.md",
    label: "shared lessons reflections requirement",
    needle: "lessons/reflections",
  },
  {
    file: "_bmad/TEAM-RAM-INTEGRATION.md",
    label: "Kanban team workflow contract",
    needle: "## Kanban Team Workflow",
  },
  {
    file: "_bmad/TEAM-RAM-INTEGRATION.md",
    label: "Kanban board source of truth",
    needle: "Work Board` / `Allura stories Work Items",
  },
  {
    file: "_bmad/TEAM-RAM-INTEGRATION.md",
    label: "Kanban story flow",
    needle: "Backlog -> Ready -> In Progress -> Review -> Done",
  },
  {
    file: "_bmad/TEAM-RAM-INTEGRATION.md",
    label: "BMAD dev story workflow",
    needle: "bmad-dev-story",
  },
  {
    file: "_bmad/TEAM-RAM-INTEGRATION.md",
    label: "BMAD code review workflow",
    needle: "bmad-code-review",
  },
  {
    file: "_bmad/TEAM-RAM-INTEGRATION.md",
    label: "BMAD retrospective workflow",
    needle: "bmad-retrospective",
  },
  {
    file: "_bmad/TEAM-RAM-INTEGRATION.md",
    label: "Story 2.4 first Kanban card",
    needle: "CARD-2.4-E",
  },
  {
    file: "_bmad/FINISH-ALL-EPICS-WORKFLOW.md",
    label: "finish all epics workflow doc",
    needle: "# Finish All Epics: Scout-First Kanban Workflow",
  },
  {
    file: "docs/allura/TEAM-RAM-BMAD-INTEGRATION.md",
    label: "Allura canon finish all epics workflow",
    needle: "Finish All Epics: Scout-First Kanban Workflow",
  },
  {
    file: "docs/allura/TEAM-RAM-BMAD-INTEGRATION.md",
    label: "Allura canon finish all epics workflow artifact",
    needle: "_bmad/FINISH-ALL-EPICS-WORKFLOW.md",
  },
  {
    file: "_bmad/FINISH-ALL-EPICS-WORKFLOW.md",
    label: "finish all epics order",
    needle: "Finish E5 Infrastructure Polish",
  },
  {
    file: "_bmad/FINISH-ALL-EPICS-WORKFLOW.md",
    label: "Scout first real background agent",
    needle: "Scout is the first real background/recon agent for every epic or story batch.",
  },
  {
    file: "_bmad/TEAM-RAM-INTEGRATION.md",
    label: "finish all epics workflow reference",
    needle: "_bmad/FINISH-ALL-EPICS-WORKFLOW.md",
  },
  {
    file: "_bmad/TEAM-RAM-INTEGRATION.md",
    label: "Scout intake gate",
    needle: "Scout Intake Gate",
  },
  {
    file: "AGENTS.override.md",
    label: "Codex override Kanban workflow",
    needle: "## Kanban Team Workflow",
  },
  {
    file: "AGENTS.override.md",
    label: "Codex override Kanban board source",
    needle: "Work Board` / `Allura stories Work Items",
  },
  {
    file: ".agents/TEAM-RAM-RUNTIME.md",
    label: "shared Kanban workflow",
    needle: "## Kanban Team Workflow",
  },
  {
    file: ".agents/TEAM-RAM-RUNTIME.md",
    label: "shared Story 2.4 first card",
    needle: "CARD-2.4-E",
  },
  {
    file: "AGENTS.override.md",
    label: "Codex override finish all epics reference",
    needle: "_bmad/FINISH-ALL-EPICS-WORKFLOW.md",
  },
  {
    file: ".agents/TEAM-RAM-RUNTIME.md",
    label: "shared finish all epics reference",
    needle: "_bmad/FINISH-ALL-EPICS-WORKFLOW.md",
  },
  {
    file: "AGENTS.md",
    label: "root finish all epics reference",
    needle: "_bmad/FINISH-ALL-EPICS-WORKFLOW.md",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "opencode finish all epics reference",
    needle: "_bmad/FINISH-ALL-EPICS-WORKFLOW.md",
  },
  {
    file: ".codex/config.toml",
    label: "Codex default agent convention",
    needle: /default_agent\s*=\s*"BROOKS_ARCHITECT"/,
  },
  {
    file: ".codex/config.toml",
    label: "Codex startup hydration budget",
    needle: /startup_hydration_budget_sec\s*=\s*30/,
  },
  {
    file: ".codex/config.toml",
    label: "Codex minimum Brain hydration",
    needle: "allura_brain_search",
  },
  {
    file: ".codex/config.toml",
    label: "Codex minimum lessons hydration",
    needle: "recent_lessons_reflections",
  },
  {
    file: ".codex/config.toml",
    label: "Codex Kanban source of truth",
    needle: /kanban_source_of_truth\s*=\s*"notion_work_board"/,
  },
  {
    file: ".codex/config.toml",
    label: "Codex Kanban workflow name",
    needle: /kanban_workflow_name\s*=\s*"Finish All Epics: Scout-First Kanban Workflow"/,
  },
  {
    file: ".codex/config.toml",
    label: "Codex Kanban story flow",
    needle: "Backlog\", \"Ready\", \"In Progress\", \"Review\", \"Done",
  },
  {
    file: ".codex/config.toml",
    label: "Codex Story 2.4 first card",
    needle: /story_2_4_first_card\s*=\s*"CARD-2\.4-E"/,
  },
  {
    file: ".codex/config.toml",
    label: "Codex finish all epics workflow",
    needle: /finish_all_epics_workflow\s*=\s*"_bmad\/FINISH-ALL-EPICS-WORKFLOW\.md"/,
  },
  {
    file: ".codex/config.toml",
    label: "Codex finish all epics order starts with review debt",
    needle: "current_review_debt",
  },
  {
    file: ".codex/config.toml",
    label: "Codex Scout first real agent",
    needle: /scout_first_real_agent\s*=\s*true/,
  },
  {
    file: ".codex/config.toml",
    label: "Codex Scout fallback phrase",
    needle: "Scout-style hydration only",
  },
  {
    file: "AGENTS.md",
    label: "canonical Brooks source",
    needle: ".opencode/agent/core/brooks.md",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "canonical Brooks source",
    needle: ".opencode/agent/core/brooks.md",
  },
  {
    file: "AGENTS.md",
    label: "Codex adapter source",
    needle: ".codex/agents/brooks.toml",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "Codex adapter source",
    needle: ".codex/agents/brooks.toml",
  },
  {
    file: "AGENTS.md",
    label: "team-ram-cowork required",
    needle: "team-ram-cowork",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "team-ram-cowork required",
    needle: "team-ram-cowork",
  },
  {
    file: "AGENTS.override.md",
    label: "team-ram-cowork required",
    needle: "team-ram-cowork",
  },
  {
    file: "AGENTS.md",
    label: "allura-memory-skill required",
    needle: "allura-memory-skill",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "allura-memory-skill required",
    needle: "allura-memory-skill",
  },
  {
    file: "AGENTS.override.md",
    label: "allura-memory-skill required",
    needle: "allura-memory-skill",
  },
  {
    file: "AGENTS.md",
    label: "allura-system namespace",
    needle: /group_id\s*=\s*allura-system/,
  },
  {
    file: ".opencode/AGENTS.md",
    label: "allura-system namespace",
    needle: /group_id\s*=\s*allura-system/,
  },
  {
    file: "AGENTS.override.md",
    label: "allura-system namespace",
    needle: /group_id/,
  },
  {
    file: "AGENTS.md",
    label: "Brooks receipt",
    needle: "Brooks active.",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "Brooks receipt",
    needle: "Brooks active.",
  },
  {
    file: "AGENTS.override.md",
    label: "Brooks receipt",
    needle: "Brooks active.",
  },
  {
    file: "AGENTS.md",
    label: "Scout hydration receipt",
    needle: "Scout hydration:",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "Scout hydration receipt",
    needle: "Scout hydration:",
  },
  {
    file: "AGENTS.override.md",
    label: "Scout hydration receipt",
    needle: "Scout hydration:",
  },
  {
    file: "AGENTS.md",
    label: "RuVix receipt",
    needle: "RuVix:",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "RuVix receipt",
    needle: "RuVix:",
  },
  {
    file: "AGENTS.override.md",
    label: "RuVix receipt",
    needle: "RuVix:",
  },
  {
    file: ".codex/agents/brooks.toml",
    label: "canonical Brooks source in adapter",
    needle: ".opencode/agent/core/brooks.md",
  },
  {
    file: ".codex/agents/brooks.toml",
    label: "team-ram-cowork in adapter",
    needle: "team-ram-cowork",
  },
  {
    file: ".codex/agents/brooks.toml",
    label: "allura-memory-skill in adapter",
    needle: "allura-memory-skill",
  },
  {
    file: ".codex/agents/brooks.toml",
    label: "allura-system namespace in adapter",
    needle: /group_id\s*=\s*allura-system/,
  },
  {
    file: ".codex/agents/brooks.toml",
    label: "runtime honesty in adapter",
    needle: "Never claim Scout, Woz, OpenCode, OpenClaw, Claude, or another runtime/subagent actually ran",
  },
];

const ruvixPrimitives = ["mutate", "attest", "verify", "isolate", "sandbox", "audit"];
for (const primitive of ruvixPrimitives) {
  checks.push(
    {
      file: "AGENTS.md",
      label: `RuVix primitive in AGENTS: ${primitive}`,
      needle: new RegExp(`- ${primitive}:`),
    },
    {
      file: ".opencode/AGENTS.md",
      label: `RuVix primitive in .opencode/AGENTS: ${primitive}`,
      needle: new RegExp(`- ${primitive}:`),
    },
    {
      file: "AGENTS.override.md",
      label: `RuVix primitive in AGENTS.override: ${primitive}`,
      needle: new RegExp(`- ${primitive}:`),
    },
    {
      file: ".codex/agents/brooks.toml",
      label: `RuVix primitive in Brooks adapter: ${primitive}`,
      needle: new RegExp(`- ${primitive}:`),
    },
  );
}

const failures: string[] = [];

for (const check of checks) {
  const filePath = join(root, check.file);
  const content = readFileSync(filePath, "utf8");
  const passed =
    typeof check.needle === "string"
      ? content.includes(check.needle)
      : check.needle.test(content);

  if (!passed) {
    failures.push(`${check.file}: missing ${check.label}`);
  }
}

if (failures.length > 0) {
  console.error("Codex governance gate validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Codex governance gate validation passed.");
