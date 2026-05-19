import type { BoardConfig } from "./schema"

export const BOARD_EXAMPLES: BoardConfig[] = [
  {
    id: "memory-ops",
    title: "Memory Operations",
    summary: "A governed memory work board for review-gated changes and safe approvals.",
    adapter: "memory-dashboard",
    source: {
      type: "allura-brain",
      label: "Allura Brain",
      owner: "Brooks",
      reference: "src/app/(main)/allura/page.tsx",
      public: true,
    },
    writePolicy: {
      mode: "request-review",
      allowedActions: ["read", "review", "promote"],
      requiresHumanApproval: true,
      auditTarget: "curator queue",
    },
    evidencePolicy: {
      requiredForDone: ["review note", "receipt"],
      receiptFormat: "brain-receipt",
    },
    degradedState: {
      message: "Memory data is degraded until the backing store recovers.",
      recovery: "Retry after the memory service is healthy.",
    },
    sections: [
      {
        id: "intake",
        title: "Intake",
        description: "Sanitized memory work waiting for triage.",
        status: "degraded",
        emptyMessage: "No intake items are queued.",
      },
      {
        id: "review",
        title: "Review",
        description: "Requests that need human approval before activation.",
        status: "blocked",
        emptyMessage: "Nothing is pending human review.",
      },
      {
        id: "done",
        title: "Done",
        description: "Completed memory work with evidence attached.",
        status: "healthy",
        emptyMessage: "No completed work yet.",
      },
    ],
  },
  {
    id: "agent-readiness",
    title: "Agent Readiness",
    summary: "Tracks agent launch checks, routing, and readiness gates before work starts.",
    adapter: "static-example",
    source: {
      type: "repo",
      label: "Repository Config",
      owner: "Brooks",
      reference: "docs/goal.md",
      public: false,
    },
    writePolicy: {
      mode: "read-only",
      allowedActions: ["read", "list"],
      requiresHumanApproval: false,
      auditTarget: "board registry",
    },
    evidencePolicy: {
      requiredForDone: ["route check", "registry validation"],
      receiptFormat: "execution-log",
    },
    degradedState: {
      message: "Readiness is partial until the board registry loads cleanly.",
      recovery: "Fix the registry or remove the malformed board entry.",
    },
    sections: [
      {
        id: "checks",
        title: "Checks",
        description: "Entry criteria and guardrails for new agents.",
        status: "healthy",
        emptyMessage: "No readiness checks are pending.",
      },
      {
        id: "launch",
        title: "Launch",
        description: "Approved agent launches and their starting state.",
        status: "empty",
        emptyMessage: "No launches are scheduled.",
      },
      {
        id: "archive",
        title: "Archive",
        description: "Superseded readiness items retained for reference.",
        status: "degraded",
        emptyMessage: "Nothing has been archived yet.",
      },
    ],
  },
]
