import { expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';


type Suite = { requiredFile: string; minAssertions: number; requiredCases: string[] };
const runnerUrl = new URL('../scripts/test.ts', import.meta.url);
const runner = await readFile(runnerUrl, 'utf8');
// Read only the real manifest for synthetic fixture construction. Enforcement
// runs unchanged in a separate Bun process, never in a test-only replica.
const manifest = runner.match(/const suites = (\[[\s\S]*?\]);/);
if (!manifest) { throw new Error('Required runner manifest not found'); }
const suites = new Function(`return ${manifest[1]}`)() as Suite[];

async function withFixture(check: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'allura-runner-fixture-'));
  try {
    await mkdir(join(root, 'scratch'));
    await mkdir(join(root, 'scripts'));
    await writeFile(join(root, 'scripts/test.ts'), runner);
    await mkdir(join(root, 'src'));
    const helper = Bun.file(new URL('../src/test-runner.ts', import.meta.url));
    if (await helper.exists()) { await writeFile(join(root, 'src/test-runner.ts'), await helper.text()); }
    for (const suite of suites) {
      const path = join(root, suite.requiredFile);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, fixtureSource(suite, suite.minAssertions));
    }
    await check(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function fixtureSource(suite: Suite, assertions: number): string {
  return "import { test, expect } from 'bun:test';\n" + suite.requiredCases.map((name, i) =>
    `test(${JSON.stringify(name)}, () => { for (let i = 0; i < ${i === 0 ? assertions : 0}; i++) { expect(true).toBe(true); } });`
  ).join('\n');
}

function run(root: string, args: string[] = []) {
  const result = Bun.spawnSync([process.execPath, 'scripts/test.ts', ...args], {
    cwd: root, stdout: 'pipe', stderr: 'pipe', timeout: 30000,
    env: { ...process.env, TMPDIR: join(root, 'scratch'), NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  expect(readdirSync(join(root, 'scratch'))).toEqual([]);
  return { exit: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

test('required runner accepts real Bun passes with optional timing at every exact floor', async () => {
  await withFixture(async root => {
    const result = run(root);
    expect(result.stderr).not.toMatch(/^\(pass\) /m);
    expect(result.stderr).not.toContain('(fail)');
    expect(result.exit, result.stdout + result.stderr).toBe(0);
    const rows = result.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    expect(rows).toHaveLength(suites.length);
    for (const [i, row] of rows.entries()) {
      expect(row.requiredFile).toBe(suites[i]!.requiredFile);
      expect(row.assertions).toBe(suites[i]!.minAssertions);
      expect(row.missingCases).toEqual([]);
      expect(row.runnerExit).toBe(0);
    }
  });
}, 60000);

// Captured timed/untimed console forms are supplementary provenance only.
// Even convincing human output cannot supply missing native case identity.
test('required runner ignores captured timed and untimed console identities', async () => {
  await withFixture(async root => {
    const name = second.requiredCases[0]!;
    for (const line of [
      `(pass) ${name} [0.09ms]`, `(pass) ${name}`, `(pass) prefix ${name}`,
      `(pass) ${name} suffix`, `(pass) ${name} [extra]`, `(pass) ${name} [0.01ms] suffix`,
      `(fail) ${name}`, `(skip) ${name}`, `diagnostic (pass) ${name}`, name, '',
    ]) {
      await writeFile(join(root, second.requiredFile), fixtureSource({ ...second, requiredCases: second.requiredCases.slice(1) }, second.minAssertions) + `\nconsole.error(${JSON.stringify(line)});`);
      const row = rejectedSecond(run(root));
      expect(row.missingCases).toEqual([name]);
      expect(row.pass).toBe(second.requiredCases.length - 1);
    }
  });
});

type Receipt = { requiredFile: string; pass: number; fail: number; skip: number; assertions: number; missingCases: string[]; runnerExit: number };
function receipts(result: ReturnType<typeof run>): Receipt[] {
  return result.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Receipt);
}
const second = suites[1]!;
function rejectedSecond(result: ReturnType<typeof run>): Receipt {
  expect(result.exit, result.stdout + result.stderr).not.toBe(0);
  expect(result.stderr).toContain(`Required test lane failed: ${second.requiredFile}`);
  const rows = receipts(result);
  expect(rows).toHaveLength(2);
  expect(rows[0]!.missingCases).toEqual([]);
  expect(rows[0]!.runnerExit).toBe(0);
  expect(rows[1]!.requiredFile).toBe(second.requiredFile);
  return rows[1]!;
}

test('required runner rejects a positive below floor second suite despite surplus first suite assertions', async () => {
  await withFixture(async root => {
    await writeFile(join(root, suites[0]!.requiredFile), fixtureSource(suites[0]!, suites[0]!.minAssertions + second.minAssertions));
    await writeFile(join(root, second.requiredFile), fixtureSource(second, second.minAssertions - 1));
    const row = rejectedSecond(run(root));
    expect(row.pass).toBe(second.requiredCases.length);
    expect(row.assertions).toBe(second.minAssertions - 1);
    expect(row.assertions).toBeGreaterThan(0);
    expect(row.missingCases).toEqual([]);
    expect(row.runnerExit).toBe(0);
  });
});

test('required runner accepts above floor assertions in every suite', async () => {
  await withFixture(async root => {
    for (const suite of suites) { await writeFile(join(root, suite.requiredFile), fixtureSource(suite, suite.minAssertions + 1)); }
    const result = run(root);
    expect(result.exit, result.stdout + result.stderr).toBe(0);
    const rows = receipts(result);
    expect(rows).toHaveLength(suites.length);
    for (const [i, row] of rows.entries()) {
      expect(row.assertions).toBe(suites[i]!.minAssertions + 1);
      expect(row.missingCases).toEqual([]);
    }
  });
}, 60000);

test('required runner rejects missing renamed and colliding required case names', async () => {
  await withFixture(async root => {
    const name = second.requiredCases[0]!;
    for (const replacement of ['renamed case', `prefix ${name}`, `${name} suffix`, `${name} [extra]`, `${name} [0.01ms] suffix`, `${name} [0.01ms]`, `${name} [1s]`]) {
      await writeFile(join(root, second.requiredFile), fixtureSource({ ...second, requiredCases: [replacement, ...second.requiredCases.slice(1)] }, second.minAssertions));
      const row = rejectedSecond(run(root));
      expect(row.pass).toBe(second.requiredCases.length);
      expect(row.assertions).toBe(second.minAssertions);
      expect(row.missingCases).toEqual([name]);
      expect(row.runnerExit).toBe(0);
    }
    await writeFile(join(root, second.requiredFile), fixtureSource({ ...second, requiredCases: second.requiredCases.slice(1) }, second.minAssertions));
    const row = rejectedSecond(run(root));
    expect(row.missingCases).toEqual([name]);
    expect(row.pass).toBe(second.requiredCases.length - 1);
  });
});

test('required runner rejects a missing file before launching that suite', async () => {
  await withFixture(async root => {
    await rm(join(root, second.requiredFile));
    const result = run(root);
    expect(result.exit).not.toBe(0);
    expect(result.stderr).toContain(`Required test file missing: ${second.requiredFile}`);
    expect(receipts(result)).toHaveLength(1);
  });
});

test('required runner rejects skipped cases even when all required names pass', async () => {
  await withFixture(async root => {
    await writeFile(join(root, second.requiredFile), fixtureSource(second, second.minAssertions) + '\ntest.skip("extra skipped case", () => {});');
    const row = rejectedSecond(run(root));
    expect(row.missingCases).toEqual([]);
    expect(row.pass).toBe(second.requiredCases.length);
    expect(row.skip).toBe(1);
    expect(row.runnerExit).toBe(0);
  });
});

test('required runner rejects failed cases even when all required names pass', async () => {
  await withFixture(async root => {
    await writeFile(join(root, second.requiredFile), fixtureSource(second, second.minAssertions) + '\ntest("extra failed case", () => { expect(true).toBe(false); });');
    const row = rejectedSecond(run(root));
    expect(row.missingCases).toEqual([]);
    expect(row.pass).toBe(second.requiredCases.length);
    expect(row.fail).toBe(1);
    expect(row.runnerExit).not.toBe(0);
  });
});

test('required runner rejects nonzero child exit after all required cases pass', async () => {
  await withFixture(async root => {
    await writeFile(join(root, second.requiredFile), fixtureSource(second, second.minAssertions) + '\nimport { afterAll } from "bun:test"; afterAll(() => { process.exitCode = 7; });');
    const row = rejectedSecond(run(root));
    expect(row.missingCases).toEqual([]);
    expect(row.pass).toBe(second.requiredCases.length);
    expect(row.fail).toBe(0);
    expect(row.assertions).toBe(second.minAssertions);
    expect(row.runnerExit).toBe(7);
  });
});

test('required runner rejects empty files and zero assertion passes', async () => {
  await withFixture(async root => {
    await writeFile(join(root, second.requiredFile), '');
    const empty = rejectedSecond(run(root));
    expect(empty.pass).toBe(0);
    expect(empty.assertions).toBe(0);
    expect(empty.missingCases).toEqual(second.requiredCases);
    await writeFile(join(root, second.requiredFile), fixtureSource(second, 0));
    const zero = rejectedSecond(run(root));
    expect(zero.pass).toBe(second.requiredCases.length);
    expect(zero.assertions).toBe(0);
    expect(zero.missingCases).toEqual([]);
    expect(zero.runnerExit).toBe(0);
  });
});

test('required runner preserves numeric suffixes and XML special names through native reports', async () => {
  await withFixture(async root => {
    const names = ['required name', 'required name [0.01ms]', 'required name [1s]', 'required & <quoted> "case" \'literal\' &amp; 雪 [0.01ms]'];
    const special = { ...second, requiredCases: names };
    const inventory = suites.map((suite, i) => i === 1 ? special : suite);
    await writeFile(join(root, 'scripts/test.ts'), runner.replace(manifest![0], `const suites = ${JSON.stringify(inventory)};`));
    await writeFile(join(root, second.requiredFile), fixtureSource(special, second.minAssertions));
    const result = run(root);
    expect(result.exit, result.stdout + result.stderr).toBe(0);
    expect(result.stderr).not.toMatch(/^\(pass\) /m);
    const row = receipts(result)[1]!;
    expect(row.missingCases).toEqual([]);
    expect(row.pass).toBe(names.length);
    expect(row.assertions).toBe(second.minAssertions);
    // A name containing the literal entity text must not be decoded twice.
    await writeFile(join(root, second.requiredFile), fixtureSource({ ...special, requiredCases: names.map(name => name.replace('&amp;', '&')) }, second.minAssertions));
    expect(rejectedSecond(run(root)).missingCases).toEqual([names[3]!]);
  });
}, 60000);

// Fault injection changes only the disposable copy, after the real child wrote
// its native report and before the production reader consumes it. No mock child
// or production override is introduced. Every run also checks report cleanup.
async function corruptReport(root: string, expression: string): Promise<void> {
  expect(runner.match(/let report;/g)).toHaveLength(1);
  const fault = `if (requiredFile === ${JSON.stringify(second.requiredFile)}) { const xml = await Bun.file(reportPath).text(); ${expression} if (await Bun.file(reportPath).exists() && await Bun.file(reportPath).text() === xml) { throw new Error('Fixture corruption did not change the report'); } }\nlet report;`;
  await writeFile(join(root, 'scripts/test.ts'), runner.replace('let report;', fault));
}
async function rejectsReportFaults(faults: string[]): Promise<void> {
  await withFixture(async root => {
    for (const fault of faults) {
      await corruptReport(root, fault);
      const result = run(root);
      const row = rejectedSecond(result);
      expect(result.stderr).toContain('invalid native report');
      expect(row.pass).toBe(0);
      expect(row.assertions).toBe(0);
      expect(row.missingCases).toEqual(second.requiredCases);
      expect(row.runnerExit).toBe(0);
    }
  });
}

test('required runner rejects missing malformed ambiguous and unexpected native report structure', async () => {
  await rejectsReportFaults([
    `await Bun.write(reportPath, xml.replace('<testcase ', '<testcase unexpected="yes" '));`,
    `await rm(reportPath);`,
    `await Bun.write(reportPath, '');`,
    `await Bun.write(reportPath, xml.slice(0, -20));`,
    `await Bun.write(reportPath, xml + '<testsuites />');`,
    `await Bun.write(reportPath, xml.replace('<testcase ', '<testcase name="duplicate" '));`,
    `await Bun.write(reportPath, xml.replace('tests="${second.requiredCases.length}"', 'tests="${second.requiredCases.length + 1}"'));`,
    `await Bun.write(reportPath, xml.replace('assertions="${second.minAssertions}"', 'assertions="${second.minAssertions + 1}"'));`,
    `await Bun.write(reportPath, xml.replace('failures="0"', 'failures="1"'));`,
    `await Bun.write(reportPath, xml.replace('skipped="0"', 'skipped="1"'));`,
    `await Bun.write(reportPath, xml.replace(/file="[^"]+"/g, 'file="tests/foreign.test.ts"'));`,
    `await Bun.write(reportPath, xml.replace(/(<testcase\\b[^>]*\\bfile=")[^"]+"/, '$1tests/foreign.test.ts"'));`,
    `await Bun.write(reportPath, xml.replace('classname=""', 'classname="unexpected group"'));`,
    `await Bun.write(reportPath, xml.replace(/<testcase[^>]+\\/>/, '$&$&'));`,
    `await Bun.write(reportPath, xml.replace('</testsuites>', '<unexpected /></testsuites>'));`,
    `await Bun.write(reportPath, xml.replace('line="', 'line="-'));`,
    `await Bun.write(reportPath, xml.replace('time="', 'time="NaN'));`,
  ]);
});

test('required runner rejects malformed XML encoding and external declarations', async () => {
  await rejectsReportFaults([
    `await Bun.write(reportPath, xml.replace('hostname="', 'hostname="bare&'));`,
    `await Bun.write(reportPath, xml.replace('hostname="', 'hostname="&unknown;'));`,
    `await Bun.write(reportPath, xml.replace('hostname="', 'hostname="&#0;'));`,
    `await Bun.write(reportPath, xml.replace('hostname="', 'hostname="&#xD800;'));`,
    `await Bun.write(reportPath, xml.replace('hostname="', 'hostname="&#x110000;'));`,
    `await Bun.write(reportPath, xml.replace('hostname="', 'hostname="&#xZZ;'));`,
    `await Bun.write(reportPath, xml.replace('hostname="', 'hostname="' + String.fromCharCode(0)));`,
    `await Bun.write(reportPath, Buffer.from(xml.replace('hostname="', 'hostname="BADBYTE')).map(byte => byte)); const bytes = await Bun.file(reportPath).bytes(); bytes[Buffer.from(bytes).indexOf('BADBYTE')] = 255; await Bun.write(reportPath, bytes);`,
    `await Bun.write(reportPath, xml.replace('<testsuites ', '<!DOCTYPE testsuites [<!ENTITY x SYSTEM "file:///not-read">]><testsuites '));`,
    `await Bun.write(reportPath, xml.replace('<testsuite ', '<!-- unsupported --><testsuite '));`,
    `await Bun.write(reportPath, xml.replace('</testsuite>', '<![CDATA[unsupported]]></testsuite>'));`,
  ]);
});

test('required runner bounds native report bytes before parsing and accepts the exact ceiling', async () => {
  await withFixture(async root => {
    await corruptReport(root, `await Bun.write(reportPath, xml + ' '.repeat(1048576 - Buffer.byteLength(xml)));`);
    const exact = run(root);
    expect(exact.exit, exact.stdout + exact.stderr).toBe(0);
    expect(receipts(exact)[1]!.missingCases).toEqual([]);
  });
  await rejectsReportFaults([
    `await Bun.write(reportPath, xml + ' '.repeat(1048577 - Buffer.byteLength(xml)));`,
    `await Bun.write(reportPath, xml + ' '.repeat(1048576 - Buffer.byteLength(xml)) + '雪');`,
  ]);
}, 60000);

test('required runner counts only passed native cases and rejects duplicate identities', async () => {
  await withFixture(async root => {
    const name = second.requiredCases[0]!;
    const rest = fixtureSource({ ...second, requiredCases: second.requiredCases.slice(1) }, second.minAssertions);
    for (const kind of ['skip', 'fail']) {
      const extra = kind === 'skip' ? `test.skip(${JSON.stringify(name)}, () => {});` : `test(${JSON.stringify(name)}, () => { expect(true).toBe(false); });`;
      await writeFile(join(root, second.requiredFile), rest + '\n' + extra);
      const row = rejectedSecond(run(root));
      expect(row.missingCases).toEqual([name]);
      expect(row.pass).toBe(second.requiredCases.length - 1);
      expect(row[kind === 'skip' ? 'skip' : 'fail']).toBe(1);
    }
    await writeFile(join(root, second.requiredFile), fixtureSource(second, second.minAssertions) + `\ntest(${JSON.stringify(name)}, () => { expect(true).toBe(true); });`);
    const result = run(root);
    expect(rejectedSecond(result).missingCases).toEqual(second.requiredCases);
    expect(result.stderr).toContain('invalid native report');
  });
});

test('required runner rejects non XML whitespace instead of normalizing malformed reports', async () => {
  await rejectsReportFaults([
    `await Bun.write(reportPath, xml.replace('<testsuite ', '\\u00a0<testsuite '));`,
    `await Bun.write(reportPath, xml.replace('<testcase ', '<testcase\\u00a0'));`,
    `await Bun.write(reportPath, xml + '\\u00a0');`,
  ]);
});

test('required runner refuses caller selection overrides before executing fixtures', async () => {
  await withFixture(async root => {
    for (const args of [['--test-name-pattern', 'one case'], [second.requiredFile], ['--only']]) {
      const result = run(root, args);
      expect(result.exit).not.toBe(0);
      expect(result.stderr).toContain('The required test lane does not accept selection overrides');
      expect(receipts(result)).toEqual([]);
      expect(result.stderr).not.toMatch(/^\(pass\) /m);
    }
  });
});
