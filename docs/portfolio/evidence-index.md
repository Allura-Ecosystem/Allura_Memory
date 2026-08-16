# Portfolio Evidence Index

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

CI evidence is immutable, named with the full commit SHA, retained for the
workflow-configured period, and linked through the workflow run page recorded
inside `evidence-manifest.json`.

## Indexed runs

No remote run is indexed yet. Story 24.1 remains in review until both of these
records are added:

| Proof | Commit SHA | Workflow run | Result | Required artifact |
|---|---|---|---|---|
| Green baseline | Pending | Pending | Pending | `epic-24-evidence-manifest-<sha>` |
| Controlled red branch (not merged) | Pending | Pending | Pending | Failed run manifest showing the blocking lane |

Local test output can support development, but it is not substituted for these
remote run URLs. AC-10 specifically requires a temporary branch failure that
demonstrates the repository gate blocks the change.
