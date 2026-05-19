/**
 * Agent Manifest — Single source of truth for the live Team RAM surface.
 *
 * This module consolidates:
 *   1. `.opencode/agent/` persona definitions (18 agents)
 *   2. `scripts/agents/` executable scripts for the CI-routed subset
 *   3. `.opencode/rules/agent-routing.md` routing and model policy
 *
 * The canonical IDs are the Team RAM persona IDs used across the repo.
 * CI metadata is layered on top for the smaller subset of agents that run on
 * GitHub events.
 *
 * @module agent-manifest
 */

export type AgentCategory = "primary" | "core" | "code" | "support" | "utility";

export type CiEventName = "pull_request" | "push" | "issues";

export interface CiRoute {
  event: CiEventName;
  action: string;
}

export interface AgentManifestEntry {
  id: string;
  persona: string;
  role: string;
  category: AgentCategory;
  scriptPath?: string;
  ciRoutes: CiRoute[];
  description: string;
  primaryModel?: string;
  fallbackModel?: string;
}

const manifestEntries: Array<AgentManifestEntry> = [
  {
    id: "brooks",
    persona: "Frederick P. Brooks Jr.",
    role: "Chief Architect",
    category: "primary",
    scriptPath: "scripts/agents/brooks-triage.ts",
    ciRoutes: [
      { event: "issues", action: "opened" },
      { event: "issues", action: "edited" },
    ],
    primaryModel: "openai/gpt-5.4",
    description:
      "Architectural integrity owner. Final sign-off on architecture and routing policy. Routes issue events for triage.",
  },
  {
    id: "jobs",
    persona: "Steve Jobs",
    role: "Intent Gate",
    category: "primary",
    ciRoutes: [],
    primaryModel: "ollama-cloud/kimi-k2.5",
    description:
      "Converts requests into crisp objectives, constraints, and acceptance criteria. No execution until intent is signed off.",
  },
  {
    id: "pike",
    persona: "Rob Pike",
    role: "Interface Review",
    category: "core",
    scriptPath: "scripts/agents/pike-interface-review.ts",
    ciRoutes: [
      { event: "pull_request", action: "opened" },
      { event: "pull_request", action: "synchronize" },
      { event: "pull_request", action: "reopened" },
    ],
    primaryModel: "openai/gpt-5.4-mini",
    description:
      "Reviews surface area, concurrency hazards, and API ergonomics. Detects breaking changes and interface drift.",
  },
  {
    id: "fowler",
    persona: "Martin Fowler",
    role: "Refactor Gate",
    category: "core",
    scriptPath: "scripts/agents/fowler-refactor-gate.ts",
    ciRoutes: [{ event: "push", action: "*" }],
    primaryModel: "ollama-cloud/glm-5.1",
    description:
      "Ensures changes are incremental, reversible, and do not add debt. Routes push events for refactor review.",
  },
  {
    id: "scout",
    persona: "Scout",
    role: "Recon",
    category: "core",
    ciRoutes: [],
    primaryModel: "openai/gpt-5.3-codex-spark",
    fallbackModel: "ollama-cloud/nemotron-3-super",
    description:
      "Fast recon and discovery agent. Scans repos, finds paths, patterns, and configs. Produces Scout Report so nobody guesses.",
  },
  {
    id: "hightower",
    persona: "Kelsey Hightower",
    role: "DevOps Specialist",
    category: "core",
    ciRoutes: [],
    primaryModel: "openai/gpt-5.4",
    description:
      "CI/CD, infrastructure, deployment, and observability. If it cannot be deployed in one command, it is not done.",
  },
  {
    id: "woz",
    persona: "Steve Wozniak",
    role: "Builder",
    category: "code",
    ciRoutes: [],
    primaryModel: "ollama-cloud/qwen3-coder-next",
    description:
      "Primary builder. Implements the Brooks plan with minimal ceremony. Ships working code, tests, and clean diffs.",
  },
  {
    id: "bellard",
    persona: "Fabrice Bellard",
    role: "Perf Diagnostics",
    category: "code",
    ciRoutes: [],
    primaryModel: "ollama-cloud/glm-5.1",
    description:
      "Performance and deep diagnostics specialist. Measurement-first when low-level weirdness appears.",
  },
  {
    id: "carmack",
    persona: "John Carmack",
    role: "Performance Specialist",
    category: "code",
    ciRoutes: [],
    primaryModel: "ollama-cloud/qwen3-coder-next",
    description:
      "Performance specialist for optimization, API design, and latency reduction under hard constraints.",
  },
  {
    id: "knuth",
    persona: "Donald Knuth",
    role: "Data Architect",
    category: "code",
    scriptPath: "scripts/agents/knuth-analyze.ts",
    ciRoutes: [{ event: "push", action: "*" }],
    primaryModel: "ollama-cloud/glm-5.1",
    description:
      "Data architect and schema specialist. Owns query optimization, migration correctness, and analytical rigor.",
  },
  {
    id: "norvig",
    persona: "Peter Norvig",
    role: "Reasoner",
    category: "support",
    ciRoutes: [],
    primaryModel: "ollama-cloud/glm-5.1",
    fallbackModel: "ollama-cloud/glm-5.1",
    description:
      "Reasoning, planning, and deep logic. Decomposes complex problems and validates argument structures before execution.",
  },
  {
    id: "hassabis",
    persona: "Demis Hassabis",
    role: "Context Holder",
    category: "support",
    ciRoutes: [],
    primaryModel: "ollama-cloud/glm-5.1",
    fallbackModel: "ollama-cloud/glm-5.1",
    description:
      "Context holder and big-picture strategist. Maintains the full system mental model and identifies cross-cutting concerns.",
  },
  {
    id: "karpathy",
    persona: "Andrej Karpathy",
    role: "Knowledge Oracle",
    category: "support",
    ciRoutes: [],
    primaryModel: "ollama-cloud/glm-5.1",
    fallbackModel: "ollama-cloud/glm-5.1",
    description:
      "Knowledge and ML/AI expertise. Answers technical questions about AI systems and neural architecture patterns.",
  },
  {
    id: "jim-simons",
    persona: "Jim Simons",
    role: "Memory Specialist",
    category: "support",
    ciRoutes: [],
    primaryModel: "ollama-cloud/glm-5.1",
    fallbackModel: "ollama-cloud/glm-5.1",
    description:
      "Memory retrieval and data pattern discovery specialist. Finds signal in episodic and semantic history.",
  },
  {
    id: "fei-fei-li-vision",
    persona: "Fei-Fei Li",
    role: "Vision Specialist",
    category: "support",
    ciRoutes: [],
    primaryModel: "openai/gpt-5.4-mini",
    fallbackModel: "openai/gpt-5.4-mini",
    description:
      "Vision and multimodal analysis specialist. Processes images, diagrams, screenshots, and visual evidence.",
  },
  {
    id: "sutskever",
    persona: "Ilya Sutskever",
    role: "Strategy Specialist",
    category: "support",
    ciRoutes: [],
    primaryModel: "ollama-cloud/glm-5.1",
    fallbackModel: "ollama-cloud/glm-5.1",
    description:
      "Strategy and alignment specialist. Thinks about safety, long-term consequences, and system evolution.",
  },
  {
    id: "torvalds",
    persona: "Linus Torvalds",
    role: "Critique Gate",
    category: "support",
    ciRoutes: [],
    primaryModel: "openai/gpt-5.4-mini",
    fallbackModel: "openai/gpt-5.4-mini",
    description:
      "Critique and validation specialist. Brutal correctness enforcement with zero tolerance for hand-waving.",
  },
  {
    id: "operator",
    persona: "Operator",
    role: "Subtask Helper",
    category: "utility",
    ciRoutes: [],
    primaryModel: "openai/gpt-5.4-mini",
    fallbackModel: "openai/gpt-5.4-mini",
    description:
      "Utility helper for precisely delegated micro-tasks. No independent decision-making.",
  },
];

