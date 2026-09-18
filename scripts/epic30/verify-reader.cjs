// Read-only browser proof against an explicitly selected, already-running local demo.
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  const options = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--(url|output|browser-executable)=(.+)$/.exec(arg);
    if (!match) throw new Error('Use --url=http://127.0.0.1:<port>/dashboard --output=<directory> [--browser-executable=<path>]');
    options[match[1]] = match[2];
  }
  assert.ok(options.url && options.output, 'Explicit loopback URL and output directory are required');
  const target = new URL(options.url);
  assert.ok(target.protocol === 'http:' && target.hostname === '127.0.0.1' && target.port && target.pathname === '/dashboard' && !target.username && !target.password && !target.search && !target.hash, 'Only an explicit loopback dashboard is allowed');
  const out = path.resolve(options.output);
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(options['browser-executable'] ? { executablePath: options['browser-executable'] } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'America/New_York' });
    const page = await context.newPage(); const errors = []; const checks = []; const screenshots = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => new URL(route.request().url()).origin === target.origin ? route.continue() : route.abort());
    const response = await page.goto(target.href, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    const workspace = page.locator('section[aria-label="My Work synthetic local workspace"]');
    await workspace.waitFor();
    const buttons = workspace.getByRole('navigation', { name: 'Authorized synthetic Brain tree' }).getByRole('button');
    const mainDocument = workspace.locator('article');
    assert.ok(await buttons.count() >= 3, 'Expected multiple private and department fixture documents');
    for (const index of [0, 1, 2, 0, 1]) {
      const button = buttons.nth(index);
      const title = (await button.evaluate(element => element.childNodes[0].textContent)).trim();
      await button.click();
      assert.equal((await mainDocument.locator('h2').innerText()).trim(), title);
      checks.push({ name: 'tree selection', index, title, passed: true });
    }
    for (const width of [1440, 640, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const opener = workspace.getByRole('button', { name: /^Open / });
      await opener.focus(); await page.keyboard.press('Enter');
      const pane = workspace.getByRole('complementary', { name: 'Comparison pane' });
      await pane.waitFor();
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
      assert.ok(metrics.width <= width, JSON.stringify(metrics));
      if (width <= 640) {
        const boxes = await workspace.locator('nav, article, aside').evaluateAll(elements => elements.map(element => {
          const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, bottom: box.bottom };
        }));
        assert.equal(boxes[0].x, boxes[1].x); assert.equal(boxes[1].x, boxes[2].x);
        assert.ok(boxes[1].y >= boxes[0].bottom && boxes[2].y >= boxes[1].bottom);
      }
      const file = `comparison-${width}.png`; screenshots.push(file);
      await page.screenshot({ path: path.join(out, file), fullPage: true });
      await workspace.getByRole('button', { name: 'Close pane' }).focus(); await page.keyboard.press('Enter');
      assert.equal(await opener.evaluate(element => element === document.activeElement), true, 'Focus must return to opener');
      checks.push({ name: 'comparison reflow and keyboard focus', ...metrics, passed: true });
    }
    await workspace.getByRole('button', { name: 'Ask allura', exact: true }).click();
    assert.equal(await workspace.getByText('Unavailable in this local fixture', { exact: true }).isVisible(), true);
    checks.push({ name: 'honest Ask unavailable', passed: true }); assert.deepEqual(errors, []);
    const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
    const sourceHashes = [];
    for (const file of ['src/components/dashboard/my-work-workspace.tsx', 'src/components/dashboard/my-work-workspace.module.css', 'src/app/dashboard/page.tsx']) {
      sourceHashes.push({ file, sha256: sha256(await fs.readFile(path.resolve(__dirname, '../..', file))) });
    }
    const artifacts = [];
    for (const file of screenshots) artifacts.push({ file, sha256: sha256(await fs.readFile(path.join(out, file))) });
    const receipt = { capturedAt: new Date().toISOString(), url: page.url(), http: 200, checks, pageErrors: errors, sourceHashes, artifacts,
      limitations: ['Existing synthetic owner session only; no role matrix, screen reader, actual 200% zoom or human acceptance.', 'No demo restart or reseed. Source hashes identify this checkout, not a remote server deployment.'] };
    await fs.writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
