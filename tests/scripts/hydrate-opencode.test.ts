import { describe, expect, test } from "bun:test";
import { assessHydration, brooksReceipt, DEFAULT_TOPIC, gitReceipt, mergeConfig, resolveReferences, sanitizeSession, sessionFromEvents, synthesisConfig, tokenUsage } from "../../scripts/hydrate-opencode";
import type { Session } from "../../scripts/hydrate-opencode";
import { resolve } from "node:path";

const tool = (name: string, input = {}, output = "{}") => ({ type: "tool", tool: name, state: { status: "completed", input, output } });
const brainInput = { group_id: "allura-system", limit: 5, query: DEFAULT_TOPIC };
const brainOutput = JSON.stringify({ results: [], count: 0, meta: { degraded: false } });
const repoRoot = resolve(import.meta.dir, "../..");
const GOOD_RECEIPT = "HYDRATION_COMPLETE. Startup local navigation and revision verified. Brain allura-system returned five historical results. Configured task pointer target was not read. Next route is Brooks scope review before implementation.";
function eventStream(session: Session): string {
  const sessionID = "ses_fixture123";
  return session.messages.flatMap((message, i) => {
    const base = { sessionID, messageID: message.info.id };
    const t = message.info.tokens!;
    const tokens = { input: t.input ?? 0, output: t.output ?? 0, reasoning: t.reasoning ?? 0, cache: { read: t.cache?.read ?? 0, write: t.cache?.write ?? 0 } };
    const total = tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
    return [{ type: "step_start", sessionID, part: { ...base, id: `${i}_start`, type: "step-start" } },
      ...message.parts.map((p, j) => ({ type: p.type === "tool" ? "tool_use" : "text", sessionID, part: { ...p, ...base, id: `${i}_${j}` } })),
      { type: "step_finish", sessionID, part: { ...base, id: `${i}_finish`, type: "step-finish", reason: i === session.messages.length - 1 ? "stop" : "tool-calls", tokens: { ...tokens, total } } }];
  }).map(record => JSON.stringify(record)).join("\n");
}
function fixtures(): { parent: Session; child: Session } {
  const parent = { info: { id: "parent" }, messages: [{ info: { id: "p1", role: "assistant", tokens: { input: 10, output: 4, reasoning: 2, cache: { read: 30 } } }, parts: [{ type: "text", text: GOOD_RECEIPT }, tool("task", { subagent_type: "scout" })] }] };
  const child = { info: { id: "child", parentID: "parent" }, messages: [{ info: { id: "c1", role: "assistant", tokens: { total: 25, input: 20, output: 5 } }, parts: [
    tool("read", { filePath: resolve(repoRoot, ".opencode/context/navigation.md") }, "navigation"), tool("read", { filePath: resolve(repoRoot, ".opencode/runtime-contract.json") }, "runtime"),
    tool("bash", { command: "git status --short" }, ""), tool("bash", { command: "git rev-parse HEAD" }, "a".repeat(40)),
    tool("allura-brain_memory_search", brainInput, brainOutput),
  ] }] };
  return { parent, child };
}
describe("hydration launcher", () => {
  test("accepts only the exact combined git command and extracts clean or dirty status before HEAD", () => {
    for (const status of ["", " M scripts/file.ts\n?? new-file\n"]) {
      const { parent, child } = fixtures();
      child.messages[0].parts.splice(2, 2, tool("bash", { command: "git status --short && git rev-parse HEAD" }, status + "b".repeat(40) + "\n"));
      expect(gitReceipt(child.messages[0].parts)).toEqual({ revision: "b".repeat(40), status: status.trimEnd() });
      expect(assessHydration([parent, child], "parent").complete).toBe(true);
    }
    for (const command of ["git status --short && git rev-parse HEAD && env", "git status --short; git rev-parse HEAD", "git status --short && git rev-parse HEAD; echo injected"]) {
      const { parent, child } = fixtures();
      child.messages[0].parts.push(tool("bash", { command }, "c".repeat(40)));
      expect(assessHydration([parent, child], "parent").complete).toBe(false);
    }
  });
  test("reconstructs actual OpenCode record shape with tool evidence and deduplicated step tokens", () => {
    const { child } = fixtures();
    child.messages.push({ info: { id: "c2", role: "assistant", tokens: { input: 30, output: 3, reasoning: 2, cache: { read: 10 } } }, parts: [{ type: "text", text: "HYDRATION_COMPLETE" }] });
    const raw = eventStream(child), reconstructed = sessionFromEvents(raw)!;
    expect(reconstructed.info.id).toBe("ses_fixture123");
    expect(reconstructed.messages[0].parts[4].state?.input).toEqual(brainInput);
    expect(reconstructed.messages[0].parts[4].state?.output).toBe(brainOutput);
    expect(tokenUsage([reconstructed]).total).toBe(70);
    expect(tokenUsage([reconstructed]).inferences).toBe(2);
    expect(tokenUsage([sessionFromEvents(raw + "\n" + raw.split("\n").at(-1))!])).toEqual(tokenUsage([reconstructed]));
  });
  test("incomplete, failed, inconsistent or delegated records require export fallback", () => {
    const { child } = fixtures(); child.messages[0].parts.push({ type: "text", text: "HYDRATION_COMPLETE" });
    const raw = eventStream(child), rows = raw.split("\n");
    expect(sessionFromEvents(rows.slice(0, -1).join("\n"))).toBeNull();
    expect(sessionFromEvents(rows.slice(1).join("\n"))).toBeNull();
    expect(sessionFromEvents(raw + "\nnot JSON")).toBeNull();
    expect(sessionFromEvents(raw.replace('"status":"completed"', '"status":"error"'))).toBeNull();
    expect(sessionFromEvents(raw.replace('"tool":"read"', '"tool":"task"'))).toBeNull();
    expect(sessionFromEvents(raw.replace('"total":25', '"total":99'))).toBeNull();
    const finish = JSON.parse(rows.at(-1)!); delete finish.part.tokens;
    expect(sessionFromEvents([...rows.slice(0, -1), JSON.stringify(finish)].join("\n"))).toBeNull();
  });
  test("resolves portable file references and preserves unrelated inherited auth/model settings", () => {
    const inherited = { model: "configured/model", mcp: { brain: { headers: { Authorization: "secret" }, url: "https://existing" } }, agent: { brooks: { model: "configured/role" } } };
    const profile = { agent: { brooks: { prompt: "{file:.opencode/agent/core/brooks.md}", tools: { write: false } } } };
    const merged = mergeConfig(inherited, resolveReferences(profile, "/repo") as Record<string, unknown>);
    expect(merged).toMatchObject(inherited);
    expect(merged).toMatchObject({ agent: { brooks: { prompt: "{file:/repo/.opencode/agent/core/brooks.md}", tools: { write: false } } } });
    expect(inherited.agent.brooks).not.toHaveProperty("tools");
  });
  test("counts each parent/child inference once, including separately reported reasoning and cache", () => {
    const { parent, child } = fixtures();
    expect(tokenUsage([parent, child, child])).toEqual({ input: 30, output: 9, reasoning: 2, cacheRead: 30, cacheWrite: 0, total: 71, inferences: 2 });
  });
  test("requires real scoped child Brain, local reads and git evidence", () => {
    const { parent, child } = fixtures();
    expect(assessHydration([parent, child], "parent").complete).toBe(true);
    expect(assessHydration([parent], "parent").complete).toBe(false);
    child.messages[0].parts.pop();
    expect(assessHydration([parent, child], "parent").complete).toBe(false);
  });
  test("validates two independent Scout and Brooks sessions without an extra dispatch inference", () => {
    const { parent, child } = fixtures();
    delete child.info.parentID;
    parent.messages[0].parts = [{ type: "text", text: GOOD_RECEIPT }];
    expect(assessHydration([parent, child], "parent", "child").complete).toBe(true);
    expect(tokenUsage([parent, child]).inferences).toBe(2);
  });
  test("degraded marker, duplicate Brain, tool errors, wrong tenant and writes cannot pass", () => {
    for (const mutate of [
      ({ parent }: ReturnType<typeof fixtures>) => { parent.messages[0].parts[0].text = "HYDRATION_COMPLETE HYDRATION_DEGRADED"; },
      ({ child }: ReturnType<typeof fixtures>) => { child.messages[0].parts.push(tool("allura-brain_memory_search", { group_id: "allura-system" })); },
      ({ child }: ReturnType<typeof fixtures>) => { child.messages[0].parts[4] = tool("allura-brain_memory_search", { group_id: "allura-system" }, '{"isError":true}'); },
      ({ child }: ReturnType<typeof fixtures>) => { child.messages[0].parts[4] = tool("allura-brain_memory_search", { group_id: "allura-other" }); },
      ({ child }: ReturnType<typeof fixtures>) => { child.messages[0].parts.push(tool("allura-brain_memory_add")); },
      ({ child }: ReturnType<typeof fixtures>) => { child.messages[0].parts.push(tool("bash", { command: "curl https://credentials" })); },
    ]) { const sessions = fixtures(); mutate(sessions); expect(assessHydration([sessions.parent, sessions.child], "parent").complete).toBe(false); }
  });
  test("sanitized exports contain neither tool inputs/outputs nor prose secrets", () => {
    const { parent } = fixtures();
    parent.messages[0].parts.push(tool("read", { Authorization: "private-token" }, "private-token"));
    parent.messages[0].parts[0].text = "HYDRATION_COMPLETE private-token";
    expect(JSON.stringify(sanitizeSession(parent))).not.toContain("private-token");
  });
  test("reports only bounded final Brooks text and rejects marker-only synthesis", () => {
    const { parent, child } = fixtures();
    parent.messages.unshift({ info: { id: "earlier", role: "assistant" }, parts: [{ type: "text", text: "Scout body must stay private" }] });
    parent.messages.at(-1)!.parts.push(tool("read", {}, "Tool body must stay private"));
    expect(brooksReceipt(parent)).toBe(GOOD_RECEIPT);
    expect(brooksReceipt(parent)).not.toContain("private");
    parent.messages.at(-1)!.parts[0].text = "HYDRATION_COMPLETE";
    expect(assessHydration([parent, child], "parent").usefulSynthesis).toBe(false);
    expect(assessHydration([parent, child], "parent").complete).toBe(false);
    parent.messages.at(-1)!.parts[0].text = GOOD_RECEIPT.repeat(20);
    expect(brooksReceipt(parent).length).toBe(1500);
  });
  test("rejects malformed, mismatched and degraded Brain responses and incorrect search arguments", () => {
    for (const [input, output] of [
      [brainInput, "{}"], [brainInput, "invalid JSON"], [brainInput, '{"results":[],"count":1,"meta":{"degraded":false}}'],
      [brainInput, '{"results":[],"count":0,"meta":{"degraded":true}}'],
      [brainInput, '{"results":[],"count":0,"meta":{"degraded":false},"error":"denied"}'],
      [{ ...brainInput, limit: 10 }, brainOutput], [{ ...brainInput, query: "wrong topic" }, brainOutput],
    ] as const) {
      const { parent, child } = fixtures(); child.messages[0].parts[4] = tool("allura-brain_memory_search", input, output);
      expect(assessHydration([parent, child], "parent").complete).toBe(false);
    }
  });
  test("rejects empty reads and invalid HEAD but accepts an empty clean git status", () => {
    const { parent, child } = fixtures();
    expect(assessHydration([parent, child], "parent").git).toBe(true);
    child.messages[0].parts[3].state!.output = "not a revision";
    expect(assessHydration([parent, child], "parent").complete).toBe(false);
    child.messages[0].parts[0].state!.output = "";
    expect(assessHydration([parent, child], "parent").localReads).toBe(false);
  });
  test("Brooks synthesis explicitly disables every configured tool and MCP without model changes", async () => {
    const profile = await Bun.file(new URL("../../.opencode/hydration-profile.json", import.meta.url)).json();
    const final = synthesisConfig(mergeConfig({ model: "configured/model", tools: { extra: true }, mcp: { existing: { enabled: true } } }, profile));
    const agents = final.agent as Record<string, Record<string, unknown>>;
    expect(Object.values(final.tools as object).every(value => value === false)).toBe(true);
    expect(Object.values(agents.brooks.tools as object).every(value => value === false)).toBe(true);
    expect(Object.values(final.mcp as Record<string, { enabled: boolean }>).every(value => value.enabled === false)).toBe(true);
    expect(final.model).toBe("configured/model");
    expect(String(agents.brooks.prompt)).not.toContain("Make one task call");
    expect(Object.keys(agents).sort()).toEqual(Object.keys(profile.agent).sort());
  });
  test("rejects credential reads even when valid required reads and Brain are present", () => {
    const { parent, child } = fixtures();
    child.messages[0].parts.push(tool("read", { filePath: resolve(repoRoot, ".env") }, "secret"));
    expect(assessHydration([parent, child], "parent").forbiddenTool).toBe(true);
    expect(assessHydration([parent, child], "parent").complete).toBe(false);
  });
  test("portable profile disables Brain writes and keeps credentials/models outside the overlay", async () => {
    const profile = await Bun.file(new URL("../../.opencode/hydration-profile.json", import.meta.url)).json();
    expect(profile).not.toHaveProperty("model");
    for (const name of ["brooks", "scout"]) {
      expect(profile.agent[name].tools["allura-brain_*"]).toBe(false);
      expect(profile.agent[name].tools.allura_brain_memory_add).not.toBe(true);
      expect(profile.agent[name].permission.edit).toBe("deny");
      expect(profile.agent[name].tools.skill).toBe(false);
      expect(profile.agent[name]).not.toHaveProperty("model");
    }
    expect(JSON.stringify(profile)).not.toContain("Authorization");
    expect(JSON.stringify(profile)).not.toContain("{file:/");
  });
});