export const AGENT_MANIFEST: ReadonlyMap<string, AgentManifestEntry> =
  new Map(manifestEntries.map((entry) => [entry.id, entry]));

export const AGENT_IDS: ReadonlyArray<string> = Array.from(AGENT_MANIFEST.keys());

export const CI_AGENTS: ReadonlyArray<AgentManifestEntry> = manifestEntries.filter(
  (entry) => entry.scriptPath !== undefined
);

export const AGENTS_BY_CATEGORY: ReadonlyMap<AgentCategory, ReadonlyArray<AgentManifestEntry>> =
  new Map(
    (["primary", "core", "code", "support", "utility"] as const).map((category) => [
      category,
      manifestEntries.filter((entry) => entry.category === category),
    ])
  );

export function getAgentById(id: string): AgentManifestEntry {
  const entry = AGENT_MANIFEST.get(id);
  if (!entry) {
    throw new Error(`Agent not found in manifest: "${id}". Available: ${AGENT_IDS.join(", ")}`);
  }
  return entry;
}

export function getAgentsForEvent(
  event: CiEventName,
  action: string
): ReadonlyArray<AgentManifestEntry> {
  return manifestEntries.filter((entry) =>
    entry.ciRoutes.some(
      (route) => route.event === event && (route.action === "*" || route.action === action)
    )
  );
}
