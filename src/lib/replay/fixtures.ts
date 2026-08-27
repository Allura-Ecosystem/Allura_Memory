/**
 * Incident replay fixtures (Story 26.7).
 *
 * Three real, publicly-documented 2025 supply-chain incident *patterns*,
 * expressed purely as the structured metadata Allura's own pipeline consumes.
 *
 * WHAT THESE ARE NOT. These are not copies of the real advisories and contain
 * no exploit code, no payload, no obfuscated script, no attacker
 * infrastructure, and no free-text advisory prose. That is a deliberate
 * safety property, not an oversight: Story 26.1's `ThreatAdvisory` schema has
 * no field capable of carrying attacker-controlled free text at all, and
 * Story 26.4's adapters each prove the untrusted `summary`/`details` fields
 * of real advisories never reach a mapped advisory. Replay fixtures must
 * honour that same boundary -- a fixture file is exactly where someone would
 * be tempted to paste a real malicious payload "for realism", and doing so
 * would put attacker-authored code in the repo and in CI for no analytical
 * gain. The indicators below are the only part the matcher ever reads.
 *
 * The package names, versions, and action references are representative
 * stand-ins chosen to exercise each distinct match path. They are labelled as
 * such; nothing here should be read as a claim about which specific real
 * package versions were affected in each incident.
 *
 * Each fixture targets a different matcher path, which is the point:
 *   nx-s1ngularity        -> package_version (a compromised published version)
 *   shai-hulud            -> indicator / install_hook (a self-propagating
 *                            postinstall pattern, matched on hash rather than
 *                            on any one package name, because the defining
 *                            trait of a worm is that it is not one package)
 *   mutable-action-ref    -> workflow_reference (a movable tag, the
 *                            tj-actions/changed-files class of attack)
 */

import type { ThreatAdvisory } from "../exposure/types"
import type { InventorySourceRecord } from "../inventory/types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface ReplayFixture {
  /** Stable slug used to select a fixture and name its evidence bundle. */
  id: string
  /** Human-readable incident name for operator-facing surfaces. */
  title: string
  /** What class of compromise this replays, in one line. */
  pattern: string
  /** Public reference for the real incident this pattern is drawn from. */
  reference: string
  /** Which matcher path this fixture is designed to exercise. */
  expectedMatchType: "package_version" | "indicator" | "workflow_reference"
  /** Severity the resulting alert is expected to carry. */
  expectedSeverity: "high" | "critical"
  /** Inventory the tenant is presumed to hold at replay time. */
  inventory: InventorySourceRecord[]
  /** The advisory that arrives and should match that inventory. */
  advisory: ThreatAdvisory
  /** Inventory that must NOT match, proving the replay is not trivially true. */
  decoyInventory: InventorySourceRecord[]
}

const T0 = "2025-08-27T00:00:00.000Z"

function inventoryRecord(
  fields: Pick<InventorySourceRecord, "id" | "package" | "version" | "hash"> &
    Partial<InventorySourceRecord>,
): InventorySourceRecord {
  return {
    artifact_type: "lockfile",
    ecosystem: "npm",
    publisher: "npm registry",
    workflow_reference: "bun.lock",
    source_ref: "bun.lock",
    trust_state: "verified",
    freshness_state: "fresh",
    created_at: T0,
    updated_at: T0,
    ...fields,
  }
}

function advisory(fields: Partial<ThreatAdvisory> & Pick<ThreatAdvisory, "id" | "indicators" | "severity">): ThreatAdvisory {
  return {
    source_id: "replay-fixture",
    source_url: "https://github.com/advisories",
    publisher: "replay",
    published_at: T0,
    fetched_at: T0,
    source_revision: "1",
    content_hash: `hash-${fields.id}`,
    trust_state: "verified",
    freshness_state: "fresh",
    classification: "supply-chain-compromise",
    retention_disposition: "preserve",
    evidence_ids: [`evidence-${fields.id}`],
    ...fields,
  }
}

/**
 * 1. Nx "s1ngularity" compromise (August 2025).
 *
 * Malicious versions of the `nx` package and several scoped plugins were
 * published to npm after a compromised publishing workflow. Consumers who
 * resolved the bad version range picked up a postinstall that harvested
 * developer credentials. The defining detectable trait is an exact
 * package+version match against a known-bad published version.
 */
const NX_S1NGULARITY: ReplayFixture = {
  id: "nx-s1ngularity",
  title: "Nx s1ngularity compromise (2025)",
  pattern: "A compromised publishing pipeline pushed malicious versions of a widely-used build tool to the registry.",
  reference: "https://github.com/advisories -- Nx supply-chain compromise, August 2025",
  expectedMatchType: "package_version",
  expectedSeverity: "critical",
  inventory: [
    inventoryRecord({ id: "inv-nx", package: "nx", version: "21.5.0", hash: "sha512-nx-compromised" }),
  ],
  decoyInventory: [
    // Same package, a version outside the affected set -- must not match.
    inventoryRecord({ id: "inv-nx-safe", package: "nx", version: "21.4.0", hash: "sha512-nx-clean" }),
  ],
  advisory: advisory({
    id: "REPLAY-NX-S1NGULARITY-2025",
    severity: "critical",
    indicators: [
      { type: "package", value: "nx" },
      { type: "version", value: "21.5.0" },
    ],
  }),
}

