> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed - this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

# Checklist: TALON Validation

## Canon Integrity

- [X] Six Carlos documents exist.
- [X] Canon claims are in the six documents, not only Notion project index notes.
- [X] No duplicate source-of-truth statement conflicts with the six-doc canon.
- [X] Dashboard notes are marked UI/project boundary, not Engine canon.

## Runtime Truth

- [X] Current runtime label is backed by evidence.
- [X] Full RuVector is not claimed without `ruvector` extension/function proof.
- [X] `pgvector bridge` language is used where appropriate.
- [X] Runtime/database migration is marked approval-required.

## Gate Design

- [X] Brain read-before-work is testable.
- [X] Receipt write-back is testable.
- [X] Permit/Defer/Deny behavior is defined.
- [X] Done gate evidence requirements are explicit.
- [X] TALON validation role is separate from RAM implementation role.

## Safety

- [X] No secrets exposed.
- [X] No production or data-bearing mutation included.
- [X] No cron/config/harness mutation included without approval.
- [X] No memory promotion included without approval.

## TALON Verdict

- [X] `can_ship` or `can_execute` verdict included.
- [X] Evidence list included.
- [X] Risks included.
- [X] Next owner included.
- [X] Allura memory writeback completed or blocked with reason.
