/**
 * Secret Redaction Guard
 *
 * Detects and redacts sensitive field values from objects before they are
 * logged, serialized, or stored. Used to enforce SOC2 log hygiene and
 * GDPR data minimization at runtime.
 *
 * Does NOT guard against secrets embedded inside string values —
 * it pattern-matches on object key names only.
 */

if (typeof window !== "undefined") {
  throw new Error("redact-guard is server-side only")
}

// ── Sensitive Key Patterns ─────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /api_key/i,
  /apikey/i,
  /\btoken\b/i,
  /credential/i,
  /private_key/i,
  /auth_token/i,
]

const REDACTED_PLACEHOLDER = "[REDACTED]"

// ── Core Utilities ──────────────────────────────────────────────────────────

/**
 * Returns true if the given key name matches a sensitive pattern.
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key))
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Recursively scan an object for keys that match sensitive patterns.
 *
 * @returns `hasSensitive` — whether any sensitive fields were found
 * @returns `fields` — list of dot-notation paths to sensitive fields
 */
export function containsSensitiveData(
  obj: unknown,
  prefix = "",
): { hasSensitive: boolean; fields: string[] } {
  const fields: string[] = []

  if (obj === null || typeof obj !== "object") {
    return { hasSensitive: false, fields }
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (isSensitiveKey(key)) {
      fields.push(path)
    }

    // Recurse into nested objects (not arrays — key names in arrays are indices)
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = containsSensitiveData(value, path)
      fields.push(...nested.fields)
    }
  }

  return { hasSensitive: fields.length > 0, fields }
}

/**
 * Return a shallow-redacted copy of the object.
 *
 * Recursively traverses nested objects. Sensitive field values are replaced
 * with `"[REDACTED]"`. Non-sensitive fields are returned as-is.
 *
 * Arrays are preserved; their string/number/boolean elements are not scanned
 * (only object elements within arrays are recursed into).
 */
export function redactSensitiveFields(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED_PLACEHOLDER
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object"
          ? redactSensitiveFields(item as Record<string, unknown>)
          : item,
      )
    } else if (value !== null && typeof value === "object") {
      result[key] = redactSensitiveFields(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }

  return result
}
