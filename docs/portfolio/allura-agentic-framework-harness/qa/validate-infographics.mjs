import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('docs/portfolio/allura-agentic-framework-harness');
const names = [
  '01-framework-harness-architecture',
  '02-deterministic-harness',
  '03-enterprise-governance',
  '04-developer-interfaces',
  '05-governed-memory-lifecycle',
  '06-evidence-to-release-chain',
];
const requiredColors = ['#F7F3EE', '#0F1720', '#0D47A1', '#FF4D1F', '#148A4B'];
const failures = [];

for (const name of names) {
  const svgPath = path.join(root, 'infographics/svg', `${name}.svg`);
  const pngPath = path.join(root, 'infographics/png', `${name}.png`);
  const [svg, metadata] = await Promise.all([fs.readFile(svgPath, 'utf8'), sharp(pngPath).metadata()]);
  if (metadata.width !== 1600 || metadata.height !== 900) failures.push(`${name}: expected a 1600×900 PNG`);
  if (!svg.includes('aria-labelledby="title desc"') || !svg.includes('<title id="title">') || !svg.includes('<desc id="desc">')) failures.push(`${name}: missing SVG accessibility metadata`);
  if (!svg.includes('data:image/png;base64,')) failures.push(`${name}: missing embedded official wordmark source`);
  if (!svg.includes('x="70" y="270" width="902"') || !svg.includes('x="972" y="270" width="558"')) failures.push(`${name}: missing the 902/558 primary/proof grid`);
  if (!svg.includes('LEGEND') || !svg.includes('SOURCE')) failures.push(`${name}: missing legend or source strip`);
  for (const color of requiredColors) if (!svg.includes(color)) failures.push(`${name}: missing approved color ${color}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Infographic structural QA passed: ${names.length}/6 SVG and PNG pairs conform to the release grid and required brand components.`);
