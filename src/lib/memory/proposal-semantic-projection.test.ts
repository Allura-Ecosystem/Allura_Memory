import { describe, expect, it, vi } from "vitest";
import {
  buildProposalSemanticProjection,
  runProposalSemanticProjectionJob,
  redactGovernedProjectionText,
  writeProposalSemanticProjection,
} from "./proposal-semantic-projection";

const scope = { tenantId: "allura-system", workspaceId: "workspace-a", principalId: "curator-1" };
const source = {
  proposal: { id: "proposal-1", group_id: scope.tenantId, workspace_id: scope.workspaceId, content: "Use governed facts", status: "pending", score: 0.91, tier: "mainstream", trace_ref: "41", created_at: "2026-08-25T10:00:00.000Z" },
  events: [{ id: "41", group_id: scope.tenantId, workspace_id: scope.workspaceId, event_type: "memory_add", agent_id: "agent-1", status: "completed", created_at: "2026-08-25T09:00:00.000Z", metadata: { z: 2, a: 1 } }],
  evidenceRequests: [{ id: "evidence-1", group_id: scope.tenantId, workspace_id: scope.workspaceId, state: "requested", reason: "Need corroboration", requested_by: "curator-1", requested_at: "2026-08-25T10:01:00.000Z", resolved_by: null, resolved_at: null, evidence_references: [] }],
  receipts: [],
};

