import { expect, test } from 'bun:test';
import { transformText } from '../src/transform-text.ts';

test('trims valid text and transforms it exactly once', () => {
  expect.assertions(3);
  let calls = 0;
  const result = transformText('  foundation  ', (text) => {
    calls += 1;
    expect(text).toBe('foundation');
    return text.toUpperCase();
  });
  expect(result).toBe('FOUNDATION');
  expect(calls).toBe(1);
});

test('rejects invalid input before invoking the transform', () => {
  const invalid: unknown[] = ['', ' \t\n ', null, undefined, 42, {}, []];
  expect.assertions(invalid.length * 2);
  for (const input of invalid) {
    let called = false;
    expect(() => transformText(input, () => {
      called = true;
      return 'unexpected';
    })).toThrow('Expected nonempty text');
    expect(called).toBe(false);
  }
});

test('propagates the original transform error without retry', () => {
  expect.assertions(2);
  const failure = new Error('local transform failed');
  let calls = 0;
  let caught: unknown;
  try {
    transformText('valid', () => {
      calls += 1;
      throw failure;
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(failure);
  expect(calls).toBe(1);
});
