/**
 * GitHub Actions workflow parser -- the second real inventory source
 * (Bumblebee Guard, `ci_workflow` artifact type).
 *
 * WHY THIS EXISTS. Story 26.1/26.3's exposure matcher has always had a
 * `workflow_reference` match path (src/lib/exposure/matcher.ts,
 * `matchByWorkflowReference`, driven by `workflow_reference` / `action_ref`
 * advisory indicators), but nothing ever fed it real data -- the only
 * inventory source was bun.lock, whose records carry a `"bun.lock"` sentinel
 * in that field because a lockfile entry has no meaningful workflow
 * reference. This parser is the first source that populates it for real.
 *
 * THE RISK IT COVERS. A GitHub Actions `uses:` reference pinned to a MUTABLE
 * tag (`actions/cache@v3`) resolves at run time to whatever commit that tag
 * currently points at. An attacker who can move the tag -- as happened in the
 * real March 2025 tj-actions/changed-files compromise -- silently reaches
 * every consumer on their next CI run. A reference pinned to a full commit
 * SHA cannot be moved this way. Distinguishing the two is the whole point of
 * inventorying these references.
 *
 * Metadata extraction only: this module reads text and never executes,
 * fetches, or resolves anything from a workflow file, exactly as
 * lockfile-parser.ts never executes package code. It also performs no
 * filesystem access -- the caller reads the file and passes its content in,
 * preserving Story 26.2's read-only separation.
 */

import type { InventorySourceRecord } from "./types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

/**
 * `uses:` values that are not third-party supply-chain artifacts:
 *   ./path            -- a local composite action living in this repo
 *   docker://image    -- a container reference, covered by container_metadata
 */
function isThirdPartyReference(value: string): boolean {
  return !value.startsWith("./") && !value.startsWith(".\\") && !value.startsWith("docker://")
}

/** A 40-character hex string is a full git commit SHA -- immutable. */
const FULL_SHA = /^[0-9a-f]{40}$/i

export interface ParsedActionReference {
  /** Full `owner/repo@ref` (or `owner/repo/subpath@ref`) as written. */
  reference: string
  /** `owner/repo` or `owner/repo/subpath`. */
  repository: string
  /** The ref after `@` -- a tag, branch, or commit SHA. */
  ref: string
  /** True when `ref` is a full commit SHA and therefore cannot be moved. */
  pinnedToSha: boolean
  /** 1-indexed line number the reference was found on. */
  line: number
}

/**
 * Extract every third-party `uses:` action reference from one workflow file's
 * raw YAML text.
 *
 * Deliberately line-based rather than YAML-parsed: the only construct being
 * extracted is a single scalar key, a full YAML parser would add a dependency
 * and an attack surface for no gain, and a malformed file must degrade to
 * "no records" rather than throwing (matching lockfile-parser.ts's fail-soft
 * posture).
 */
export function extractActionReferences(content: string): ParsedActionReference[] {
  const found: ParsedActionReference[] = []
  const lines = content.split(/\r?\n/)

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim()
    if (line.startsWith("#")) continue // commented-out step

    // Matches both `- uses: x` and `uses: x`. Anything after whitespace or a
    // `#` is a trailing comment (e.g. `@<sha> # v4.2.2`) and is not part of
    // the reference itself.
    const match = /^-?\s*uses:\s*(?:["']?)([^\s"'#]+)/.exec(line)
    if (!match) continue

    const reference = match[1]
    if (!reference || !isThirdPartyReference(reference)) continue

    const at = reference.lastIndexOf("@")
    if (at <= 0) continue // unversioned reference -- nothing pinnable to record

    const repository = reference.slice(0, at)
    const ref = reference.slice(at + 1)
    if (!repository || !ref) continue

    found.push({
      reference,
      repository,
      ref,
      pinnedToSha: FULL_SHA.test(ref),
      line: index + 1,
    })
  }

  return found
}

/**
 * Parse one workflow file into normalized inventory source records, one per
 * distinct action reference.
 *
 * Field mapping mirrors lockfile-parser.ts's sentinel convention, inverted:
 * for a `ci_workflow` record `workflow_reference` is the MEANINGFUL field, so
 * `hash` carries the resolved SHA when the reference is SHA-pinned and the
 * `"unpinned"` sentinel when it is not.
 *
 * TRUST_STATE IS ABOUT PROVENANCE, NOT SAFETY. Every record here is
 * `verified`, including mutable-tag references. `trust_state` answers "did we
 * actually confirm this record reflects reality?" -- and we did: it was read
 * out of the committed workflow file itself. It does NOT mean "this artifact
 * is safe." Conflating the two would be actively harmful: Story 26.3's
 * matcher only produces exposures for verified+fresh records, so marking
 * mutable tags `provisional` would make the single most attackable class of
 * reference permanently *unmatchable* -- silently exempting exactly the
 * artifacts most likely to be compromised. The pinned/unpinned distinction is
 * carried in `hash` instead, where an advisory indicator can match on it.
 */
export function parseGithubWorkflow(
  content: string,
  filePath: string,
  fetchedAt: string = new Date().toISOString(),
): InventorySourceRecord[] {
  const seen = new Map<string, InventorySourceRecord>()

  for (const action of extractActionReferences(content)) {
    const id = `ghaction:${action.reference}`
    if (seen.has(id)) continue // same reference repeated across jobs in one file

    const owner = action.repository.split("/")[0] ?? action.repository

    seen.set(id, {
      id,
      artifact_type: "ci_workflow",
      ecosystem: "github-actions",
      package: action.repository,
      version: action.ref,
      hash: action.pinnedToSha ? action.ref : "unpinned",
      publisher: owner,
      workflow_reference: action.reference,
      source_ref: `${filePath}#L${action.line}`,
      // Provenance-verified: read directly from the committed workflow file.
      // See this module's header on why an unpinned tag is NOT `provisional`.
      trust_state: "verified",
      freshness_state: "fresh",
      created_at: fetchedAt,
      updated_at: fetchedAt,
    })
  }

  return [...seen.values()]
}

/**
 * Parse many workflow files, deduplicating a reference that appears in more
 * than one file. First occurrence wins, so `source_ref` names the first file
 * the reference was seen in.
 */
export function parseGithubWorkflows(
  files: readonly { path: string; content: string }[],
  fetchedAt: string = new Date().toISOString(),
): InventorySourceRecord[] {
  const seen = new Map<string, InventorySourceRecord>()

  for (const file of files) {
    for (const record of parseGithubWorkflow(file.content, file.path, fetchedAt)) {
      if (!seen.has(record.id)) seen.set(record.id, record)
    }
  }

  return [...seen.values()]
}
