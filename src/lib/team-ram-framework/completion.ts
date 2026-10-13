import { z } from "zod";

const nonblank = z.string().regex(/\S/, "Must contain non-whitespace text");
const artifactSchema = z.strictObject({
  path: nonblank,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Local evidence manifest, not an authorization or authenticated receipt. */
export const completionSchema = z.strictObject({
  version: z.literal(1),
  objective: nonblank,
  scope: z.array(nonblank).min(1),
  outOfScope: z.array(nonblank),
  revision: nonblank,
  state: z.enum(["active", "blocked", "done"]),
  acceptance: z.array(z.strictObject({
    id: nonblank,
    text: nonblank,
    evidenceIds: z.array(nonblank),
  })).min(1),
  checks: z.array(z.strictObject({
    id: nonblank,
    kind: z.enum(["test", "review", "docs", "acceptance"]),
    status: z.enum(["pending", "pass", "fail"]),
    revision: nonblank,
    artifact: artifactSchema.nullable(),
  })),
  blockers: z.array(nonblank),
  nextAction: z.string(),
});

export type CompletionRecord = z.infer<typeof completionSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export interface CompletionResult {
  valid: boolean;
  complete: boolean;
  issues: string[];
}

function duplicateIds(items: { id: string }[], label: string): string[] {
  const seen = new Set<string>();
  return items.flatMap(({ id }) => {
    if (seen.has(id)) return [`Duplicate ${label} ID: ${id}`];
    seen.add(id);
    return [];
  });
}

/** Pure completion checks. Artifact integrity is supplied by the local reader. */
export function assessCompletion(
  input: unknown,
  expectedRevision: string,
  verifyArtifact: (artifact: Artifact) => string | null,
): CompletionResult {
  const parsed = completionSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, complete: false, issues: parsed.error.issues.map(
      issue => `${issue.path.join(".") || "record"}: ${issue.message}`,
    ) };
  }
  const record = parsed.data;
  const issues = [
    ...duplicateIds(record.acceptance, "acceptance"),
    ...duplicateIds(record.checks, "check"),
  ];
  if (!expectedRevision.trim() || record.revision !== expectedRevision)
    issues.push("Record revision differs from expected snapshot");
  if (record.state !== "done") issues.push(`Record state is ${record.state}, not done`);
  if (record.blockers.length) issues.push("Unresolved blockers remain");
  if (record.state === "blocked" && !record.blockers.length)
    issues.push("Blocked state requires a blocker");
  if (record.state !== "done" && !record.nextAction.trim())
    issues.push("Incomplete record requires a next action");
  if (record.state === "done" && record.nextAction.trim())
    issues.push("Done record still has a next action");

  const checks = new Map(record.checks.map(check => [check.id, check]));
  for (const criterion of record.acceptance) {
    if (!criterion.evidenceIds.length) issues.push(`${criterion.id}: no acceptance evidence`);
    for (const id of criterion.evidenceIds) {
      if (!checks.has(id)) issues.push(`${criterion.id}: unknown evidence ${id}`);
    }
  }
  for (const kind of ["test", "review", "docs"] as const) {
    if (!record.checks.some(check => check.kind === kind)) issues.push(`Missing ${kind} check`);
  }
  for (const check of record.checks) {
    if (check.status !== "pass") issues.push(`${check.id}: status is ${check.status}`);
    if (check.revision !== expectedRevision) issues.push(`${check.id}: stale revision`);
    if (!check.artifact) {
      issues.push(`${check.id}: missing artifact`);
      continue;
    }
    try {
      const error = verifyArtifact(check.artifact);
      if (error) issues.push(`${check.id}: ${error}`);
    } catch {
      issues.push(`${check.id}: artifact verification failed`);
    }
  }
  return { valid: true, complete: issues.length === 0, issues };
}
