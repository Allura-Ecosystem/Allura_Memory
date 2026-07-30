#!/usr/bin/env bun
/**
 * Brooks Triage Agent
 * Manifest ID: brooks
 * CI Route: issues (opened, edited) → brooks-triage
 * See: src/lib/agents/agent-manifest.ts
 *
 * Performs real issue triage and orchestration.
 * Routes from GitHub webhook → Brooks (Orchestrator)
 *
 * Sub-commands:
 *   triage <issue_number>   Real issue triage via gh CLI (default for bare number)
 *   classify <text>         Classify arbitrary text without GitHub API
 *   route                    Show current agent routing table from manifest
 *   prioritize               List open issues sorted by severity
 *   <issue_number>          Default: triage (backward compatible)
 *
 * Gracefully handles missing DB connections (for CI environments).
 * When no DB, still produces real triage output — the analysis is the value,
 * DB is just logging.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

type IssueType = "bug" | "feature" | "enhancement" | "tech-debt" | "docs" | "unknown";

type Severity = "P0" | "P1" | "P2" | "P3";

interface Classification {
  type: IssueType;
  severity: Severity;
  routing: string;
  justification: string;
  matchedKeywords: string[];
}

interface GhIssueData {
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string; description?: string }>;
}

interface PrioritizedIssue {
  number: number;
  title: string;
  labels: string[];
  classification: Classification;
}

interface TriageReport {
  issueNumber: number;
  title: string;
  body: string;
  labels: string[];
  classification: Classification;
  findings: string[];
}

interface ManifestAgent {
  id: string;
  persona: string;
  role: string;
  category: string;
  scriptPath?: string;
  ciRoutes: Array<{ event: string; action: string }>;
  description: string;
  isCiRouted: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ROOT_DIR = process.cwd();
const GROUP_ID = "allura-system";
const AGENT_ID = "brooks";

const SUBCOMMANDS = ["triage", "classify", "route", "prioritize"] as const;
type SubCommand = (typeof SUBCOMMANDS)[number];

const SEVERITY_ICON: Record<Severity, string> = {
  P0: "🔴",
  P1: "🟡",
  P2: "🟡",
  P3: "🟢",
};

const TYPE_ICON: Record<IssueType, string> = {
  bug: "🐛",
  feature: "✨",
  enhancement: "🔧",
  "tech-debt": "🏗️",
  docs: "📖",
  unknown: "❓",
};

// ── Keyword Definitions ─────────────────────────────────────────────────────

const TYPE_KEYWORDS: Record<IssueType, string[]> = {
  bug: ["crash", "error", "fail", "broken", "regression", "exception", "bug", "fault", "defect", "incorrect", "wrong", "vulnerability", "security", "unresponsive", "hangs", "timeout"],
  feature: ["add", "implement", "new", "support", "create", "build", "request", "wish", "want", "need"],
  enhancement: ["improve", "optimize", "refactor", "update", "better", "enhance", "upgrade", "faster", "cleaner", "simplify"],
  "tech-debt": ["debt", "cleanup", "remove", "deprecate", "legacy", "migrate", "rewrite", "technical debt", "tech debt"],
  docs: ["document", "readme", "guide", "explain", "doc", "documentation", "tutorial", "example"],
  unknown: [],
};

const SEVERITY_KEYWORDS: Record<Severity, string[]> = {
  P0: ["crash", "data loss", "security", "broken", "down", "outage", "critical", "urgent", "emergency", "unusable"],
  P1: ["fail", "regression", "wrong", "missing", "incorrect", "broken", "blocker", "blocking", "broken", "cannot", "can't"],
  P2: [], // default — no specific keywords
  P3: ["nice to have", "eventually", "when possible", "low priority", "minor", "cosmetic", "someday", "optional"],
};

// ── Arg Parsing ──────────────────────────────────────────────────────────────

function parseArgs(): { subCommand: SubCommand | null; args: string[] } {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    return { subCommand: null, args: [] };
  }

  const first = argv[0];
  if (SUBCOMMANDS.includes(first as SubCommand)) {
    return { subCommand: first as SubCommand, args: argv.slice(1) };
  }

  // Backward compatible: bare issue number → triage
  if (/^\d+$/.test(first)) {
    return { subCommand: "triage", args: [first] };
  }

  // Unknown subcommand or text to classify
  return { subCommand: null, args: argv };
}

// ── Classification Engine ─────────────────────────────────────────────────────

function classifyText(text: string): Classification {
  const normalized = text.toLowerCase();
  const matchedKeywords: string[] = [];

  // Determine issue type
  let bestType: IssueType = "unknown";
  let bestTypeScore = 0;
  let bestTypeKeywords: string[] = [];

  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (type === "unknown") continue;
    let score = 0;
    const matched: string[] = [];
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        score++;
        matched.push(kw);
      }
    }
    if (score > bestTypeScore) {
      bestTypeScore = score;
      bestType = type as IssueType;
      bestTypeKeywords = matched;
    }
  }
  matchedKeywords.push(...bestTypeKeywords);

  // Determine severity
  let severity: Severity = "P2"; // default

  // Check P0 first (highest priority)
  for (const kw of SEVERITY_KEYWORDS.P0) {
    if (normalized.includes(kw)) {
      severity = "P0";
      matchedKeywords.push(kw);
      break;
    }
  }

  // Check P1 if not P0
  if (severity === "P2") {
    for (const kw of SEVERITY_KEYWORDS.P1) {
      if (normalized.includes(kw) && !matchedKeywords.includes(kw)) {
        severity = "P1";
        matchedKeywords.push(kw);
        break;
      }
    }
  }

  // Check P3 (lowest priority)
  if (severity === "P2") {
    for (const kw of SEVERITY_KEYWORDS.P3) {
      if (normalized.includes(kw)) {
        severity = "P3";
        if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
        break;
      }
    }
  }

  // Bugs with P0/P1 stay at P0/P1; bugs without urgency default to P2
  if (bestType === "bug" && severity === "P2") {
    // Already P2 — that's the right default for non-urgent bugs
  }

  // Determine routing
  const routing = determineRouting(bestType, severity);
  const justification = buildJustification(bestType, severity, bestTypeKeywords);

  return {
    type: bestType,
    severity,
    routing,
    justification,
    matchedKeywords: [...new Set(matchedKeywords)], // dedupe
  };
}

function determineRouting(type: IssueType, severity: Severity): string {
  switch (type) {
    case "bug":
      return severity === "P0" || severity === "P1"
        ? "brooks"
        : "woz";
    case "feature":
      return "jobs";
    case "enhancement":
      return "fowler";
    case "tech-debt":
      return "fowler";
    case "docs":
      return "knuth";
    default:
      return "brooks";
  }
}

function buildJustification(type: IssueType, severity: Severity, keywords: string[]): string {
  const keywordNote = keywords.length > 0
    ? `keywords: ${keywords.join(", ")}`
    : "no strong keyword signal";

  const routingReasons: Record<IssueType, string> = {
    bug: severity === "P0" || severity === "P1"
      ? `architect review required for ${severity} bug`
      : `builder can resolve standard bug`,
    feature: "intent gate required before implementation",
    enhancement: "refactor assessment needed",
    "tech-debt": "debt triage and prioritization",
    docs: "literate programming specialist",
    unknown: "architect review — unclassified issue",
  };

  return `${routingReasons[type]} (${keywordNote})`;
}

// ── Route Table ───────────────────────────────────────────────────────────────

function loadManifest(): ManifestAgent[] {
  const manifestPath = join(ROOT_DIR, "src/lib/agents/agent-manifest.ts");

  if (!existsSync(manifestPath)) {
    return [];
  }

  // We need to dynamically import the manifest.
  // Since this runs under bun, we can use ts imports directly.
  // But to avoid compilation issues, we parse the manifest module
  // at runtime. For robustness, we try dynamic import first.
  return []; // populated by getManifestAgents() async
}

async function getManifestAgents(): Promise<ManifestAgent[]> {
  try {
    const mod = await import("../../src/lib/agents/agent-manifest");
    const manifest = mod.AGENT_MANIFEST as Map<string, {
      id: string;
      persona: string;
      role: string;
      category: string;
      scriptPath?: string;
      ciRoutes: Array<{ event: string; action: string }>;
      description: string;
    }>;

    const agents: ManifestAgent[] = [];
    for (const [, entry] of manifest) {
      agents.push({
        id: entry.id,
        persona: entry.persona,
        role: entry.role,
        category: entry.category,
        scriptPath: entry.scriptPath,
        ciRoutes: entry.ciRoutes,
        description: entry.description,
        isCiRouted: entry.ciRoutes.length > 0,
      });
    }
    return agents;
  } catch {
    // Manifest unavailable — return empty with graceful message
    return [];
  }
}

// ── Routing Rules ────────────────────────────────────────────────────────────

interface RoutingRule {
  condition: string;
  targetAgent: string;
  reason: string;
}

function getRoutingRules(): RoutingRule[] {
  return [
    { condition: "bug + P0/P1", targetAgent: "brooks", reason: "Architect review required for critical/high bugs" },
    { condition: "bug + P2/P3", targetAgent: "woz", reason: "Builder resolves standard bugs" },
    { condition: "feature", targetAgent: "jobs → woz", reason: "Intent gate first, then builder implements" },
    { condition: "enhancement", targetAgent: "fowler", reason: "Refactor assessment before changes" },
    { condition: "tech-debt", targetAgent: "fowler", reason: "Debt triage and prioritization" },
    { condition: "docs", targetAgent: "knuth", reason: "Literate programming specialist" },
    { condition: "unknown", targetAgent: "brooks", reason: "Architect reviews unclassified issues" },
  ];
}

// ── GitHub CLI ────────────────────────────────────────────────────────────────

function isGhAvailable(): boolean {
  try {
    execSync("gh --version", { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function fetchIssueData(issueNumber: number): GhIssueData {
  let json: string;
  try {
    json = execSync(
      `gh issue view ${issueNumber} --json number,title,body,labels`,
      { encoding: "utf-8", cwd: ROOT_DIR, maxBuffer: 5 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch (error: unknown) {
    let ghError = "";
    if (error && typeof error === "object" && "stderr" in error) {
      ghError = String((error as { stderr: string }).stderr).trim().split("\n")[0];
    }
    console.error(`[brooks] gh CLI failed for issue #${issueNumber}`);
    if (ghError) {
      console.error(`[brooks] ${ghError}`);
    }
    process.exit(1);
  }

  const parsed = JSON.parse(json) as {
    number: number;
    title: string;
    body: string | null;
    labels: Array<{ name: string; description?: string }>;
  };

  return {
    number: parsed.number,
    title: parsed.title || "",
    body: parsed.body || "",
    labels: parsed.labels || [],
  };
}

function fetchOpenIssues(): Array<{ number: number; title: string; labels: Array<{ name: string }> }> {
  let json: string;
  try {
    json = execSync(
      `gh issue list --state open --json number,title,labels --limit 100`,
      { encoding: "utf-8", cwd: ROOT_DIR, maxBuffer: 10 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch (error: unknown) {
    let ghError = "";
    if (error && typeof error === "object" && "stderr" in error) {
      ghError = String((error as { stderr: string }).stderr).trim().split("\n")[0];
    }
    console.error("[brooks] gh CLI failed to list open issues");
    if (ghError) {
      console.error(`[brooks] ${ghError}`);
    }
    process.exit(1);
  }

  const parsed = JSON.parse(json) as Array<{
    number: number;
    title: string;
    labels: Array<{ name: string }>;
  }>;

  return parsed;
}

// ── Sub-command: triage ──────────────────────────────────────────────────────

function cmdTriage(issueNumber: number): TriageReport {
  if (!isGhAvailable()) {
    console.error("[brooks] gh CLI not available — falling back to classify mode");
    console.error("[brooks] Use 'classify <text>' for offline triage");
    process.exit(1);
  }

  const issue = fetchIssueData(issueNumber);
  const fullText = `${issue.title} ${issue.body} ${issue.labels.map((l) => l.name).join(" ")}`;
  const classification = classifyText(fullText);

  // Build findings from classification
  const findings = buildFindings(issue, classification);

  return {
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body,
    labels: issue.labels.map((l) => l.name),
    classification,
    findings,
  };
}

function buildFindings(issue: GhIssueData, classification: Classification): string[] {
  const findings: string[] = [];

  findings.push(`Issue type: ${TYPE_ICON[classification.type]} ${classification.type}`);
  findings.push(`Severity: ${SEVERITY_ICON[classification.severity]} ${classification.severity}`);

  if (classification.matchedKeywords.length > 0) {
    findings.push(`Matched keywords: ${classification.matchedKeywords.join(", ")}`);
  }

  findings.push(`Route to: ${classification.routing}`);
  findings.push(`Justification: ${classification.justification}`);

  // Check for label conflicts
  const existingLabelTypes = issue.labels.map((l) => l.name.toLowerCase());
  if (!existingLabelTypes.includes(classification.type) && classification.type !== "unknown") {
    findings.push(`Label suggestion: add "${classification.type}" label`);
  }

  // Check for severity label conflicts
  const hasSeverityLabel = existingLabelTypes.some((l) => /^p[0-3]$/i.test(l));
  if (!hasSeverityLabel) {
    findings.push(`Label suggestion: add "${classification.severity}" severity label`);
  }

  // Content quality checks
  if (!issue.body || issue.body.trim().length < 20) {
    findings.push("⚠️  Issue body is empty or very short — request more details");
  }

  if (!issue.title || issue.title.trim().length < 10) {
    findings.push("⚠️  Issue title is very short — consider requesting a clearer title");
  }

  // Bug-specific checks
  if (classification.type === "bug") {
    const body = (issue.body || "").toLowerCase();
    const hasRepro = body.includes("step") || body.includes("reproduc") || body.includes("how to");
    if (!hasRepro) {
      findings.push("⚠️  Bug report lacks reproduction steps — request reproducer");
    }
  }

  // Feature-specific checks
  if (classification.type === "feature") {
    const body = (issue.body || "").toLowerCase();
    const hasAcceptance = body.includes("acceptance") || body.includes("criteria") || body.includes("expected");
    if (!hasAcceptance) {
      findings.push("⚠️  Feature request lacks acceptance criteria — route through Jobs for intent gate");
    }
  }

  return findings;
}

// ── Sub-command: classify ────────────────────────────────────────────────────

function cmdClassify(text: string): Classification {
  return classifyText(text);
}

// ── Sub-command: route ────────────────────────────────────────────────────────

async function cmdRoute(): Promise<string> {
  const lines: string[] = [];
  const rules = getRoutingRules();
  const agents = await getManifestAgents();

  lines.push("[brooks] ══ ROUTING TABLE ══════════════════════════════════");
  lines.push("");

  // Section 1: Issue → Agent routing rules
  lines.push("Issue → Agent Routing Rules:");
  lines.push("─────────────────────────────────────────────────");
  for (const rule of rules) {
    lines.push(`  ${rule.condition.padEnd(20)} → ${rule.targetAgent.padEnd(14)} ${rule.reason}`);
  }
  lines.push("");

  // Section 2: Agent manifest
  if (agents.length > 0) {
    lines.push("Agent Manifest:");
    lines.push("─────────────────────────────────────────────────");

    // Group by CI-routed vs manual-only
    const ciAgents = agents.filter((a) => a.isCiRouted);
    const manualAgents = agents.filter((a) => !a.isCiRouted);

    lines.push("");
    lines.push("CI-Routed (automated via GitHub webhooks):");
    for (const agent of ciAgents) {
      const routes = agent.ciRoutes
        .map((r) => `${r.event}:${r.action === "*" ? "*" : r.action}`)
        .join(", ");
      lines.push(`  🤖 ${agent.id.padEnd(10)} ${agent.persona.padEnd(20)} [${routes}]`);
      lines.push(`     Role: ${agent.role}`);
      if (agent.scriptPath) {
        lines.push(`     Script: ${agent.scriptPath}`);
      }
    }

    lines.push("");
    lines.push("Manual-Only (invoked interactively):");
    for (const agent of manualAgents) {
      lines.push(`  👤 ${agent.id.padEnd(10)} ${agent.persona.padEnd(20)}`);
      lines.push(`     Role: ${agent.role}`);
    }
  } else {
    lines.push("⚠️  Agent manifest unavailable — cannot load agent definitions");
    lines.push("   Ensure src/lib/agents/agent-manifest.ts is accessible");
  }

  return lines.join("\n");
}

// ── Sub-command: prioritize ──────────────────────────────────────────────────

function cmdPrioritize(): PrioritizedIssue[] {
  if (!isGhAvailable()) {
    console.error("[brooks] gh CLI not available — cannot fetch open issues");
    console.error("[brooks] Install gh CLI or use 'classify <text>' for offline triage");
    process.exit(1);
  }

  const issues = fetchOpenIssues();
  const prioritized: PrioritizedIssue[] = [];

  for (const issue of issues) {
    const fullText = `${issue.title} ${issue.labels.map((l) => l.name ?? l).join(" ")}`;
    const classification = classifyText(fullText);

    prioritized.push({
      number: issue.number,
      title: issue.title,
      labels: issue.labels.map((l) => l.name ?? (l as unknown as string)),
      classification,
    });
  }

  // Sort by severity: P0 → P1 → P2 → P3
  const severityOrder: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  prioritized.sort((a, b) => severityOrder[a.classification.severity] - severityOrder[b.classification.severity]);

  return prioritized;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatTriageReport(report: TriageReport): string {
  const lines: string[] = [];
  lines.push("[brooks] ══ TRIAGE REPORT ═════════════════════════════════");
  lines.push("");
  lines.push(`Issue #${report.issueNumber}: ${report.title}`);
  lines.push(`Labels: ${report.labels.length > 0 ? report.labels.join(", ") : "(none)"}`);
  lines.push("");

  lines.push("Classification:");
  const c = report.classification;
  lines.push(`  ${TYPE_ICON[c.type]}  Type:      ${c.type}`);
  lines.push(`  ${SEVERITY_ICON[c.severity]}  Severity:  ${c.severity}`);
  lines.push(`  🔀  Route to:  ${c.routing}`);
  lines.push("");

  if (c.matchedKeywords.length > 0) {
    lines.push(`  Keywords:  ${c.matchedKeywords.join(", ")}`);
    lines.push(`  Reason:    ${c.justification}`);
    lines.push("");
  }

  lines.push("Findings:");
  for (const finding of report.findings) {
    lines.push(`  • ${finding}`);
  }
  lines.push("");

  lines.push("──────────────────────────────────────────────────────────");
  lines.push(`  VERDICT: ${SEVERITY_ICON[c.severity]} ${c.severity} ${c.type.toUpperCase()} → ${c.routing}`);
  lines.push("──────────────────────────────────────────────────────────");

  return lines.join("\n");
}

function formatClassification(classification: Classification, sourceText: string): string {
  const lines: string[] = [];
  lines.push("[brooks] ══ CLASSIFICATION ═════════════════════════════════");
  lines.push("");
  lines.push(`Source: "${sourceText.substring(0, 80)}${sourceText.length > 80 ? "..." : ""}"`);
  lines.push("");

  lines.push("Result:");
  lines.push(`  ${TYPE_ICON[classification.type]}  Type:      ${classification.type}`);
  lines.push(`  ${SEVERITY_ICON[classification.severity]}  Severity:  ${classification.severity}`);
  lines.push(`  🔀  Route to:  ${classification.routing}`);
  lines.push("");

  if (classification.matchedKeywords.length > 0) {
    lines.push(`  Keywords:  ${classification.matchedKeywords.join(", ")}`);
  }
  lines.push(`  Reason:    ${classification.justification}`);

  return lines.join("\n");
}

function formatPrioritized(issues: PrioritizedIssue[]): string {
  const lines: string[] = [];
  lines.push("[brooks] ══ PRIORITIZED ISSUES ════════════════════════════");
  lines.push("");

  if (issues.length === 0) {
    lines.push("No open issues found.");
    return lines.join("\n");
  }

  // Group by severity
  const bySeverity: Record<Severity, PrioritizedIssue[]> = { P0: [], P1: [], P2: [], P3: [] };
  for (const issue of issues) {
    bySeverity[issue.classification.severity].push(issue);
  }

  for (const sev of ["P0", "P1", "P2", "P3"] as Severity[]) {
    const group = bySeverity[sev];
    if (group.length === 0) continue;

    lines.push(`${SEVERITY_ICON[sev]} ${sev} (${group.length} issues):`);
    for (const issue of group) {
      const c = issue.classification;
      lines.push(
        `  #${String(issue.number).padStart(4)} ${TYPE_ICON[c.type]} ${c.type.padEnd(14)} → ${c.routing.padEnd(14)} ${issue.title.substring(0, 60)}`,
      );
    }
    lines.push("");
  }

  lines.push(`Total: ${issues.length} open issues`);

  return lines.join("\n");
}

// ── DB Logging ───────────────────────────────────────────────────────────────

interface DbConnections {
  pgPool: { query: (sql: string, params: unknown[]) => Promise<unknown> };
  neo4jSession: {
    run: (cypher: string, params: Record<string, unknown>) => Promise<unknown>;
    close: () => Promise<void>;
  };
  closeDriver: () => Promise<void>;
  closePool: () => Promise<void>;
}

async function getDbConnections(): Promise<DbConnections | null> {
  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const neo4jUri = null; // Neo4j sunset

  if (!postgresUrl) {
    return null;
  }

  const { getPool, closePool } = await import("../../src/lib/postgres/connection");
  const closeDriver = async () => {};

  const pgPool = getPool();
  // Neo4j sunset — PostgreSQL only
  const session = null as unknown as { run: () => Promise<never[]>; close: () => Promise<void> };

  return {
    pgPool,
    neo4jSession: session,
    closeDriver,
    closePool,
  };
}

async function logToPostgres(
  db: DbConnections,
  eventType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.pgPool.query(
    `INSERT INTO events (group_id, event_type, agent_id, metadata, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      GROUP_ID,
      eventType,
      AGENT_ID,
      JSON.stringify(metadata),
      "completed",
    ],
  );
}

async function createInsight(
  db: DbConnections,
  summary: string,
  confidence: number,
  sourceType: string,
): Promise<void> {
  await db.neo4jSession.run(
    `CREATE (i:Insight {
      insight_id: 'ins_triage_' + randomUUID(),
      summary: $summary,
      confidence: $confidence,
      status: 'active',
      group_id: $groupId,
      created_at: datetime(),
      source_type: $sourceType
    })
    RETURN i`,
    {
      summary,
      confidence,
      groupId: GROUP_ID,
      sourceType,
    },
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { subCommand, args } = parseArgs();

  // No args at all → print usage
  if (!subCommand && args.length === 0) {
    console.log("[brooks] Brooks — Issue Triage Agent");
    console.log("");
    console.log("Usage:");
    console.log("  brooks-triage.ts triage <number>    Real issue triage via gh CLI");
    console.log("  brooks-triage.ts classify <text>    Classify arbitrary text");
    console.log("  brooks-triage.ts route              Show agent routing table");
    console.log("  brooks-triage.ts prioritize         List open issues by severity");
    console.log("  brooks-triage.ts <number>           Default: triage");
    process.exit(0);
  }

  console.log("[brooks] Starting triage analysis...");
  console.log(`[brooks] Command: ${subCommand || "triage"}`);
  if (args.length > 0) {
    console.log(`[brooks] Args: ${args.join(" ")}`);
  }
  console.log("");

  // Handle unknown subcommand
  if (!subCommand && args.length > 0) {
    // If it's not a number, treat it as classify text
    console.log("[brooks] Unknown subcommand — treating as classify text");
    const text = args.join(" ");
    const classification = cmdClassify(text);
    const output = formatClassification(classification, text);
    console.log(output);

    // DB logging
    const db = await getDbConnections();
    if (db) {
      try {
        await logToPostgres(db, "issue_triage_completed", {
          subCommand: "classify",
          text: text.substring(0, 200),
          type: classification.type,
          severity: classification.severity,
          routing: classification.routing,
        });
        await createInsight(
          db,
          `Text classified as ${classification.type}/${classification.severity} → ${classification.routing}`,
          0.85,
          "agent_triage",
        );
        console.log("\n[brooks] Triage logged to PostgreSQL and Neo4j");
      } finally {
        await db.neo4jSession.close();
        await db.closeDriver();
        await db.closePool();
      }
    } else {
      console.log("\n[brooks] ⚠️  DB connections not configured — triage still valid");
    }
    return;
  }

  // Execute the matched sub-command
  switch (subCommand) {
    case "triage": {
      if (args.length === 0 || !/^\d+$/.test(args[0])) {
        console.error("[brooks] triage requires an issue number (digits only)");
        process.exit(1);
      }
      const issueNumber = parseInt(args[0], 10);
      const report = cmdTriage(issueNumber);
      const output = formatTriageReport(report);
      console.log(output);

      // DB logging
      const db = await getDbConnections();
      if (db) {
        try {
          await logToPostgres(db, "issue_triage_started", {
            issueNumber,
            subCommand: "triage",
          });
          await logToPostgres(db, "issue_triage_completed", {
            issueNumber,
            type: report.classification.type,
            severity: report.classification.severity,
            routing: report.classification.routing,
            findingsCount: report.findings.length,
            confidence: 0.85,
          });
          await createInsight(
            db,
            `Issue #${issueNumber}: ${report.classification.type}/${report.classification.severity} → ${report.classification.routing}`,
            0.85,
            "agent_triage",
          );
          console.log("\n[brooks] Triage logged to PostgreSQL and Neo4j");
        } catch (error) {
          console.error("[brooks] DB logging failed:", error);
          // Don't exit 1 — triage itself succeeded
        } finally {
          await db.neo4jSession.close();
          await db.closeDriver();
          await db.closePool();
        }
      } else {
        console.log("\n[brooks] ⚠️  DB connections not configured — triage still valid");
      }
      break;
    }

    case "classify": {
      if (args.length === 0) {
        console.error("[brooks] classify requires text to classify");
        process.exit(1);
      }
      const text = args.join(" ");
      const classification = cmdClassify(text);
      const output = formatClassification(classification, text);
      console.log(output);

      // DB logging
      const db = await getDbConnections();
      if (db) {
        try {
          await logToPostgres(db, "issue_triage_completed", {
            subCommand: "classify",
            text: text.substring(0, 200),
            type: classification.type,
            severity: classification.severity,
            routing: classification.routing,
          });
          await createInsight(
            db,
            `Text classified as ${classification.type}/${classification.severity} → ${classification.routing}`,
            0.85,
            "agent_triage",
          );
          console.log("\n[brooks] Triage logged to PostgreSQL and Neo4j");
        } catch (error) {
          console.error("[brooks] DB logging failed:", error);
        } finally {
          await db.neo4jSession.close();
          await db.closeDriver();
          await db.closePool();
        }
      } else {
        console.log("\n[brooks] ⚠️  DB connections not configured — triage still valid");
      }
      break;
    }

    case "route": {
      const output = await cmdRoute();
      console.log(output);

      // No DB logging for route — it's a read-only query
      break;
    }

    case "prioritize": {
      const issues = cmdPrioritize();
      const output = formatPrioritized(issues);
      console.log(output);

      // DB logging
      const db = await getDbConnections();
      if (db) {
        try {
          await logToPostgres(db, "issue_prioritization_completed", {
            subCommand: "prioritize",
            totalIssues: issues.length,
            p0Count: issues.filter((i) => i.classification.severity === "P0").length,
            p1Count: issues.filter((i) => i.classification.severity === "P1").length,
            p2Count: issues.filter((i) => i.classification.severity === "P2").length,
            p3Count: issues.filter((i) => i.classification.severity === "P3").length,
          });
          await createInsight(
            db,
            `Prioritization: ${issues.length} open issues (P0:${issues.filter((i) => i.classification.severity === "P0").length} P1:${issues.filter((i) => i.classification.severity === "P1").length} P2:${issues.filter((i) => i.classification.severity === "P2").length} P3:${issues.filter((i) => i.classification.severity === "P3").length})`,
            0.80,
            "agent_triage",
          );
          console.log("\n[brooks] Prioritization logged to PostgreSQL and Neo4j");
        } catch (error) {
          console.error("[brooks] DB logging failed:", error);
        } finally {
          await db.neo4jSession.close();
          await db.closeDriver();
          await db.closePool();
        }
      } else {
        console.log("\n[brooks] ⚠️  DB connections not configured — prioritization still valid");
      }
      break;
    }
  }
}

main().catch((error: unknown) => {
  console.error("[brooks] Fatal error:", error);
  process.exit(1);
});
