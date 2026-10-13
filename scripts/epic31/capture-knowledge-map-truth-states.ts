import { chromium } from "@playwright/test"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { type SubgraphResponse, SubgraphResponseSchema } from "../../src/lib/subgraph/contract"
import {
  overviewFocusedSubgraph,
} from "../../src/test/fixtures/focused-subgraph"

interface Options {
  url: string
  output: string
  candidateCommit: string
  candidateTree: string
}

interface TruthState {
  id: string
  file: string
  heading: string
  response: SubgraphResponse
  selectionKey?: string
  openTechnicalDetails?: boolean
}

function parseOptions(): Options {
  const values = new Map<string, string>()
  for (const argument of process.argv.slice(2)) {
    const match = /^--(url|output|candidate-commit|candidate-tree)=(.+)$/.exec(argument)
    if (!match) throw new Error("Use --url=<loopback graph URL> --output=<directory> --candidate-commit=<sha> --candidate-tree=<sha>")
    values.set(match[1], match[2])
  }
  const options = {
    url: values.get("url"),
    output: values.get("output"),
    candidateCommit: values.get("candidate-commit"),
    candidateTree: values.get("candidate-tree"),
  }
  if (!options.url || !options.output || !options.candidateCommit || !options.candidateTree) throw new Error("All options are required")
  const target = new URL(options.url)
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || !target.port || target.pathname !== "/dashboard/graph" || target.search || target.hash) {
    throw new Error("Only an explicit loopback Knowledge Map URL is allowed")
  }
  if (!/^[0-9a-f]{40}$/.test(options.candidateCommit) || !/^[0-9a-f]{40}$/.test(options.candidateTree)) throw new Error("Candidate identities must be full Git object IDs")
  return options as Options
}

function partialResponse(): SubgraphResponse {
  const base = overviewFocusedSubgraph()
  if (base.state !== "complete") throw new Error("Fixture contract changed")
  const template = base.nodes[0]
  const nodes = Array.from({ length: 200 }, (_, index) => {
    const suffix = String(index).padStart(3, "0")
    return {
      ...template,
      key: `memory:truth-state-${suffix}`,
      label: `Governed truth-state memory ${suffix}`,
      source: { kind: "record" as const, recordType: "memory", recordKey: `truth-state-${suffix}` },
      order: { distance: 0, kindRank: 0 },
    }
  })
  return SubgraphResponseSchema.parse({
    ...base,
    state: "partial",
    nodes,
    edges: [],
    warnings: ["NODE_BUDGET_EXHAUSTED"],
    inspection: undefined,
    exhausted: "nodes",
    continuation: "truth-state.next-page",
  })
}

function degradedAmbiguousResponse(): SubgraphResponse {
  return SubgraphResponseSchema.parse({
    contractVersion: "2.0",
    state: "degraded",
    reasonCode: "AMBIGUOUS_ENDPOINTS",
    retryable: false,
    action: "none",
    warnings: ["AMBIGUOUS_ENDPOINTS"],
  })
}

function emptyResponse(): SubgraphResponse {
  const base = overviewFocusedSubgraph()
  if (base.state !== "complete") throw new Error("Fixture contract changed")
  return SubgraphResponseSchema.parse({ ...base, state: "empty", nodes: [], edges: [], inspection: undefined, warnings: [] })
}

function staleResponse(): SubgraphResponse {
  return overviewFocusedSubgraph()
}

function unavailableEvidenceResponse(): SubgraphResponse {
  const base = overviewFocusedSubgraph()
  if (base.state !== "complete") throw new Error("Fixture contract changed")
  return SubgraphResponseSchema.parse({
    ...base,
    nodes: base.nodes.map((node) => node.key === "memory:current" ? {
      ...node,
      evidence: { state: "unavailable" as const, reasonCode: "EVIDENCE_BACKEND_UNAVAILABLE", retryable: true },
    } : node),
  })
}

function focusedResponse(response: SubgraphResponse, nodeKey: string): SubgraphResponse {
  if (response.state !== "complete") throw new Error("Focused truth-state response must be complete")
  const node = response.nodes.find((candidate) => candidate.key === nodeKey)
  if (!node) throw new Error(`Missing controlled focus node ${nodeKey}`)
  return SubgraphResponseSchema.parse({
    ...response,
    inspection: {
      nodeKey,
      scope: { tenantId: "allura-epic31-browser", workspaceId: "epic31-browser-workspace" },
      content: node.summary ?? node.label,
      provenance: node.source,
      evidence: node.evidence,
      lineage: [],
      relationshipKeys: [],
    },
  })
}

