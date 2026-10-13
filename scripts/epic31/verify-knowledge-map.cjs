// Read-only browser evidence against an explicitly selected local Knowledge Map.
const { chromium } = require("@playwright/test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")

async function main() {
  const options = {}
  for (const arg of process.argv.slice(2)) {
    const match = /^--(url|output|browser-executable)=(.+)$/.exec(arg)
    if (!match) throw new Error("Use --url=http://127.0.0.1:<port>/dashboard/graph --output=<directory> [--browser-executable=<path>]")
    options[match[1]] = match[2]
  }
  assert.ok(options.url && options.output, "Explicit loopback URL and output directory are required")
  const target = new URL(options.url)
  assert.ok(target.protocol === "http:" && target.hostname === "127.0.0.1" && target.port && target.pathname === "/dashboard/graph" && !target.search && !target.hash, "Only an explicit loopback Knowledge Map URL is allowed")
  const output = path.resolve(options.output)
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(options["browser-executable"] ? { executablePath: options["browser-executable"] } : {}) })
  const checks = []
  const artifacts = []
  const pageErrors = []
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
    const page = await context.newPage()
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await context.route("**/*", (route) => new URL(route.request().url()).origin === target.origin ? route.continue() : route.abort())
    const apiPromise = page.waitForResponse((response) => response.url().includes("/api/memory/graph?") && response.request().method() === "GET")
    const navigation = await page.goto(target.href, { waitUntil: "networkidle" })
    assert.equal(navigation.status(), 200)
    const api = await apiPromise
    const payload = await api.json()
    assert.ok(payload.state === "complete" || payload.state === "partial", `Expected governed graph, received ${payload.state}`)
    const workspace = page.getByRole("region", { name: "Governed Knowledge Map" })
    await workspace.waitFor()
    assert.equal(await workspace.getByRole("list", { name: "Knowledge Map nodes" }).getByRole("button").count(), payload.nodes.length)
    assert.equal(await workspace.getByRole("list", { name: "Knowledge Map directed relationships" }).getByRole("listitem").count(), payload.edges.length)
    assert.equal(await workspace.locator(".react-flow__node").count(), payload.nodes.length)
    assert.equal(await workspace.locator(".react-flow__edge").count(), payload.edges.length)
    assert.equal(await workspace.locator('[data-visual="brain-node"]').count(), payload.nodes.length)
    assert.equal(await workspace.locator('[data-visual="brain-node"] p').count(), 0, "Canvas nodes must not expose record-card summaries")
    checks.push({ id: "REAL_DATA_CORRELATION", nodes: payload.nodes.length, edges: payload.edges.length, passed: true })
    checks.push({ id: "COMPACT_BRAIN_NODES", nodes: payload.nodes.length, recordSummariesInCanvas: 0, passed: true })

    const focusNode = payload.nodes.find((node) => node.entityType !== "memory") || payload.nodes[0]
    const first = workspace.locator(`[data-node-control="text"][data-node-key=${JSON.stringify(focusNode.key)}]`)
    await first.focus()
    const focusPromise = page.waitForResponse((response) => response.url().includes("kind=focus") && response.request().method() === "GET")
    await page.keyboard.press("Space")
    const focusResponse = await focusPromise
    const focusPayload = await focusResponse.json()
    assert.ok(focusPayload.state === "complete" || focusPayload.state === "partial", `Focus ${focusResponse.url()} returned ${JSON.stringify(focusPayload)}`)
    const inspector = workspace.getByRole("complementary", { name: "Selected node inspector" })
    assert.equal(await inspector.evaluate((element) => element === document.activeElement), true)
    await inspector.getByRole("heading", { name: focusNode.label, exact: true }).waitFor()
    await inspector.getByText("Technical details", { exact: true }).click()
    await inspector.getByText(focusNode.key, { exact: true }).waitFor()
    await inspector.getByRole("button", { name: "Back to overview" }).click()
    await page.waitForFunction((nodeKey) => {
      const active = document.activeElement
      return active?.getAttribute("data-node-control") === "text" && active.getAttribute("data-node-key") === nodeKey
    }, focusNode.key)
    checks.push({ id: "KEYBOARD_INSPECTOR_FOCUS", nodeKey: focusNode.key, passed: true })
    assert.equal(await page.locator("#next-logo").count(), 0, "Development tooling must not obscure evidence captures")

    await page.setViewportSize({ width: 1440, height: 1000 })
    const selectedFocusPromise = page.waitForResponse((response) => response.url().includes("kind=focus") && response.request().method() === "GET")
    await workspace.locator(`.react-flow__node[data-id=${JSON.stringify(focusNode.key)}]`).click()
    const selectedFocusResponse = await selectedFocusPromise
    assert.ok(selectedFocusResponse.ok(), `Pointer focus failed with ${selectedFocusResponse.status()}`)
    await inspector.getByRole("heading", { name: focusNode.label, exact: true }).waitFor()
    await page.evaluate(() => window.scrollTo(0, 0))
    const selectedFile = "knowledge-map-1440-selected-inspector.png"
    await page.screenshot({ path: path.join(output, selectedFile) })
    const selectedBytes = await fs.readFile(path.join(output, selectedFile))
    artifacts.push({ file: selectedFile, sha256: crypto.createHash("sha256").update(selectedBytes).digest("hex") })
    checks.push({ id: "POINTER_INSPECTOR_CARD_REVEAL", nodeKey: focusNode.key, passed: true })
    await inspector.getByRole("button", { name: "Back to overview" }).click()

    for (const width of [1440, 900, 640, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => window.scrollTo(0, 0))
      const metrics = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
        contentTop: document.querySelector("[data-dashboard-content]")?.getBoundingClientRect().top ?? -1,
      }))
      assert.ok(metrics.page <= metrics.viewport, JSON.stringify(metrics))
      assert.ok(metrics.contentTop >= 0 && metrics.contentTop < 300, `Dashboard navigation consumes the initial viewport: ${JSON.stringify(metrics)}`)
      await page.getByRole("button", { name: "Fit View" }).evaluate((button) => button.click())
      if (width === 320) {
        assert.equal(await page.getByRole("link", { name: "Knowledge Graph", exact: true }).isVisible(), true)
        assert.equal(await workspace.locator(".react-flow__minimap").isVisible(), false)
      }
      const file = `knowledge-map-${width}${width === 320 ? "-200-percent-equivalent" : ""}.png`
      await page.screenshot({ path: path.join(output, file), fullPage: true })
      const bytes = await fs.readFile(path.join(output, file))
      artifacts.push({ file, sha256: crypto.createHash("sha256").update(bytes).digest("hex") })
      checks.push({ id: `RESPONSIVE_${width}`, effectiveZoom: width === 320 ? "200%-equivalent reflow from a 640 CSS-pixel baseline" : "100%", ...metrics, passed: true })

      if (width !== 1440) {
        const responsiveFocusPromise = page.waitForResponse((response) => response.url().includes("kind=focus") && response.request().method() === "GET")
        await workspace.locator(`[data-node-control="text"][data-node-key=${JSON.stringify(focusNode.key)}]`).click()
        const responsiveFocusResponse = await responsiveFocusPromise
        assert.ok(responsiveFocusResponse.ok(), `Responsive focus failed with ${responsiveFocusResponse.status()}`)
        await inspector.getByRole("heading", { name: focusNode.label, exact: true }).waitFor()
        const inspectorPosition = await inspector.evaluate((element) => getComputedStyle(element).position)
        assert.equal(inspectorPosition, width === 900 ? "fixed" : "static")
        await page.evaluate(() => window.scrollTo(0, 0))
        const selectedResponsiveFile = `knowledge-map-${width}-selected-inspector.png`
        await page.screenshot({ path: path.join(output, selectedResponsiveFile), fullPage: width <= 640 })
        const selectedResponsiveBytes = await fs.readFile(path.join(output, selectedResponsiveFile))
        artifacts.push({ file: selectedResponsiveFile, sha256: crypto.createHash("sha256").update(selectedResponsiveBytes).digest("hex") })
        checks.push({ id: `RESPONSIVE_${width}_SELECTED_INSPECTOR`, position: inspectorPosition, passed: true })
        await inspector.getByRole("button", { name: "Back to overview" }).click()
        await page.evaluate(() => window.scrollTo(0, 0))
      }
    }
    assert.deepEqual(pageErrors, [])
    const receipt = {
      storyId: "31.3",
      criterionIds: [],
      criterionIdNote: "The frozen Story 31.3 specification defines unnumbered acceptance criteria; no identifier mapping was invented.",
      capturedAt: new Date().toISOString(),
      url: page.url(),
      contractVersion: payload.contractVersion,
      graphState: payload.state,
      snapshot: payload.snapshot,
      checks,
      pageErrors,
      artifacts,
      limitations: ["Browser receipt proves the active local principal and returned snapshot only.", "Human acceptance and screen-reader walkthrough remain separate Story 31.4 gates."],
    }
    await fs.writeFile(path.join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
    console.log(JSON.stringify(receipt, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
