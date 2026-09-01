/**
 * Strict deterministic JSON serialization for durable hashes and identities.
 *
 * Object keys use ECMAScript's UTF-16 code-unit order. Arrays retain their
 * original order. Values that JSON.stringify would silently omit, coerce, or
 * collapse are rejected so distinct inputs cannot share an ambiguous encoding.
 */
export function canonicalJson(value: unknown): string {
  const active = new Set<object>()

  const encode = (entry: unknown): string => {
    if (entry === null || typeof entry === "boolean" || typeof entry === "string") {
      return JSON.stringify(entry)
    }
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) throw new TypeError("canonical JSON requires finite numbers")
      return JSON.stringify(entry)
    }
    if (typeof entry !== "object") {
      throw new TypeError(`canonical JSON does not support ${typeof entry}`)
    }
    if (active.has(entry)) throw new TypeError("canonical JSON does not support cyclic values")
    active.add(entry)
    try {
      if (Array.isArray(entry)) {
        const values: string[] = []
        for (let index = 0; index < entry.length; index += 1) {
          if (!Object.hasOwn(entry, index)) throw new TypeError("canonical JSON does not support sparse arrays")
          values.push(encode(entry[index]))
        }
        return `[${values.join(",")}]`
      }

      const prototype = Object.getPrototypeOf(entry)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("canonical JSON supports plain objects only")
      }
      const record = entry as Record<string, unknown>
      const fields = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(record[key])}`)
      return `{${fields.join(",")}}`
    } finally {
      active.delete(entry)
    }
  }

  return encode(value)
}
