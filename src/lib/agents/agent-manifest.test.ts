import { describe, expect, it } from "vitest";
import {
  AGENT_IDS,
  AGENT_MANIFEST,
  CI_AGENTS,
  getAgentById,
  getAgentsForEvent,
} from "./agent-manifest";

const TEAM_RAM_IDS = [
  "brooks",
  "jobs",
  "pike",
  "fowler",
  "scout",
  "woz",
  "bellard",
  "carmack",
  "knuth",
  "hightower",
  "norvig",
  "hassabis",
  "karpathy",
  "jim-simons",
  "fei-fei-li-vision",
  "sutskever",
  "torvalds",
  "operator",
] as const;

const LEGACY_OMO_IDS = ["turing", "berners-lee", "hopper", "cerf", "liskov", "dijkstra", "hinton"];

describe("Agent Manifest — Team RAM surface", () => {
  it("contains exactly the 18 live Team RAM agents", () => {
    expect(AGENT_IDS).toHaveLength(18);
    expect([...AGENT_IDS].sort()).toEqual([...TEAM_RAM_IDS].sort());
  });

  it("does not contain legacy OMO ids", () => {
    for (const id of LEGACY_OMO_IDS) {
      expect(AGENT_IDS).not.toContain(id);
    }
  });

  it("keeps torvalds as an active Team RAM agent", () => {
    expect(AGENT_MANIFEST.has("torvalds")).toBe(true);
  });
});

describe("Agent Manifest — identity and models", () => {
  it("has a primary model on every live agent", () => {
    for (const id of TEAM_RAM_IDS) {
      const entry = getAgentById(id);
      expect(entry.primaryModel).toBeDefined();
      expect(entry.primaryModel).not.toBe("");
    }
  });

  it("matches key routing expectations", () => {
    expect(getAgentById("brooks").primaryModel).toBe("openai/gpt-5.4");
    expect(getAgentById("scout").primaryModel).toBe("openai/gpt-5.3-codex-spark");
    expect(getAgentById("scout").fallbackModel).toBe("ollama-cloud/nemotron-3-super");
    expect(getAgentById("woz").primaryModel).toBe("ollama-cloud/qwen3-coder-next");
    expect(getAgentById("norvig").primaryModel).toBe("ollama-cloud/glm-5.1");
    expect(getAgentById("torvalds").primaryModel).toBe("openai/gpt-5.4-mini");
  });

  it("preserves explicit fallback models from the live surface", () => {
    const expectedFallbacks: Record<string, string | undefined> = {
      brooks: undefined,
      jobs: undefined,
      pike: undefined,
      fowler: undefined,
      scout: "ollama-cloud/nemotron-3-super",
      woz: undefined,
      bellard: undefined,
      carmack: undefined,
      knuth: undefined,
      hightower: undefined,
      norvig: "ollama-cloud/glm-5.1",
      hassabis: "ollama-cloud/glm-5.1",
      karpathy: "ollama-cloud/glm-5.1",
      "jim-simons": "ollama-cloud/glm-5.1",
      "fei-fei-li-vision": "openai/gpt-5.4-mini",
      sutskever: "ollama-cloud/glm-5.1",
      torvalds: "openai/gpt-5.4-mini",
      operator: "openai/gpt-5.4-mini",
    };

    for (const [id, expectedFallback] of Object.entries(expectedFallbacks)) {
      expect(getAgentById(id).fallbackModel).toBe(expectedFallback);
    }
  });
});

describe("Agent Manifest — CI routing", () => {
  it("routes pull_request events to pike", () => {
    const agents = getAgentsForEvent("pull_request", "opened").map((agent) => agent.id);
    expect(agents).toContain("pike");
  });

  it("routes issues events to brooks", () => {
    const agents = getAgentsForEvent("issues", "opened").map((agent) => agent.id);
    expect(agents).toContain("brooks");
  });

  it("lists CI agents correctly", () => {
    const ciAgentIds = CI_AGENTS.map((agent) => agent.id);
    expect(ciAgentIds.sort()).toEqual(["brooks", "fowler", "knuth", "pike"].sort());
  });
});

describe("Agent Manifest — getAgentById", () => {
  it("throws for unknown agent ids", () => {
    expect(() => getAgentById("unknown-agent")).toThrow("Agent not found");
  });

  it("throws for legacy OmO ids", () => {
    expect(() => getAgentById("dijkstra")).toThrow("Agent not found");
    expect(() => getAgentById("turing")).toThrow("Agent not found");
  });
});
