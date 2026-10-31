# Consent UI decision record

Target: /dashboard/oauth/consent?transaction=… for an already authenticated workspace administrator connecting their own app. This is a delegated local design under the current direct-build adapter, not Sabir's acceptance of a rendered OAuth screen.

| Evidence | Confidence | Keep | Change | Do not copy |
|---|---|---|---|---|
| foundation/ui/main.tsx, style.css, controls.tsx at baseline 8b245880d006334e3f6d18464ee81d6208151fbd | observed source | scope form, IBM Plex, AL asset, notices, Base UI confirmation | dedicated connection flow | generic memory/review JSON dumps or semantic-approval rationale |
| _bmad-output/implementation-artifacts/dashboard-design-reference.json | observed manifest, not newly viewed pixels | existing delegated reference lineage | consent-specific states | claim of human-approved OAuth artwork |
| docs/design/command-center/operator-surface-contract.md and docs/allura/DESIGN-ALLURA.md | retained design intent | cream, real assets, plain copy, authority and unknown-state visibility | OAuth is connection consent, not curator review | historical runtime/path claims as current APIs |
| foundation/src/oauth-consent.ts and migrations/022-client-oauth.sql | observed contract | exact one-use server display and explicit decision | browser integration only | repeated display GET as refresh |
| single-column manual scope flow | inferred/adopted engineering default | existing namespace/UUID entry | no enumeration API invented | claim of a discoverable workspace list |

Direction: extend the actual Allura interface with one bounded review page. Keep the server as authority; show only authenticated exact request fields and explicit next steps.

Risks: manual scope entry is less friendly than a picker; there is no eligible-workspace enumeration API. Display GET consumes pending state, so reload/lost response needs a fresh client authorization. No user sign-in, hosted callback, installed-client or release acceptance is established by synthetic browser tests.

Quality gates: actual DOM and computed-style checks at desktop/phone; exact text, wrapping and no horizontal overflow; keyboard dialog focus and cancellation; signed synthetic human through real HTTP and DB; no credential/nonce rendering, persistence or referrer leakage; no success without a validated server decision. All nine design sections and keep/change/do-not-copy boundaries are defined. Runtime gates remain unperformed until implementation.
