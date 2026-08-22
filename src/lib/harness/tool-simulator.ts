/**
 * Story 24.5 — Tool Simulator: fixture matching and fault injection.
 *
 * Matches tool calls against ordered/unordered fixtures and returns
 * the fixture response or injects the declared error.
 */
import type { ScenarioFixture } from "./scenario";

export interface ToolCall {
  tool_name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  result?: unknown;
  error?: { code: string; message: string };
}

export class ToolSimulator {
  private orderedIndex = 0;
  private readonly fixtures: ScenarioFixture["tool_fixtures"];
  private readonly consumed = new Set<number>();

  constructor(fixtures: ScenarioFixture["tool_fixtures"]) {
    this.fixtures = fixtures;
  }

  async call(call: ToolCall): Promise<ToolResult> {
    const fixture = this.findFixture(call);
    if (!fixture) {
      return { error: { code: "TOOL_ERROR", message: `No fixture for tool '${call.tool_name}'` } };
    }

    if (fixture.latency_ms) {
      // In deterministic mode, latency is recorded but not actually slept
      // (network is disabled per AC-2)
    }

    if (fixture.error) {
      return { error: { code: fixture.error.code, message: fixture.error.message ?? fixture.error.code } };
    }

    return { result: fixture.response?.result ?? { ok: true } };
  }

  private findFixture(call: ToolCall): ScenarioFixture["tool_fixtures"][number] | undefined {
    // Ordered fixtures: must be consumed in declaration order
    for (let i = 0; i < this.fixtures.length; i++) {
      const f = this.fixtures[i];
      if (f.match === "ordered") {
        if (this.consumed.has(i)) continue;
        if (f.tool_name === call.tool_name) {
          this.consumed.add(i);
          return f;
        }
        // Ordered fixture mismatch → error, not skip
        return undefined;
      }
    }

    // Unordered fixtures: match any unconsumed
    for (let i = 0; i < this.fixtures.length; i++) {
      const f = this.fixtures[i];
      if (f.match === "unordered" && !this.consumed.has(i) && f.tool_name === call.tool_name) {
        this.consumed.add(i);
        return f;
      }
    }

    return undefined;
  }

  get allConsumed(): boolean {
    return this.consumed.size === this.fixtures.length;
  }
}