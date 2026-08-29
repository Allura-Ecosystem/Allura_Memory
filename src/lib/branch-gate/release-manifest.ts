/**
 * Release manifest builder (server-only).
 *
 * Produces ONE machine-readable release manifest for the epic: revision
 * (git HEAD), tests (counts), benchmark (the 27.2 fixture metrics
 * reference), SBOM/license evidence (agenticow MIT + rvf-node MIT + Allura
 * MIT), browser evidence when applicable (none — headless), the review
 * verdict (filled by the parent after the independent review), and the
 * Allura receipt (filled by the parent).
 *
 * The manifest is a typed builder with a validate() that fails if required
 * fields are missing. The review verdict and the Allura receipt are
 * intentionally pending at build time: the parent fills them after the
 * independent review and the receipt issuance, and pendingFields() names
 * exactly what is still missing.
 */

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export const MANIFEST_SCHEMA = "allura-release-manifest/1"

export interface TestCounts {
  total: number
  passed: number
  failed: number
  skipped: number
}

export interface BenchmarkEvidence {
  /** Reference to the 27.2 fixture metrics artifact. */
  fixture: string
  story: string
  status: string
  measuredAt: string
}

export interface LicenseEvidence {
  name: string
  version: string
  license: string
  source: string
}

export interface SbomEvidence {
  tool: string
  licenses: LicenseEvidence[]
}

export interface BrowserEvidence {
  applicable: boolean
  note: string
}

export interface ReviewVerdict {
  status: "pending" | "approved" | "rejected"
  reviewer?: string
  verdict?: string
  reason?: string
  reviewedAt?: string
}

export interface AlluraReceipt {
  status: "pending" | "issued"
  receipt_id?: string
  trace_id?: string
  issuedAt?: string
}

export interface ReleaseManifestInput {
  revision: string
  tests: TestCounts
  benchmark: BenchmarkEvidence
  sbom: SbomEvidence
}

export interface ReleaseManifest extends ReleaseManifestInput {
  schema: typeof MANIFEST_SCHEMA
  browser: BrowserEvidence
  review: ReviewVerdict
  allura: AlluraReceipt
  generatedAt: string
}

export interface ManifestValidation {
  ok: boolean
  errors: string[]
}

function coerceText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function requireTests(tests: unknown): TestCounts {
  if (!tests || typeof tests !== "object") throw new Error("tests are required")
  const candidate = tests as Partial<TestCounts>
  return {
    total: Number(candidate.total ?? 0),
    passed: Number(candidate.passed ?? 0),
    failed: Number(candidate.failed ?? 0),
    skipped: Number(candidate.skipped ?? 0),
  }
}

function requireBenchmark(benchmark: unknown): BenchmarkEvidence {
  if (!benchmark || typeof benchmark !== "object") throw new Error("benchmark evidence is required")
  const candidate = benchmark as Partial<BenchmarkEvidence>
  return {
    fixture: coerceText(candidate.fixture),
    story: coerceText(candidate.story),
    status: coerceText(candidate.status),
    measuredAt: coerceText(candidate.measuredAt),
  }
}

function requireSbom(sbom: unknown): SbomEvidence {
  if (!sbom || typeof sbom !== "object") throw new Error("SBOM evidence is required")
  const candidate = sbom as Partial<SbomEvidence>
  const tool = coerceText(candidate.tool)
  const licenses = Array.isArray(candidate.licenses) ? candidate.licenses : []
  return { tool, licenses }
}

/**
 * Build the release manifest. The builder coerces missing values so the
 * manifest can be assembled; validate() is the enforcement point and fails
 * on any missing required field. The review verdict and the Allura receipt
 * start pending: the parent fills them after the independent review and the
 * receipt issuance.
 */
export function createReleaseManifest(input: ReleaseManifestInput): ReleaseManifest {
  const revision = coerceText(input.revision)
  const tests = requireTests(input.tests)
  const benchmark = requireBenchmark(input.benchmark)
  const sbom = requireSbom(input.sbom)

  return {
    schema: MANIFEST_SCHEMA,
    revision,
    tests,
    benchmark,
    sbom,
    browser: {
      applicable: false,
      note: "headless run — no browser evidence applicable",
    },
    review: { status: "pending" },
    allura: { status: "pending" },
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Validate the manifest. Fails if any required field is missing: revision,
 * tests, benchmark, SBOM license evidence, browser evidence, the review
 * verdict, and the Allura receipt must all be present and complete.
 */
export function validateManifest(manifest: ReleaseManifest): ManifestValidation {
  const errors: string[] = []
  if (!manifest.revision || manifest.revision.trim().length === 0) {
    errors.push("revision is required")
  }
  if (!manifest.tests || manifest.tests.total <= 0) {
    errors.push("tests are required with a non-zero total")
  }
  if (!manifest.benchmark || !manifest.benchmark.fixture || !manifest.benchmark.status) {
    errors.push("benchmark evidence is required (fixture + status)")
  }
  if (!manifest.sbom || !Array.isArray(manifest.sbom.licenses) || manifest.sbom.licenses.length === 0) {
    errors.push("SBOM license evidence is required (at least one license)")
  }
  if (!manifest.browser || typeof manifest.browser.applicable !== "boolean") {
    errors.push("browser evidence is required (applicable flag)")
  }
  if (!manifest.review || manifest.review.status === "pending") {
    errors.push("review verdict is required (filled by the parent after the independent review)")
  }
  if (!manifest.allura || manifest.allura.status === "pending") {
    errors.push("Allura receipt is required (filled by the parent)")
  }
  return { ok: errors.length === 0, errors }
}

/**
 * Name the fields the parent must still fill: the review verdict and the
 * Allura receipt.
 */
export function pendingFields(manifest: ReleaseManifest): string[] {
  const pending: string[] = []
  if (!manifest.review || manifest.review.status === "pending") pending.push("review.verdict")
  if (!manifest.allura || manifest.allura.status === "pending") pending.push("allura.receipt_id")
  return pending
}
