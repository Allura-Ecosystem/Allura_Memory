/**
 * Memory admission — rejects auto-captured conversational echo and process
 * status notices before they reach the append-only events table.
 *
 * Pure and side-effect free; never inspects or mutates stored memories.
 */

export type MemoryAdmissionSource = "manual" | "conversation" | undefined

export type MemoryAdmissionResult =
  | { admitted: true }
  | { admitted: false; reason: "conversational_echo" | "status_notice" }

/** `OUTCOME — intent: …` restates the request rather than recording a result. */
const INTENT_ECHO = /^\s*OUTCOME\s*[—–-]\s*intent\s*:/i

/** Background-process notices emitted by the agent runtime. */
const STATUS_NOTICE =
  /^\s*Background\s+(?:command|process|task|shell)\b|\bRead the output file to retrieve the result\b/i

/** A manual echo is only meaningful when it also records what happened. */
const RESULT_FIELD = /\b(?:result|resolved|verified|evidence)\s*:/i
const MIN_MEANINGFUL_LENGTH = 60

export function evaluateMemoryAdmission(input: {
  content: string
  source?: MemoryAdmissionSource
}): MemoryAdmissionResult {
  const { content, source } = input

  if (STATUS_NOTICE.test(content)) {
    return { admitted: false, reason: "status_notice" }
  }

  if (INTENT_ECHO.test(content)) {
    const meaningful =
      source === "manual" && content.trim().length >= MIN_MEANINGFUL_LENGTH && RESULT_FIELD.test(content)
    if (!meaningful) return { admitted: false, reason: "conversational_echo" }
  }

  return { admitted: true }
}
