import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBunReports } from './test-runner.ts';

export type DbSuite = { requiredFile: string; requiredCases: string[] };
type Options = { suites: DbSuite[]; batches: string[][]; timeoutMs: number; minAssertions: number; env?: NodeJS.ProcessEnv; retainReports?: string | undefined };
function requireValid(value: unknown): asserts value {
  if (!value) { throw new Error('Required canonical database batches failed'); }
}

// All three children use the same caller-owned DB and run sequentially: fixtures
// rotate restricted-role passwords. Only native reports may supply test counts.
export async function runDbBatches(options: Options) {
  const { suites, batches, timeoutMs, minAssertions } = options;
  requireValid(batches.length === 3 && batches.every(batch => batch.length > 0));
  const files = suites.map(suite => suite.requiredFile);
  requireValid(files.length > 0 && new Set(files).size === files.length);
  requireValid(JSON.stringify(batches.flat()) === JSON.stringify(files));
  const names = suites.flatMap(suite => suite.requiredCases);
  requireValid(suites.every(suite => /^\.\/tests\/[a-z0-9-]+\.test\.ts$/.test(suite.requiredFile) && suite.requiredCases.length > 0));
  requireValid(names.every(name => typeof name === 'string' && name.length > 0) && new Set(names).size === names.length);
  requireValid(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 240000);
  requireValid(Number.isSafeInteger(minAssertions) && minAssertions > 0);
  const directory = await mkdtemp(join(tmpdir(), 'allura-db-report-'));
  let retained: string | undefined;
  const total = { pass: 0, fail: 0, skip: 0, assertions: 0 };
  try {
    if (options.retainReports) {
      await mkdir(options.retainReports, { recursive: true });
      retained = await mkdtemp(join(options.retainReports, 'canonical-'));
    }
    for (const [index, batch] of batches.entries()) {
      for (const file of batch) { requireValid(await Bun.file(file).exists()); }
      const reportPath = join(directory, `batch-${index + 1}.xml`);
      const started = performance.now();
      const child = Bun.spawnSync([process.execPath, 'test', '--reporter=junit', `--reporter-outfile=${reportPath}`, ...batch], {
        stdout: 'pipe', stderr: 'pipe', timeout: timeoutMs, killSignal: 'SIGKILL',
        env: { ...process.env, ...options.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      });
      // Console diagnostics cannot impersonate the aggregate consumed by CI.
      for (const [stream, bytes] of [[process.stdout, child.stdout], [process.stderr, child.stderr]] as const) {
        for (const line of bytes.toString().split('\n')) { if (line) { stream.write(`[db-child-${index + 1}] ${line}\n`); } }
      }
      if (retained && await Bun.file(reportPath).exists()) { await copyFile(reportPath, join(retained, `batch-${index + 1}.xml`)); }
      const report = await readBunReports(reportPath, batch);
      const missing = suites.filter(suite => batch.includes(suite.requiredFile)).flatMap(suite => {
        const actual = report.suites.find(row => row.file === suite.requiredFile.slice(2))!;
        requireValid(actual.pass > 0 && actual.assertions > 0 && actual.passedCases.size === suite.requiredCases.length && [...actual.passedCases].every(name => suite.requiredCases.includes(name)));
        return suite.requiredCases.filter(name => !actual.passedCases.has(name));
      });
      console.log(JSON.stringify({ lane: 'restricted-postgres-batch', batch: index + 1, files: batch, pass: report.pass, fail: report.fail, skip: report.skip, assertions: report.assertions, missing, exit: child.exitCode, signal: child.signalCode, durationMs: performance.now() - started, timeoutMs, reportPath: retained ? join(retained, `batch-${index + 1}.xml`) : null }));
      requireValid(child.exitCode === 0 && !child.signalCode && report.pass > 0 && report.assertions > 0 && report.fail === 0 && report.skip === 0 && missing.length === 0);
      for (const key of ['pass', 'fail', 'skip', 'assertions'] as const) { total[key] += report[key]; }
    }
    requireValid(total.assertions >= minAssertions);
    const aggregate = { lane: 'restricted-postgres', ...total, missing: [], exit: 0 };
    console.log(JSON.stringify(aggregate));
    return aggregate;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
