import { open } from 'node:fs/promises';

type Element = { tag: string; attrs: Record<string, string>; children: Element[] };
function valid(condition: unknown): asserts condition {
  if (!condition) { throw new Error('Invalid native Bun test report'); }
}
// Deliberately supports only the pinned reporter's element/attribute grammar,
// not general XML (no DTD, external entities, comments, CDATA or mixed content).
function parse(xml: string): Element {
  valid(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  let rest = xml.slice('<?xml version="1.0" encoding="UTF-8"?>'.length);
  const stack: Element[] = [];
  let root: Element | undefined;
  while (rest.length) {
    rest = rest.replace(/^[ \t\r\n]+/, '');
    if (!rest.length) { break; }
    const token = rest.match(/^<(\/?)([a-z]+)((?:[ \t\r\n]+[a-z]+="[^"<>]*")*)[ \t\r\n]*(\/?)>/);
    valid(token);
    rest = rest.slice(token[0].length);
    const [, close, tag, attributes, self] = token;
    valid(tag);
    if (close) {
      valid(!attributes && !self && stack.pop()?.tag === tag);
      continue;
    }
    const attrs: Record<string, string> = Object.create(null);
    for (const match of attributes!.matchAll(/\s+([a-z]+)="([^"<>]*)"/g)) {
      const key = match[1]!;
      valid(!Object.hasOwn(attrs, key));
      const raw = match[2]!;
      valid(!raw.replace(/&(amp|lt|gt|quot|apos);/g, '').includes('&'));
      attrs[key] = raw.replace(/&([^;]*);/g, (_, entity: string) => {
        const value = ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity];
        valid(value !== undefined);
        return value;
      });
    }
    const node: Element = { tag, attrs, children: [] };
    const fields: Record<string, string[]> = {
      testsuites: ['name', 'tests', 'assertions', 'failures', 'skipped', 'time'],
      testsuite: ['name', 'file', 'tests', 'assertions', 'failures', 'skipped', 'time', 'hostname'],
      testcase: ['name', 'classname', 'time', 'file', 'line', 'assertions'],
      failure: ['type'], skipped: [],
    };
    const expected = fields[tag];
    valid(expected && Object.keys(attrs).length === expected.length && expected.every(key => Object.hasOwn(attrs, key)));
    if (tag === 'testcase') { valid(count(node, 'line') > 0); }
    if (Object.hasOwn(attrs, 'time')) {
      valid(/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(attrs.time!) && Number.isFinite(Number(attrs.time)));
    }
    const parent = stack.at(-1);
    if (parent) { parent.children.push(node); }
    else { valid(!root); root = node; }
    if (!self) { stack.push(node); }
  }
  valid(root && stack.length === 0);
  return root;
}
function count(node: Element, key: string): number {
  const value = node.attrs[key];
  valid(value !== undefined && /^(0|[1-9]\d*)$/.test(value));
  const number = Number(value);
  valid(Number.isSafeInteger(number));
  return number;
}
export async function readBunReport(path: string, requiredFile: string) {
  const maxBytes = 1024 * 1024;
  const handle = await open(path, 'r');
  let xml: string;
  try {
    const stat = await handle.stat();
    valid(stat.isFile() && stat.size > 0 && stat.size <= maxBytes);
    // One extra byte detects growth past the cap without an unbounded read.
    const bytes = Buffer.alloc(maxBytes + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await handle.read(bytes, used, bytes.length - used, used);
      if (!bytesRead) { break; }
      used += bytesRead;
    }
    valid(used > 0 && used <= maxBytes && used === stat.size);
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used));
  } finally { await handle.close(); }
  valid(!/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(xml));
  const root = parse(xml);
  valid(root.tag === 'testsuites' && root.attrs.name === 'bun test' && root.children.length === 1);
  const suite = root.children[0]!;
  const file = requiredFile.replace(/^\.\//, '');
  valid(suite.tag === 'testsuite' && suite.attrs.file === file && suite.attrs.name === file);
  const passedCases = new Set<string>();
  const seen = new Set<string>();
  let pass = 0, fail = 0, skip = 0, assertions = 0;
  for (const entry of suite.children) {
    valid(entry.tag === 'testcase' && entry.attrs.file === file && entry.attrs.classname === '' && entry.attrs.name !== undefined);
    const name = entry.attrs.name!;
    valid(!seen.has(name)); seen.add(name);
    assertions += count(entry, 'assertions');
    valid(entry.children.length <= 1);
    const outcome = entry.children[0];
    if (!outcome) { pass++; passedCases.add(name); }
    else {
      valid(outcome.children.length === 0);
      if (outcome.tag === 'failure') { fail++; }
      else { valid(outcome.tag === 'skipped'); skip++; }
    }
  }
  for (const node of [root, suite]) {
    valid(count(node, 'tests') === pass + fail + skip && count(node, 'assertions') === assertions && count(node, 'failures') === fail && count(node, 'skipped') === skip);
  }
  return { passedCases, pass, fail, skip, assertions };
}