/**
 * 2. Shai-Hulud self-propagating worm (September 2025).
 *
 * The novel property was self-propagation: a compromised maintainer's
 * credentials were used to publish trojanized versions of that maintainer's
 * OTHER packages, which harvested more credentials, and so on. Matching on a
 * single package name is therefore the wrong detection strategy -- the
 * fixture matches on the shared install-hook artifact instead, which is what
 * actually generalizes across the propagating set.
 */
const SHAI_HULUD: ReplayFixture = {
  id: "shai-hulud",
  title: "Shai-Hulud self-propagating worm pattern (2025)",
  pattern: "Stolen maintainer credentials were used to trojanize that maintainer's other packages, which then harvested further credentials and repeated.",
  reference: "https://github.com/advisories -- Shai-Hulud npm worm, September 2025",
  expectedMatchType: "indicator",
  expectedSeverity: "critical",
  inventory: [
    inventoryRecord({
      id: "inv-worm-a",
      package: "replay-utility-lib",
      version: "3.1.2",
      // The install-hook artifact is the shared trait across the worm's set.
      hash: "sha512-replay-shaihulud-install-hook",
    }),
  ],
  decoyInventory: [
    inventoryRecord({
      id: "inv-worm-clean",
      package: "replay-utility-lib",
      version: "3.1.1",
      hash: "sha512-replay-clean-build",
    }),
  ],
  advisory: advisory({
    id: "REPLAY-SHAI-HULUD-2025",
    severity: "critical",
    indicators: [
      { type: "install_hook", value: "sha512-replay-shaihulud-install-hook" },
    ],
  }),
}

/**
 * 3. Mutable GitHub Action reference compromise (March 2025 class).
 *
 * tj-actions/changed-files: an attacker with write access retroactively moved
 * existing version tags to a commit that dumped CI secrets into build logs.
 * Every consumer referencing the action by a MUTABLE tag picked it up on
 * their next run; consumers pinned to a full commit SHA were unaffected.
 *
 * This fixture is the one that motivated building the ci_workflow inventory
 * source at all -- and this repository genuinely has 13 mutable-tag action
 * references in its own workflows, so the exposure being replayed here is the
 * exposure this repo actually has.
 */
const MUTABLE_ACTION_REF: ReplayFixture = {
  id: "mutable-action-ref",
  title: "Mutable GitHub Action reference compromise (2025)",
  pattern: "An attacker with repository write access moved an existing version tag to a malicious commit; every consumer pinned to that mutable tag pulled it automatically.",
  reference: "https://github.com/advisories -- tj-actions/changed-files tag-moving compromise, March 2025",
  expectedMatchType: "workflow_reference",
  expectedSeverity: "high",
  inventory: [
    inventoryRecord({
      id: "ghaction:replay-org/replay-action@v2",
      artifact_type: "ci_workflow",
      ecosystem: "github-actions",
      package: "replay-org/replay-action",
      version: "v2",
      // Unpinned: this is precisely what makes it attackable.
      hash: "unpinned",
      publisher: "replay-org",
      workflow_reference: "replay-org/replay-action@v2",
      source_ref: ".github/workflows/replay.yml#L10",
    }),
  ],
  decoyInventory: [
    inventoryRecord({
      id: "ghaction:replay-org/replay-action@sha",
      artifact_type: "ci_workflow",
      ecosystem: "github-actions",
      package: "replay-org/replay-action",
      version: "5f3e9c2a1b7d4e6f8a0c2e4d6b8a0c2e4d6b8a0c",
      hash: "5f3e9c2a1b7d4e6f8a0c2e4d6b8a0c2e4d6b8a0c",
      publisher: "replay-org",
      // SHA-pinned consumers of the same action were unaffected -- the decoy
      // proves the replay distinguishes them.
      workflow_reference: "replay-org/replay-action@5f3e9c2a1b7d4e6f8a0c2e4d6b8a0c2e4d6b8a0c",
      source_ref: ".github/workflows/replay.yml#L20",
    }),
  ],
  advisory: advisory({
    id: "REPLAY-MUTABLE-ACTION-REF-2025",
    severity: "high",
    indicators: [
      { type: "workflow_reference", value: "replay-org/replay-action@v2" },
    ],
  }),
}

export const REPLAY_FIXTURES: readonly ReplayFixture[] = [
  NX_S1NGULARITY,
  SHAI_HULUD,
  MUTABLE_ACTION_REF,
] as const

export function getReplayFixture(id: string): ReplayFixture {
  const fixture = REPLAY_FIXTURES.find((f) => f.id === id)
  if (!fixture) {
    throw new Error(`unknown replay fixture "${id}" (known: ${REPLAY_FIXTURES.map((f) => f.id).join(", ")})`)
  }
  return fixture
}
