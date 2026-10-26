/** Local scaffold example, not a memory/API contract. Errors are not swallowed. */
export function transformText(input: unknown, transform: (text: string) => string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new TypeError('Expected nonempty text');
  }
  return transform(input.trim());
}
