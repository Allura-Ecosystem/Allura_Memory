import { describe, expect, test } from "bun:test";
import { assessHydration, brooksReceipt, createLocalReceipt, DEFAULT_TOPIC, gitReceipt, hydrationRoute, localModelPacket, mergeConfig, resolveReferences, sanitizeSession, sessionFromEvents, synthesisConfig, tokenUsage, validLocalReceipt, validSessionUsage } from "../../scripts/hydrate-opencode";
import type { LocalReceipt, Session } from "../../scripts/hydrate-opencode";
import { resolve } from "node:path";

const tool = (name: string, input = {}, output = "{}") => ({ type: "tool", tool: name, state: { status: "completed", input, output } });
const brainInput = { group_id: "allura-system", limit: 5, query: DEFAULT_TOPIC };
const brainOutput = JSON.stringify({ results: [], count: 0, meta: { degraded: false } });
const repoRoot = resolve(import.meta.dir, "../..");
const GOOD_RECEIPT = "HYDRATION_COMPLETE. Startup local navigation and revision verified. Brain allura-system returned five historical results. Configured task pointer target was not read. Next route is Brooks scope review before implementation.";
function launcherReceipt(): LocalReceipt {
  return { source: "launcher", files: [".opencode/context/navigation.md", ".opencode/runtime-contract.json"].map(path => ({ path: resolve(repoRoot, path), nonempty: true, sha256: "a".repeat(64) })), navigationEvidence: "# Context navigation", taskPointer: { canonical_plan_path: "ralph/PROMPT_plan.md", canonical_plan_id: "plan123" }, git: [{ command: ["git", "status", "--short"], exit: 0, output: "" }, { command: ["git", "rev-parse", "HEAD"], exit: 0, output: "a".repeat(40) }] };
}
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
  const parent = { info: { id: "parent" }, messages: [{ info: { id: "p1", role: "assistant", finish: "stop", tokens: { input: 10, output: 4, reasoning: 2, cache: { read: 30, write: 0 } } }, parts: [{ type: "text", text: GOOD_RECEIPT }, tool("task", { subagent_type: "scout" })] }] };
  const child = { info: { id: "child", parentID: "parent" }, messages: [{ info: { id: "c1", role: "assistant", finish: "stop", tokens: { total: 25, input: 20, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [
    tool("read", { filePath: resolve(repoRoot, ".opencode/context/navigation.md") }, "navigation"), tool("read", { filePath: resolve(repoRoot, ".opencode/runtime-contract.json") }, "runtime"),
    tool("bash", { command: "git status --short" }, ""), tool("bash", { command: "git rev-parse HEAD" }, "a".repeat(40)),
    tool("allura-brain_memory_search", brainInput, brainOutput),
  ] }] };
  return { parent, child };
}
describe("hydration launcher", () => {
  test("export accounting requires complete coherent finite usage for every finished assistant inference", () => {
    const { parent, child } = fixtures();
    expect(validSessionUsage(parent)).toBe(true);
    expect(validSessionUsage(child)).toBe(true);
    expect(tokenUsage([parent]).total).toBe(46);
    for (const mutate of [
      (s: Session) => { delete s.messages[0].info.tokens; },
      (s: Session) => { delete s.messages[0].info.tokens!.cache!.write; },
      (s: Session) => { s.messages[0].info.tokens!.total = 999; },
      (s: Session) => { s.messages[0].info.tokens!.input = NaN; },
      (s: Session) => { s.messages[0].info.tokens!.output = -1; },
      (s: Session) => { s.messages[0].info.tokens!.cache!.read = Infinity; },
    ]) { const bad = fixtures().parent; mutate(bad); expect(validSessionUsage(bad)).toBe(false); expect(() => tokenUsage([bad])).toThrow(); }
    delete child.messages[0].info.finish;
    expect(validSessionUsage(child)).toBe(false);
    parent.messages.push({ info: { id: "missing-second", role: "assistant", finish: "stop" }, parts: [] });
    expect(validSessionUsage(parent)).toBe(false);
  });
  test("default route runs only real Brooks with owner Brain evidence and zero Scout sessions", () => {
    expect(hydrationRoute()).toEqual({ route: "brooks-direct", agents: ["brooks"], scoutOptional: true });
    expect(hydrationRoute(true)).toEqual({ route: "scout-brooks", agents: ["scout", "brooks"], scoutOptional: true });
    const { parent } = fixtures();
    parent.messages[0].parts = [{ type: "text", text: GOOD_RECEIPT }];
    parent.messages.unshift({ info: { id: "owner-tool", role: "assistant", tokens: { total: 12, input: 10, output: 2, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [tool("allura-brain_memory_search", brainInput, brainOutput)] });
    const result = assessHydration([parent], "parent", undefined, DEFAULT_TOPIC, repoRoot, launcherReceipt());
    expect(result).toMatchObject({ complete: true, brainOwner: "brooks", scoutSessions: 0, successfulBrain: true });
    expect(tokenUsage([parent]).inferences).toBe(2);
    expect(assessHydration([parent, { info: { id: "extra-scout" }, messages: [] }], "parent", undefined, DEFAULT_TOPIC, repoRoot, launcherReceipt()).complete).toBe(false);
  });
  test("direct Brooks route rejects absent, failed or fake Brain, invalid local receipts and extra tools", () => {
    for (const parts of [[], [tool("allura-brain_memory_search", brainInput, "{}")], [tool("allura-brain_memory_search", { ...brainInput, group_id: "allura-other" }, brainOutput)], [tool("allura-brain_memory_search", brainInput, brainOutput), tool("task", { subagent_type: "scout" })], [tool("allura-brain_memory_search", brainInput, brainOutput), tool("read", { filePath: resolve(repoRoot, ".opencode/context/navigation.md") }, "extra")]]) {
      const { parent } = fixtures(); parent.messages[0].parts = [{ type: "text", text: GOOD_RECEIPT }, ...parts];
      expect(assessHydration([parent], "parent", undefined, DEFAULT_TOPIC, repoRoot, launcherReceipt()).complete).toBe(false);
    }
    const { parent } = fixtures(); parent.messages[0].parts = [{ type: "text", text: GOOD_RECEIPT }, tool("allura-brain_memory_search", brainInput, brainOutput)];
    expect(assessHydration([parent], "parent", undefined, DEFAULT_TOPIC, repoRoot, null).complete).toBe(false);
    parent.messages[0].parts[1].state!.status = "error";
    expect(assessHydration([parent], "parent", undefined, DEFAULT_TOPIC, repoRoot, launcherReceipt()).complete).toBe(false);
  });
  test("launcher evidence is separate from actual Scout Brain tools and invalid receipts fail closed", () => {
    const { parent, child } = fixtures();
    parent.messages[0].parts = [{ type: "text", text: GOOD_RECEIPT }];
    child.messages[0].parts = [tool("allura-brain_memory_search", brainInput, brainOutput)];
    const receipt = launcherReceipt();
    expect(validLocalReceipt(receipt, repoRoot)).toBe(true);
    expect(assessHydration([parent, child], "parent", "child", DEFAULT_TOPIC, repoRoot, receipt).complete).toBe(true);
    expect(assessHydration([parent, child], "parent", "child", DEFAULT_TOPIC, repoRoot, null).complete).toBe(false);
    expect(child.messages[0].parts.every(part => part.tool === "allura-brain_memory_search")).toBe(true);
    for (const mutate of [
      (r: LocalReceipt) => { r.files.pop(); }, (r: LocalReceipt) => { r.files[0].nonempty = false; },
      (r: LocalReceipt) => { r.files[0].path = "/other/context/navigation.md"; },
      (r: LocalReceipt) => { r.git[0].exit = 1; }, (r: LocalReceipt) => { r.git[1].output = "invalid"; },
      (r: LocalReceipt) => { r.git[0].command.push("&& env"); },
    ]) { const bad = launcherReceipt(); mutate(bad); expect(assessHydration([parent, child], "parent", "child", DEFAULT_TOPIC, repoRoot, bad).complete).toBe(false); }
    child.messages[0].parts.push(tool("read", { filePath: receipt.files[0].path }, "extra read"));
    expect(assessHydration([parent, child], "parent", "child", DEFAULT_TOPIC, repoRoot, receipt).complete).toBe(false);
  });
  test("model packet includes only approved bounded navigation, task-pointer and git evidence", () => {
    const secret = "DO_NOT_SEND_RUNTIME_SECRET";
    const receipt = createLocalReceipt(repoRoot, "# Navigation\n## Routes\n`core/navigation.md`\n" + secret, JSON.stringify({ canonical_plan_id: "approved_id", canonical_plan_path: "ralph/PROMPT_plan.md", secret, notion_url: "https://private.example/" + secret, matrix: { secret } }), launcherReceipt().git);
    expect(validLocalReceipt(receipt, repoRoot)).toBe(true);
    const packet = JSON.stringify(localModelPacket(receipt));
    expect(packet).toContain("core/navigation.md");
    expect(packet).toContain("approved_id");
    expect(packet).not.toContain(secret);
    expect(packet).not.toContain("notion_url");
    expect(packet).not.toContain("matrix");
    expect(JSON.stringify(receipt)).not.toContain(secret);
    expect(receipt.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(createLocalReceipt(repoRoot, ("# Heading\n").repeat(1000), "{}", launcherReceipt().git).navigationEvidence.length).toBeLessThanOrEqual(3000);
  });
  test("dirty status is bounded by both line and character limits with truthful truncation metadata", () => {
    for (const raw of [Array.from({ length: 100 }, (_, index) => `?? file-${index}`).join("\n") + "\n", "?? " + "x".repeat(5000) + "\n"]) {
      const receipt = launcherReceipt(); receipt.git[0].output = raw;
      const packet = localModelPacket(receipt);
      expect(packet.status.length).toBeLessThanOrEqual(2000);
      expect(packet.status.split("\n").length).toBeLessThanOrEqual(40);
      expect(packet.statusTruncated).toBe(true);
      expect(packet.statusTotalLines).toBe(raw.trimEnd().split("\n").length);
      expect(receipt.git[0].output).toBe(raw);
      expect(validLocalReceipt(receipt, repoRoot)).toBe(true);
    }
    const clean = localModelPacket(launcherReceipt());
    expect(clean.status).toBe(""); expect(clean.statusTruncated).toBe(false); expect(clean.statusTotalLines).toBe(0);
    const small = launcherReceipt(); small.git[0].output = " M file.ts\n";
    expect(localModelPacket(small)).toMatchObject({ status: " M file.ts", statusTruncated: false, statusTotalLines: 1 });
  });
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
    expect(profile.agent.scout.tools.read).toBe(false);
    expect(profile.agent.scout.tools.bash).toBe(false);
    expect(profile.agent.brooks.tools.read).toBe(false);
    expect(profile.agent.brooks.tools.bash).toBe(false);
    expect(profile.agent.brooks.tools.task).toBe(false);
  });
});
