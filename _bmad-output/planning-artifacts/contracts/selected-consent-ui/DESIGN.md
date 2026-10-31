# Allura selected-member consent — delegated local design

Bound to source revision 1538f460cf950337824a8de23f740e464cdb521c. This adapts retained owner-consent styling; it is not new human-approved artwork or deployed visual acceptance.

## 1. Visual Theme & Atmosphere
Retain the current cream Allura surface and one quiet review task. This is neither a dashboard nor a sign-in screen.
## 2. Color
Consume existing foundation/ui/style.css tokens --allura-cream, --allura-ink, --allura-blue, --allura-orange, --surface, --muted and --border. No new palette or optimistic success color.
## 3. Typography
Retain IBM Plex Sans and IBM Plex Mono imports. Mono is for exact identifiers, callbacks and actions. Long strings wrap; do not truncate security-relevant values.
## 4. Spacing & Grid
Use the existing four-pixel rhythm and rounded controls; minimum 44px interactive targets. Single-column responsive stacking, with no document overflow at 1440, 390 or 320px.
## 5. Layout & Composition
Official AL asset, heading, brief permission boundary, labelled known namespace/workspace inputs, explicit Review connection request, then the verified server-returned request and decisions. No sidebar entry or workspace picker. The form conveys routing hints, not verified authority.
## 6. Components
Reuse semantic forms, notices and Base UI Confirm from existing controls. Render app name/ID, callback, namespace/workspace and memory:selected:read as text. Connection ID may be technical metadata; transaction and nonce never appear in page content. Confirm dismissal sends nothing; Cancel connection explicitly submits cancellation.
## 7. Motion & Interaction
No decorative motion. Preserve visible keyboard focus, cancel-first dialog focus, Escape dismissal, focus return and live status. One display and one decision, synchronously locked; freeze scope after review. Clear private state on failure, navigation, unload and unknown outcome. Restart from the requesting client rather than retrying. Forced-colors and reduced-motion preferences remain usable.
## 8. Voice & Brand
Plain wording: this app may read only exact versions separately approved for you. Connecting adds no shares or workspace access and does not make the app a human approver. A connection request is frozen, not a snapshot of all future sharing. No invented person/account or verified-sign-in claims.
## 9. Anti-patterns
No redesign, new fonts/logos/assets/dependencies, workspace enumeration, pasted tokens, owner administration check, unsafe HTML, nonce display, browser persistence, token exchange, automatic retries/reminting or optimistic success. Never call synthetic browser evidence genuine human acceptance.
