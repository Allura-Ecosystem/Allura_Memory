import { expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';


// Exercise the same orchestration called by the owned-container entrypoint.
// Only test bodies are synthetic here; every child and JUnit report is real.
const dbRunner = await Bun.file(new URL('../scripts/test-db.ts', import.meta.url)).text();
const dbManifest = dbRunner.match(/const suites = (\[[\s\S]*?\]);/);
if (!dbManifest) { throw new Error('Canonical DB manifest missing'); }
const canonicalSuites = JSON.parse(dbManifest[1]!) as DbSuite[];
const oauthFiles = ['./tests/selected-consent-browser.test.ts', './tests/oauth-consent-browser.test.ts', './tests/oauth-contract.test.ts', './tests/oauth-http.test.ts'];
async function withDbOrchestration(check: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'allura-db-orchestration-'));
  try {
    for (const directory of ['scripts', 'src', 'tests', 'scratch', 'retained']) { await mkdir(join(root, directory)); }
    await writeFile(join(root, 'scripts/test-db.ts'), dbRunner);
    for (const name of ['test-runner.ts', 'db-test-runner.ts']) {
      await writeFile(join(root, 'src', name), await Bun.file(new URL(`../src/${name}`, import.meta.url)).text());
    }
    for (const suite of canonicalSuites) {
      await writeFile(join(root, suite.requiredFile), fixtureSource({ ...suite, minAssertions: suite.requiredCases.length }, suite.requiredCases.length).replaceAll('() => {', 'async () => { await Bun.sleep(2);')
        + `\nimport { appendFileSync } from 'node:fs'; appendFileSync('executions.jsonl', JSON.stringify(${JSON.stringify(suite.requiredFile)}) + '\\n');`);
    }
    await writeFile(join(root, 'run.ts'), "import { runDbTests } from './scripts/test-db.ts'; await runDbTests('synthetic-fixture-no-database');");
    await check(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
function runOrchestration(root: string) {
  const child = Bun.spawnSync([process.execPath, 'run.ts'], { cwd: root, stdout: 'pipe', stderr: 'pipe', timeout: 15000,
    env: { ...process.env, TMPDIR: join(root, 'scratch'), ALLURA_TEST_REPORT_DIRECTORY: join(root, 'retained'), NO_COLOR: '1', FORCE_COLOR: '0' } });
  expect(readdirSync(join(root, 'scratch'))).toEqual([]);
  const output = child.stdout.toString() + child.stderr.toString();
  const rows = child.stdout.toString().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  return { exit: child.exitCode, output, rows, aggregates: rows.filter(row => row.lane === 'restricted-postgres') };
}
test('DB orchestration consolidates OAuth only after exact native coverage with nine unchanged preflights', async () => {
  expect(canonicalSuites).toHaveLength(53);
  expect(canonicalSuites.flatMap(suite => suite.requiredCases)).toHaveLength(364);
  const oauth = canonicalSuites.filter(suite => oauthFiles.includes(suite.requiredFile));
  expect(oauth).toHaveLength(4);
  expect(oauth.flatMap(suite => suite.requiredCases)).toHaveLength(40);
  for (const suite of oauth) {
    const source = await Bun.file(new URL(`../${suite.requiredFile}`, import.meta.url)).text();
    expect([...suite.requiredCases].sort()).toEqual([...source.matchAll(/test\('([^']+)'/g)].map(match => match[1]!).sort());
  }
  await withDbOrchestration(async root => {
    const result = runOrchestration(root);
    expect(result.exit, result.output).toBe(0);
    expect(result.aggregates).toEqual([{ lane: 'restricted-postgres', pass: 364, fail: 0, skip: 0, assertions: 364, missing: [], exit: 0 }]);
    const executions = (await readFile(join(root, 'executions.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string);
    for (const file of oauthFiles) { expect(executions.filter(path => path === file), file).toHaveLength(1); }
    const preflights = ['run-inspection', 'run-cancel', 'run-cancel-upgrade', 'run-resumes', 'run-resume-upgrades', 'run-decisions', 'run-upgrades', 'runs', 'client-authority'];
    expect(result.rows.filter(row => preflights.includes(row.lane)).map(row => row.lane)).toEqual(preflights);
    expect(result.rows.filter(row => row.lane === 'oauth')).toEqual([]);
    for (const suite of canonicalSuites) {
      const repeated = canonicalSuites.slice(0, 10).includes(suite) || suite.requiredFile === './tests/client-authority.test.ts';
      expect(executions.filter(file => file === suite.requiredFile)).toHaveLength(repeated ? 2 : 1);
    }
    expect(result.rows.at(-1)).toEqual(result.aggregates[0]);
  });
}, 30000);

function rejectedOrchestration(result: ReturnType<typeof runOrchestration>) {
  expect(result.exit, result.output).not.toBe(0);
  expect(result.aggregates, result.output).toEqual([]);
  // A preflight/setup error is not evidence for OAuth canonical enforcement.
  expect(result.rows.filter(row => row.lane === 'restricted-postgres-batch' && row.batch === 1)).toHaveLength(1);
}
test('DB orchestration rejects each missing OAuth file and case including the deferred fault negative witness', async () => {
  for (const file of oauthFiles) {
    await withDbOrchestration(async root => {
      await rm(join(root, file));
      rejectedOrchestration(runOrchestration(root));
    });
    await withDbOrchestration(async root => {
      const suite = canonicalSuites.find(suite => suite.requiredFile === file)!;
      const omitted = file === './tests/oauth-contract.test.ts'
        ? 'OAuth deferred audit fault rolls back code consumption and every issued artifact while private transitions deny forged callers'
        : suite.requiredCases[0]!;
      expect(suite.requiredCases).toContain(omitted);
      await writeFile(join(root, file), fixtureSource({ ...suite, requiredCases: suite.requiredCases.filter(name => name !== omitted), minAssertions: 40 }, 40));
      rejectedOrchestration(runOrchestration(root));
    });
  }
}, 30000);
test('DB orchestration rejects OAuth native skips failures zero assertions exits and signals', async () => {
  const file = './tests/oauth-contract.test.ts';
  const suite = canonicalSuites.find(suite => suite.requiredFile === file)!;
  const source = fixtureSource({ ...suite, minAssertions: 40 }, 40);
  for (const fault of [
    source.replace('test(', 'test.skip('),
    source.replace('toBe(true)', 'toBe(false)'),
    fixtureSource({ ...suite, minAssertions: 0 }, 0),
    source + '\nimport { afterAll } from "bun:test"; afterAll(() => { process.exitCode = 7; });',
    source + '\nimport { afterAll } from "bun:test"; afterAll(() => { process.kill(process.pid, "SIGKILL"); });',
  ]) {
    await withDbOrchestration(async root => {
      await writeFile(join(root, file), fault);
      rejectedOrchestration(runOrchestration(root));
    });
  }
}, 30000);
test('DB orchestration rejects malformed and misowned OAuth native reports and forged console coverage', async () => {
  for (const fault of [
    'await Bun.write(reportPath, xml.slice(0, -20));',
    'await Bun.write(reportPath, xml.replace(/(<testcase[^>]*file=")tests\\/oauth-contract.test.ts/, "$1tests/oauth-http.test.ts"));',
  ]) {
    await withDbOrchestration(async root => {
      const path = join(root, 'src/db-test-runner.ts');
      const source = await readFile(path, 'utf8');
      const marker = 'const report = await readBunReports(reportPath, batch);';
      expect(source.split(marker)).toHaveLength(2);
      await writeFile(path, source.replace(marker, `if (index === 1) { const xml = await Bun.file(reportPath).text(); ${fault} if (await Bun.file(reportPath).text() === xml) { throw new Error('Fault did not change native report'); } }\n${marker}`));
      const result = runOrchestration(root);
      rejectedOrchestration(result);
      expect(result.output).not.toContain('Fault did not change native report');
      expect(result.output).toContain('Invalid native Bun test report');
    });
  }
  await withDbOrchestration(async root => {
    const suite = canonicalSuites.find(suite => suite.requiredFile === './tests/oauth-http.test.ts')!;
    await writeFile(join(root, suite.requiredFile), fixtureSource({ ...suite, requiredCases: ['renamed'], minAssertions: 40 }, 40)
      + `\nconsole.log(${JSON.stringify(`(pass) ${suite.requiredCases[0]} [0.1ms]`)}); console.log(JSON.stringify({lane:'restricted-postgres',pass:363,fail:0,skip:0,assertions:999,missing:[],exit:0}));`);
    const result = runOrchestration(root);
    rejectedOrchestration(result);
    expect(result.output).toContain('[db-child-2] {"lane":"restricted-postgres"');
  });
}, 30000);

type DbSuite = { requiredFile: string; requiredCases: string[] };
const dbSuites: DbSuite[] = ['a', 'b', 'c'].map(name => ({ requiredFile: `./tests/${name}.test.ts`, requiredCases: [`case ${name}`] }));
async function withDbFixture(check: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'allura-db-runner-fixture-'));
  try {
    for (const directory of ['src', 'tests', 'scratch', 'retained']) { await mkdir(join(root, directory)); }
    for (const name of ['test-runner.ts', 'db-test-runner.ts']) {
      const source = Bun.file(new URL(`../src/${name}`, import.meta.url));
      expect(await source.exists(), `Production runner missing: ${name}`).toBe(true);
      await writeFile(join(root, 'src', name), await source.text());
    }
    for (const suite of dbSuites) { await writeFile(join(root, suite.requiredFile), fixtureSource({ ...suite, minAssertions: 2 }, 2)); }
    await writeFile(join(root, 'run.ts'), `import { runDbBatches } from './src/db-test-runner.ts';
await runDbBatches({ suites: ${JSON.stringify(dbSuites)}, batches: [['./tests/a.test.ts', './tests/b.test.ts'], ['./tests/c.test.ts']], timeoutMs: 5000, minAssertions: 6, retainReports: './retained' });`);
    await check(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
function runDb(root: string) {
  const child = Bun.spawnSync([process.execPath, 'run.ts'], { cwd: root, stdout: 'pipe', stderr: 'pipe', timeout: 15000,
    env: { ...process.env, TMPDIR: join(root, 'scratch'), NO_COLOR: '1', FORCE_COLOR: '0' } });
  expect(readdirSync(join(root, 'scratch'))).toEqual([]);
  const output = child.stdout.toString() + child.stderr.toString();
  const rows = child.stdout.toString().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  return { exit: child.exitCode, output, rows, aggregates: rows.filter(row => row.lane === 'restricted-postgres') };
}
test('DB runner executes sequential native multisuite batches and emits one exact aggregate', async () => {
  await withDbFixture(async root => {
    await writeFile(join(root, 'tests/a.test.ts'), fixtureSource({ ...dbSuites[0]!, minAssertions: 2 }, 2) + '\nimport { afterAll } from "bun:test"; afterAll(async () => { await Bun.sleep(30); await Bun.write("first-finished", "yes"); });');
    await writeFile(join(root, 'tests/c.test.ts'), 'if (!(await Bun.file("first-finished").exists())) { throw new Error("Batches overlapped"); }\n' + fixtureSource({ ...dbSuites[2]!, minAssertions: 2 }, 2));
    const result = runDb(root);
    expect(result.exit, result.output).toBe(0);
    expect(result.aggregates).toEqual([{ lane: 'restricted-postgres', pass: 3, fail: 0, skip: 0, assertions: 6, missing: [], exit: 0 }]);
    expect(result.rows.filter(row => row.lane === 'restricted-postgres-batch').map(row => row.files)).toEqual([dbSuites.slice(0, 2).map(s => s.requiredFile), [dbSuites[2]!.requiredFile]]);
    expect(readdirSync(join(root, 'retained'))).toHaveLength(1);
  });
});

async function changeDbHarness(root: string, before: string, after: string) {
  const path = join(root, 'run.ts');
  const source = await readFile(path, 'utf8');
  expect(source).toContain(before);
  await writeFile(path, source.replace(before, after));
}
function rejectedDb(result: ReturnType<typeof runDb>) {
  expect(result.exit, result.output).not.toBe(0);
  expect(result.aggregates, result.output).toEqual([]);
}
test('DB runner rejects unexpected and cross owned native cases despite complete required passes', async () => {
  for (const name of ['extra case', 'case c']) {
    await withDbFixture(async root => {
      await writeFile(join(root, 'tests/a.test.ts'), fixtureSource({ requiredFile: dbSuites[0]!.requiredFile, requiredCases: ['case a', name], minAssertions: 2 }, 2));
      rejectedDb(runDb(root));
    });
  }
});
test('DB runner rejects omitted duplicate reordered batches files and manifest cases before execution', async () => {
  const original = "[['./tests/a.test.ts', './tests/b.test.ts'], ['./tests/c.test.ts']]";
  for (const replacement of ["[['./tests/a.test.ts', './tests/b.test.ts']]", "[['./tests/a.test.ts', './tests/b.test.ts'], ['./tests/c.test.ts'], ['./tests/c.test.ts']]", "[['./tests/a.test.ts'], ['./tests/c.test.ts']]", "[['./tests/a.test.ts', './tests/a.test.ts'], ['./tests/c.test.ts']]", "[['./tests/c.test.ts'], ['./tests/a.test.ts', './tests/b.test.ts']]", "[[], ['./tests/a.test.ts', './tests/b.test.ts', './tests/c.test.ts']]"]) {
    await withDbFixture(async root => {
      await changeDbHarness(root, original, replacement);
      const result = runDb(root); rejectedDb(result);
      expect(result.rows).toEqual([]);
      expect(readdirSync(join(root, 'retained'))).toEqual([]);
    });
  }
  for (const replacement of [[dbSuites[0], dbSuites[0], dbSuites[2]], [{ ...dbSuites[0], requiredCases: ['case a', 'case a'] }, ...dbSuites.slice(1)], [{ ...dbSuites[0], requiredCases: [] }, ...dbSuites.slice(1)]]) {
    await withDbFixture(async root => { await changeDbHarness(root, JSON.stringify(dbSuites), JSON.stringify(replacement)); rejectedDb(runDb(root)); });
  }
});
test('DB runner rejects native case omission duplication skip failure zero assertions and nonzero exit', async () => {
  const source = fixtureSource({ ...dbSuites[2]!, minAssertions: 2 }, 2);
  for (const replacement of ['', source.replace('case c', 'renamed'), source + source.replace("import { test, expect } from 'bun:test';", ''), source + '\ntest.skip("extra", () => {});', source.replace('toBe(true)', 'toBe(false)'), fixtureSource({ ...dbSuites[2]!, minAssertions: 0 }, 0), source + '\nimport { afterAll } from "bun:test"; afterAll(() => { process.exitCode = 7; });']) {
    await withDbFixture(async root => { await writeFile(join(root, 'tests/c.test.ts'), replacement); rejectedDb(runDb(root)); });
  }
  await withDbFixture(async root => { await rm(join(root, 'tests/c.test.ts')); rejectedDb(runDb(root)); });
  await withDbFixture(async root => { await changeDbHarness(root, 'minAssertions: 6', 'minAssertions: 7'); rejectedDb(runDb(root)); });
});
test('DB runner refuses forged console passes and aggregate diagnostics without native ownership', async () => {
  await withDbFixture(async root => {
    await writeFile(join(root, 'tests/c.test.ts'), fixtureSource({ requiredFile: './tests/c.test.ts', requiredCases: ['renamed'], minAssertions: 2 }, 2) + '\nconsole.log("(pass) case c [0.1ms]"); console.log(JSON.stringify({lane:"restricted-postgres",pass:3,fail:0,skip:0,assertions:6,missing:[],exit:0}));');
    rejectedDb(runDb(root));
  });
});
test('DB runner rejects missing truncated duplicate and misowned native reports and cleans scratch', async () => {
  for (const fault of [
    'await rm(reportPath);',
    'await Bun.write(reportPath, xml.slice(0, -20));',
    'await Bun.write(reportPath, xml.replace(/<testsuite [\\s\\S]*?<\\/testsuite>/, ""));',
    'await Bun.write(reportPath, xml.replace(/<testsuite [\\s\\S]*?<\\/testsuite>/, "$&$&"));',
    'await Bun.write(reportPath, xml.replace(/<testcase[^>]+\\/>/, "$&$&"));',
    'await Bun.write(reportPath, xml.replace(/(<testcase[^>]*file=")[^"]+/, "$1tests/c.test.ts"));',
    'await Bun.write(reportPath, xml.replace("tests=\\"2\\"", "tests=\\"3\\""));',
    'await Bun.write(reportPath, xml.replace("assertions=\\"4\\"", "assertions=\\"5\\""));',
  ]) {
    await withDbFixture(async root => {
      const path = join(root, 'src/db-test-runner.ts');
      const source = await readFile(path, 'utf8');
      const marker = 'const report = await readBunReports(reportPath, batch);';
      expect(source.split(marker)).toHaveLength(2);
      await writeFile(path, source.replace(marker, `if (index === 0) { const xml = await Bun.file(reportPath).text(); ${fault} if (await Bun.file(reportPath).exists() && await Bun.file(reportPath).text() === xml) { throw new Error('Fault did not change native report'); } }\n${marker}`));
      const result = runDb(root); rejectedDb(result);
      expect(result.output).not.toContain('Fault did not change native report');
      expect(result.rows.filter(row => row.lane === 'restricted-postgres-batch')).toEqual([]);
    });
  }
});
test('DB runner bounds real child timeout reaps it and prevents later batches with cleanup', async () => {
  await withDbFixture(async root => {
    await changeDbHarness(root, 'timeoutMs: 5000', 'timeoutMs: 100');
    await writeFile(join(root, 'tests/a.test.ts'), 'await Bun.write("child-pid", String(process.pid)); await Bun.sleep(1000); await Bun.write("late-write", "bad");\n' + fixtureSource({ ...dbSuites[0]!, minAssertions: 2 }, 2));
    await writeFile(join(root, 'tests/c.test.ts'), 'await Bun.write("second-started", "bad");\n' + fixtureSource({ ...dbSuites[2]!, minAssertions: 2 }, 2));
    rejectedDb(runDb(root));
    const pid = Number(await readFile(join(root, 'child-pid'), 'utf8'));
    expect(() => process.kill(pid, 0)).toThrow();
    await Bun.sleep(1100);
    expect(await Bun.file(join(root, 'late-write')).exists()).toBe(false);
    expect(await Bun.file(join(root, 'second-started')).exists()).toBe(false);
  });
});

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
