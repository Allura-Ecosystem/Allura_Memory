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
    file: "AGENTS.md",
    label: "Codex startup role section",
    needle: "## Codex Invocation Gate (MANDATORY)",
  },
  {
    file: ".codex/agents/brooks.toml",
    label: "Brooks default role",
    needle: "name = \"brooks\"",
  },
  {
    file: "AGENTS.md",
    label: "Brooks primary orchestrator",
    needle: "Codex treats `.opencode/agent/core/brooks.md` as the canonical Brooks behavior.",
  },
  {
    file: "AGENTS.md",
    label: "Brooks fast hydration contract",
    needle: "Fast hydration target: first useful answer within 30 seconds.",
  },
  {
    file: "AGENTS.md",
    label: "30 second hydration budget",
    needle: "Fast hydration target: first useful answer within 30 seconds.",
  },
  {
    file: "AGENTS.md",
    label: "budget is not light hydration",
    needle: "That target is a budget, not permission to thin the context.",
  },
  {
    file: "AGENTS.md",
    label: "Brooks greeting is project work",
    needle: "Codex must run this gate before answering or routing when Ronin invokes Brooks",
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
    needle: "## 1. Hydrate before answering",
  },
  {
    file: ".agents/TEAM-RAM-RUNTIME.md",
    label: "shared lessons reflections requirement",
    needle: "## 5. Log outcomes",
  },
  {
    file: "guidelines/AI-GUIDELINES.md",
    label: "Allura Adaptive Delivery contract",
    needle: "## 10. Allura Adaptive Delivery (Allura / Team RAM)",
  },
  {
    file: "guidelines/AI-GUIDELINES.md",
    label: "Adaptive Delivery sequence",
    needle: "Intent → Hydrate → Classify → Route → Build/review → Validate → Reconcile → Log",
  },
  {
    file: "guidelines/AI-GUIDELINES.md",
    label: "retired methodology boundary",
    needle: "not an active Allura workflow dependency",
  },
  {
    file: "guidelines/AI-GUIDELINES.md",
    label: "read-only legacy archive",
    needle: "read-only historical lineage",
  },
  {
    file: "guidelines/AI-GUIDELINES.md",
    label: "status approval boundary",
    needle: "Notion syncs and any change to `Done` or `Approved` require action-specific human approval",
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
    file: ".opencode/agent/core/brooks.md",
    label: "team-ram-cowork in canonical Brooks runtime",
    needle: "team-ram-cowork",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "team-ram-cowork required",
    needle: "team-ram-cowork",
  },
  {
    file: "AGENTS.md",
    label: "team-ram-cowork required",
    needle: "team-ram-cowork",
  },
  {
    file: ".opencode/agent/core/brooks.md",
    label: "allura-memory-skill in canonical Brooks runtime",
    needle: "allura-memory-skill",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "allura-memory-skill required",
    needle: "allura-memory-skill",
  },
  {
    file: "AGENTS.md",
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
    file: ".codex/agents/brooks.toml",
    label: "allura-system namespace in Codex adapter",
    needle: /group_id:\s*"allura-system"/,
  },
  {
    file: ".opencode/agent/core/brooks.md",
    label: "Adaptive Delivery in canonical Brooks runtime",
    needle: "## Allura Adaptive Delivery Runtime",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "Brooks receipt",
    needle: "Brooks active.",
  },
  {
    file: "AGENTS.md",
    label: "Brooks receipt",
    needle: "Brooks active.",
  },
  {
    file: ".agents/TEAM-RAM-RUNTIME.md",
    label: "Scout hydration in shared runtime",
    needle: "Scout hydrates from Allura Brain",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "Scout hydration receipt",
    needle: "Scout hydration:",
  },
  {
    file: "AGENTS.md",
    label: "Scout hydration receipt",
    needle: "Scout hydration:",
  },
  {
    file: ".opencode/agent/core/brooks.md",
    label: "RuVix receipt in canonical Brooks runtime",
    needle: "RuVix:",
  },
  {
    file: ".opencode/AGENTS.md",
    label: "RuVix receipt",
    needle: "RuVix:",
  },
  {
    file: "AGENTS.md",
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
    needle: /group_id:\s*"allura-system"/,
  },
  {
    file: ".codex/agents/brooks.toml",
    label: "runtime honesty in adapter",
    needle: "Never claim a runtime, subagent, search, test, or memory operation occurred",
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
      file: ".opencode/agent/core/brooks.md",
      label: `RuVix primitive in canonical Brooks runtime: ${primitive}`,
      needle: new RegExp(`- ${primitive}:`),
    },
    {
      file: ".codex/agents/brooks.toml",
      label: `RuVix primitive in Codex adapter: ${primitive}`,
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