function responseForRequest(state: TruthState, requestUrl: URL): SubgraphResponse {
  let response = state.response
  const kind = requestUrl.searchParams.get("kind")
  if (kind === "focus" && state.selectionKey && response.state === "complete") response = focusedResponse(response, state.selectionKey)
  if (response.state !== "complete" && response.state !== "empty" && response.state !== "partial") return response
  const requested = {
    nodeLimit: Number(requestUrl.searchParams.get("nodeLimit") ?? 200),
    edgeLimit: Number(requestUrl.searchParams.get("edgeLimit") ?? 400),
    depth: kind === "focus" ? Number(requestUrl.searchParams.get("depth") ?? 1) : 0,
  }
  return SubgraphResponseSchema.parse({
    ...response,
    budgets: { requested, applied: requested },
    inspection: kind === "overview" ? undefined : response.inspection,
  })
}

function truthStates(): TruthState[] {
  return [
    { id: "empty", file: "empty.png", heading: "No governed relationships yet", response: emptyResponse() },
    { id: "partial", file: "partial.png", heading: "Knowledge Map", response: partialResponse() },
    { id: "degraded-ambiguous", file: "degraded-ambiguous.png", heading: "Graph relationships need review", response: degradedAmbiguousResponse() },
    { id: "denied-login", file: "denied-login.png", heading: "Sign in to view the Knowledge Map", response: SubgraphResponseSchema.parse({ contractVersion: "2.0", state: "denied", reasonCode: "LOGIN_REQUIRED", action: "login" }) },
    { id: "denied-access", file: "denied-access.png", heading: "Knowledge Map access not granted", response: SubgraphResponseSchema.parse({ contractVersion: "2.0", state: "denied", reasonCode: "INSUFFICIENT_ROLE", action: "request_access" }) },
    { id: "error-conflict", file: "error-conflict.png", heading: "Knowledge Map changed", response: SubgraphResponseSchema.parse({ contractVersion: "2.0", state: "error", code: "SNAPSHOT_CONFLICT", retryable: false, action: "restart" }) },
    { id: "error-unavailable", file: "error-unavailable.png", heading: "Knowledge Map unavailable", response: SubgraphResponseSchema.parse({ contractVersion: "2.0", state: "error", code: "UNAVAILABLE", retryable: true, action: "retry" }) },
    { id: "stale", file: "stale.png", heading: "Previous operating decision", response: staleResponse(), selectionKey: "memory:previous" },
    { id: "evidence-absent", file: "evidence-absent.png", heading: "Previous operating decision", response: overviewFocusedSubgraph(), selectionKey: "memory:previous" },
    { id: "evidence-unavailable", file: "evidence-unavailable.png", heading: "Current operating decision", response: unavailableEvidenceResponse(), selectionKey: "memory:current", openTechnicalDetails: true },
  ]
}

async function main(): Promise<void> {
  const options = parseOptions()
  const target = new URL(options.url)
  const output = path.resolve(options.output)
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const artifacts: Array<{ id: string; file: string; sha256: string; heading: string; source: string }> = []
  try {
    for (const state of truthStates()) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })
      const page = await context.newPage()
      const pageErrors: string[] = []
      page.on("pageerror", (error) => pageErrors.push(error.message))
      await context.route("**/*", (route) => {
        const requestUrl = new URL(route.request().url())
        if (requestUrl.origin !== target.origin) return route.abort()
        if (requestUrl.pathname === "/api/memory/graph" && route.request().method() === "GET") {
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responseForRequest(state, requestUrl)) })
        }
        return route.continue()
      })
      const navigation = await page.goto(target.href, { waitUntil: "networkidle" })
      if (navigation?.status() !== 200) throw new Error(`${state.id}: navigation returned ${navigation?.status()}`)
      await page.getByRole("heading", { name: state.selectionKey ? "Knowledge Map" : state.heading, exact: true }).waitFor()
      if (state.selectionKey) {
        await page.locator(`[data-node-control="text"][data-node-key=${JSON.stringify(state.selectionKey)}]`).click()
        await page.getByRole("complementary", { name: "Selected node inspector" }).getByRole("heading", { name: state.heading, exact: true }).waitFor()
      }
      if (state.openTechnicalDetails) {
        await page.getByRole("complementary", { name: "Selected node inspector" }).getByText("Technical details", { exact: true }).click()
      }
      if (await page.locator("#next-logo").count()) throw new Error(`${state.id}: development tooling obscures the capture`)
      if (pageErrors.length) throw new Error(`${state.id}: page errors: ${pageErrors.join("; ")}`)
      const filePath = path.join(output, state.file)
      await page.screenshot({ path: filePath, fullPage: true })
      const bytes = await readFile(filePath)
      artifacts.push({
        id: state.id,
        file: state.file,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        heading: state.heading,
        source: "exact production component with schema-validated controlled response",
      })
      await context.close()
    }
  } finally {
    await browser.close()
  }

  const receipt = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    target: options.url,
    candidate: { commit: options.candidateCommit, tree: options.candidateTree },
    classification: "controlled-truth-state-presentation-review; not live authority/data evidence and not human acceptance",
    artifacts,
  }
  await writeFile(path.join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

await main()
