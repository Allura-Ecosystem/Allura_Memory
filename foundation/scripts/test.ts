// Bun 1.3.14 exits zero for empty test files: verify execution, not just exit.
const suites = [{ requiredFile: './tests/transform-text.test.ts', minAssertions: 19, requiredCases: [
  'trims valid text and transforms it exactly once',
  'rejects invalid input before invoking the transform',
  'propagates the original transform error without retry',
] }, { requiredFile: './tests/authority.test.ts', minAssertions: 75, requiredCases: [
  'signed human resolves stable principal and exact workspace action',
  'invalid signed identity is rejected before authority work',
  'current membership grant lock and tenant checks fail closed',
  'roles do not confer implicit review or cross-workspace privileges',
  'machine credentials remain separate and action ceilings apply',
  'forged in-process identity cannot mint authority',
  'human mutations require same-origin and login targets stay local',
] }];
if (process.argv.length !== 2) {
  throw new Error('The required test lane does not accept selection overrides');
}
for (const { requiredFile, requiredCases, minAssertions } of suites) {
if (!(await Bun.file(requiredFile).exists())) {
  throw new Error(`Required test file missing: ${requiredFile}`);
}
const result = Bun.spawnSync([process.execPath, 'test', requiredFile], {
  stdout: 'pipe',
  stderr: 'pipe',
  env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
});
const stdout = result.stdout.toString();
const stderr = result.stderr.toString();
process.stdout.write(stdout);
process.stderr.write(stderr);
const pass = Number(stderr.match(/\b(\d+) pass\b/)?.[1] ?? 0);
const fail = Number(stderr.match(/\b(\d+) fail\b/)?.[1] ?? 0);
const skip = Number(stderr.match(/\b(\d+) skip\b/)?.[1] ?? 0);
const assertions = Number(stderr.match(/\b(\d+) expect\(\) calls\b/)?.[1] ?? 0);
const missingCases = requiredCases.filter((name) => !stderr.includes(`(pass) ${name} [`));
console.log(JSON.stringify({ requiredFile, requiredCases, missingCases, pass, fail, skip, assertions, runnerExit: result.exitCode }));
if (result.exitCode !== 0 || pass < requiredCases.length || fail !== 0 || skip !== 0 || assertions < minAssertions || missingCases.length > 0) {
  throw new Error(`Required test lane failed: ${requiredFile}; require all cases, assertion floor, no failures or skips`);
}
}
