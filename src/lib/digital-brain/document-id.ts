export const MAX_CANONICAL_DOCUMENT_ID_LENGTH = 200

const CONTROL_CHARACTER_PATTERN = /[\x00-\x1f\x7f]/

/** One canonical document identifier grammar shared by every derived read. */
export function isCanonicalDocumentId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CANONICAL_DOCUMENT_ID_LENGTH &&
    value.trim() === value && !CONTROL_CHARACTER_PATTERN.test(value) &&
    !value.includes("|") && !value.includes("[[") && !value.includes("]]" )
}

export function validateCanonicalDocumentIds(
  values: readonly string[],
  options: { allowEmpty?: boolean; max?: number } = {},
): void {
  const max = options.max ?? 200
  if (!Array.isArray(values) || (!options.allowEmpty && values.length === 0) || values.length > max ||
      values.some((value) => !isCanonicalDocumentId(value))) {
    throw new Error("Canonical document IDs refused")
  }
}
