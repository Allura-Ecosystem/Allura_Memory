# Documentation Integrity — Missing Canonical AD-61 through AD-63 Rows

**Recorded:** 2026-10-12  
**Scope:** Documentation integrity only  
**Status:** Open — not a Graph implementation blocker

`docs/allura/REQUIREMENTS-MATRIX.md` already reserves AD-61, AD-62, and AD-63 for Copilot/identity, mortgage demonstration, and modular dashboard requirements. No corresponding canonical rows currently exist in `docs/allura/RISKS-AND-DECISIONS.md`.

The Graph Correct Course does not reuse or infer those decisions. AD-64 is the first unclaimed identifier and governs the focused-subgraph read contract. A separate documentation reconciliation must recover or approve the missing AD-61 through AD-63 decision text from their owning artifacts and reviewers before adding canonical rows.

This issue must not be used to weaken, renumber, or reinterpret AD-64, REQ-MAP-001 through REQ-MAP-003, or the existing requirements that already cite AD-61 through AD-63.