describe("proposal SemanticProjection", () => {
  it("deterministically builds governed Markdown from canonical same-scope relational sources", () => {
    const first = buildProposalSemanticProjection(scope, source);
    const second = buildProposalSemanticProjection(scope, { ...source, events: [...source.events].reverse() });

    expect(first).toEqual(second);
    expect(first.projectionVersion).toBe("proposal-semantic-projection/v1");
    expect(first.redactionPolicyVersion).toBe("governed-markdown/v1");
    expect(first.markdown).toContain("# Proposal proposal-1");
    expect(first.markdown).toContain("Evidence request state: requested");
    expect(first.sourceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "canonical_proposals", id: "proposal-1", group_id: scope.tenantId, workspace_id: scope.workspaceId }),
      expect.objectContaining({ table: "events", id: "41", group_id: scope.tenantId, workspace_id: scope.workspaceId }),
      expect.objectContaining({ table: "evidence_requests", id: "evidence-1", group_id: scope.tenantId, workspace_id: scope.workspaceId }),
    ]));
    expect(first.contentHash).toBe("ac8034b6fc82fb6455e10647c5cdda2aac39a6965447f2e21342901c1ece2282");
    expect(first.sourceRevisionHash).toBe("ebaba6ec2c7edee3d20b87bbd638909de8d99a285bd450d54625323e4e6cf6c2");
    expect(first.contentHash).not.toBe(first.sourceRevisionHash);

    const databaseTyped = buildProposalSemanticProjection(scope, {
      ...source,
      proposal: { ...source.proposal, created_at: new Date(source.proposal.created_at) },
      events: source.events.map((event) => ({ ...event, created_at: new Date(event.created_at) })),
      evidenceRequests: source.evidenceRequests.map((request) => ({ ...request, requested_at: new Date(request.requested_at) })),
    });
    expect(databaseTyped).toEqual(first);
  });

  it("rejects a relational source outside the authenticated workspace", () => {
    expect(() => buildProposalSemanticProjection(scope, {
      ...source,
      proposal: { ...source.proposal, workspace_id: "workspace-b" },
    })).toThrow(/same authenticated scope/i);
    expect(() => buildProposalSemanticProjection(scope, {
      ...source,
      events: [{ ...source.events[0], workspace_id: "workspace-b" }],
    })).toThrow(/same authenticated scope/i);
  });

  it("writes through an idempotent production seam without allowing generated time into identity", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "projection-1" }] });
    const first = await writeProposalSemanticProjection(scope, source, { query } as never);
    const second = await writeProposalSemanticProjection(scope, source, { query } as never);

    expect(first).toEqual(second);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT ON CONSTRAINT semantic_projections_idempotency_key");
    expect(query.mock.calls[0][1]).toEqual(query.mock.calls[1][1]);
  });

  it("applies deterministic governed redaction without claiming an embedding that was not produced", () => {
    expect(redactGovernedProjectionText("Contact sabir@example.com with Bearer abc.def.ghi")).toBe(
      "Contact [REDACTED:EMAIL] with Bearer [REDACTED:TOKEN]",
    );
    const projection = buildProposalSemanticProjection(scope, {
      ...source,
      proposal: { ...source.proposal, content: "Contact sabir@example.com with Bearer abc.def.ghi" },
    });
    expect(projection.markdown).not.toContain("sabir@example.com");
    expect(projection.markdown).not.toContain("abc.def.ghi");
    expect(projection.embedding).toBeUndefined();
    expect(projection.embeddingModel).toBeUndefined();
    expect(projection.embeddingModelVersion).toBeUndefined();
    expect(projection.buildState).toBe("pending_embedding");
  });

  it("persists an injected embedding vector with its exact model and version before marking ready", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ build_state: "ready", embedding_model: "nomic-embed-text", embedding_model_version: "1.5.0" }] });
    const result = await writeProposalSemanticProjection(scope, source, { query } as never, {
      vector: [0.125, -0.5, 0.25], model: "nomic-embed-text", version: "1.5.0",
    });

    expect(result).toMatchObject({ buildState: "ready", embeddingModel: "nomic-embed-text", embeddingModelVersion: "1.5.0" });
    expect(query.mock.calls[0][0]).toContain("$11::vector");
    expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining(["[0.125,-0.5,0.25]", "nomic-embed-text", "1.5.0", "ready"]));
  });

  it("returns the actual persisted ready row when an idempotency conflict declines an update", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ build_state: "ready", embedding_model: "persisted-model", embedding_model_version: "9" }] });

    const result = await writeProposalSemanticProjection(scope, source, { query } as never);

    expect(result).toMatchObject({ buildState: "ready", embeddingModel: "persisted-model", embeddingModelVersion: "9" });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("FROM semantic_projections");
  });

  it("renders redacted trace, proposal reasoning, trace identity, and receipt policy/evidence detail", () => {
    const projection = buildProposalSemanticProjection(scope, {
      ...source,
      proposal: { ...source.proposal, reasoning: "Grounded by trace 41" },
      events: [{ ...source.events[0], metadata: { evidence_url: "https://evidence.invalid/41", token: "secret-value" } }],
      receipts: [{
        id: "receipt-1", group_id: scope.tenantId, workspace_id: scope.workspaceId,
        action: "approve", actor_id: "curator-2", actor_role: "curator", outbox_state: "queued",
        rationale: "Corroborated", policy_reference: "policy://curation", policy_version: "v2",
        evidence_references: ["trace:event:41"],
      }],
    });

    expect(projection.markdown).toContain("Reasoning: Grounded by trace 41");
    expect(projection.markdown).toContain("Trace identity: 41");
    expect(projection.markdown).toContain("evidence_url");
    expect(projection.markdown).toContain("[REDACTED:SECRET]");
    expect(projection.markdown).toContain("policy://curation@v2");
    expect(projection.markdown).toContain("rationale Corroborated");
    expect(projection.markdown).toContain("evidence [\"trace:event:41\"]");
    expect(projection.markdown).not.toContain("secret-value");
  });

  it("loads trace_ref and retrieves the directly linked event in the source-driven job", async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("FROM canonical_proposals")) return { rows: [source.proposal] };
      if (sql.includes("FROM events")) return { rows: source.events };
      if (sql.includes("FROM evidence_requests")) return { rows: source.evidenceRequests };
      if (sql.includes("FROM governance_receipts")) return { rows: [] };
      if (sql.includes("INSERT INTO semantic_projections")) return { rows: [{ build_state: "pending_embedding" }] };
      return { rows: [] };
    });
    const runner = async <T>(_: typeof scope, action: (db: { query: typeof query }) => Promise<T>) => action({ query });

    await runProposalSemanticProjectionJob(scope, "proposal-1", runner as never);

    const eventCall = query.mock.calls.find(([sql]) => sql.includes("FROM events"));
    expect(eventCall?.[0]).toContain("id=$3");
    expect(eventCall?.[1]).toEqual([scope.tenantId, scope.workspaceId, source.proposal.trace_ref]);
    const insertCall = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO semantic_projections"));
    expect(insertCall?.[0]).toContain("pending_embedding");
  });
});
