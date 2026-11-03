import manifest from '../package.json';

if (!(await Bun.file(new URL('../bun.lock', import.meta.url)).exists())) {
  throw new Error('Required bun.lock missing; frozen installation cannot resolve a new graph');
}

const node = Bun.spawnSync(['node', '--version'], { stdout: 'pipe', stderr: 'pipe' });
const nodeVersion = node.stdout.toString().trim();
if (
  manifest.engines.bun !== '1.3.14' ||
  manifest.engines.node !== '24.19.0' ||
  manifest.packageManager !== 'bun@1.3.14' ||
  Bun.version !== manifest.engines.bun ||
  node.exitCode !== 0 ||
  nodeVersion !== `v${manifest.engines.node}`
) {
  throw new Error(`Toolchain pin mismatch: Bun ${Bun.version}, Node ${nodeVersion}; require Bun 1.3.14 and Node 24.19.0`);
}
console.log(`Toolchain verified: Bun ${Bun.version}, Node ${nodeVersion}`);
