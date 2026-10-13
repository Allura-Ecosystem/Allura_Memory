import { expect, type Locator, type Page, test } from "@playwright/test"

import { type SubgraphNode, type SubgraphResponse, SubgraphResponseSchema } from "../../src/lib/subgraph/contract"

type GraphPayload = Extract<SubgraphResponse, { state: "complete" | "partial" }>

function exactNodeControl(page: Page, key: string): Locator {
  return page.locator(`[data-node-control="text"][data-node-key=${JSON.stringify(key)}]`)
}

function exactCanvasNode(page: Page, key: string): Locator {
  return page.locator(`.react-flow__node[data-id=${JSON.stringify(key)}]`)
}

async function waitForSuccessfulFocus(page: Page): Promise<GraphPayload> {
  const response = await page.waitForResponse((candidate) => candidate.url().includes("kind=focus") && candidate.request().method() === "GET")
  const payload = SubgraphResponseSchema.parse(await response.json())
  expect(payload.state, `Focus ${response.url()} returned ${JSON.stringify(payload)}`).toMatch(/complete|partial/)
  if (payload.state !== "complete" && payload.state !== "partial") throw new Error(`Focus returned ${payload.state}`)
  return payload
}

async function openGovernedMap(page: Page): Promise<GraphPayload> {
  const apiResponse = page.waitForResponse((response) => response.url().includes("/api/memory/graph?") && response.request().method() === "GET")
  await page.goto("/dashboard/graph")
  const response = await apiResponse
  const payload = SubgraphResponseSchema.parse(await response.json())
  expect(payload.state, "Browser evidence requires a governed non-empty graph response").toMatch(/complete|partial/)
  if (payload.state !== "complete" && payload.state !== "partial") throw new Error(`Graph state ${payload.state} cannot prove real-data interaction`)
  await expect(page.getByRole("region", { name: "Governed Knowledge Map" })).toBeVisible()
  return payload
}

test("correlates real API identities with React Flow and the text view", async ({ page }, testInfo) => {
  const payload = await openGovernedMap(page)
  const canvas = page.getByLabel("Knowledge Map canvas")
  await expect(page.getByRole("list", { name: "Knowledge Map nodes" }).getByRole("button")).toHaveCount(payload.nodes.length)
  await expect(page.getByRole("list", { name: "Knowledge Map directed relationships" }).getByRole("listitem")).toHaveCount(payload.edges.length)
  await expect(canvas.locator(".react-flow__node")).toHaveCount(payload.nodes.length)
  await expect(canvas.locator(".react-flow__edge")).toHaveCount(payload.edges.length)
  for (const node of payload.nodes.slice(0, 5)) {
    await expect(exactNodeControl(page, node.key)).toBeVisible()
    await expect(exactCanvasNode(page, node.key)).toBeVisible()
  }
  await expect(page.getByRole("button", { name: "Fit view" })).toBeVisible()
  await page.getByRole("button", { name: "Zoom in" }).click()
  await page.getByRole("button", { name: "Fit view" }).click()
  await expect(canvas.locator(".react-flow__minimap")).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("governed-map-desktop.png"), fullPage: true })
})

test("canvas selection opens authoritative inspector and keyboard clearing restores exact identity", async ({ page }) => {
  const payload = await openGovernedMap(page)
  const candidate: SubgraphNode = payload.nodes.find((node) => node.entityType !== "memory") ?? payload.nodes[0]
  const focusResponse = waitForSuccessfulFocus(page)
  await exactCanvasNode(page, candidate.key).click()
  await focusResponse
  const inspector = page.getByRole("complementary", { name: "Selected node inspector" })
  await expect(inspector).toBeFocused()
  await expect(inspector.getByRole("heading", { name: candidate.label, exact: true })).toBeVisible()
  await inspector.getByText("Technical details", { exact: true }).click()
  await expect(inspector.getByText(candidate.key, { exact: true })).toBeVisible()
  await inspector.getByRole("button", { name: "Clear selection" }).click()
  await expect(exactCanvasNode(page, candidate.key)).toBeFocused()

  const textOpener = exactNodeControl(page, candidate.key)
  await textOpener.focus()
  const keyboardResponse = waitForSuccessfulFocus(page)
  await textOpener.press("Space")
  await keyboardResponse
  await expect(inspector).toBeFocused()
  await inspector.getByRole("button", { name: "Clear selection" }).click()
  await expect(textOpener).toBeFocused()
})

test("connected memory inspection admits its neighborhood lineage relationship", async ({ page }) => {
  await openGovernedMap(page)
  const key = "memory:epic31-memory-related"
  const focusResponse = waitForSuccessfulFocus(page)
  await exactNodeControl(page, key).click()
  const payload = await focusResponse
  expect(payload.inspection?.nodeKey).toBe(key)
  expect(payload.inspection?.lineage).toEqual(expect.arrayContaining([
    expect.objectContaining({
      newerNodeKey: "memory:epic31-memory-current",
      supersededNodeKey: "memory:epic31-memory-previous",
    }),
  ]))
  for (const lineage of payload.inspection?.lineage ?? []) {
    expect(payload.inspection?.relationshipKeys).toContain(lineage.relationshipKey)
  }
  const inspector = page.getByRole("complementary", { name: "Selected node inspector" })
  await expect(inspector.getByRole("heading", { name: "Related governed operating context", exact: true })).toBeVisible()
  await expect(inspector.getByRole("heading", { name: "Lineage", exact: true })).toBeVisible()
})

test("relationship filters remove edges from canvas and text while retaining nodes", async ({ page }) => {
  const payload = await openGovernedMap(page)
  const canvas = page.getByLabel("Knowledge Map canvas")
  const relationship = payload.edges[0]
  expect(relationship, "Browser evidence requires at least one relationship").toBeTruthy()
  const filter = page.getByRole("checkbox", { name: `${relationship.kind.name} (${relationship.kind.classification})`, exact: true })
  await filter.uncheck()
  const remainingEdges = payload.edges.filter((edge) => edge.kind.name !== relationship.kind.name || edge.kind.classification !== relationship.kind.classification)
  await expect(canvas.locator(".react-flow__node")).toHaveCount(payload.nodes.length)
  await expect(page.getByRole("list", { name: "Knowledge Map nodes" }).getByRole("button")).toHaveCount(payload.nodes.length)
  await expect(canvas.locator(".react-flow__edge")).toHaveCount(remainingEdges.length)
  await expect(page.getByRole("list", { name: "Knowledge Map directed relationships" }).getByRole("listitem")).toHaveCount(remainingEdges.length)
})

test("reflows without horizontal overflow at shell and 200-percent-equivalent widths", async ({ page }, testInfo) => {
  await openGovernedMap(page)
  for (const width of [900, 640, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }))
    expect(dimensions.page, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport)
    const canvas = page.getByLabel("Knowledge Map canvas")
    const bounds = await canvas.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`governed-map-${width}${width === 320 ? "-200-percent-equivalent" : ""}.png`), fullPage: true })
  }
})

test("honors reduced motion and keeps named controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await openGovernedMap(page)
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Fit view" })).toBeVisible()
  const animation = await page.getByRole("region", { name: "Governed Knowledge Map" }).evaluate((root) =>
    getComputedStyle(root.querySelector("button")!).animationDuration,
  )
  expect(["0s", "0.00001s", "1e-05s"]).toContain(animation)
})
