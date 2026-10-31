# Allura OAuth consent — delegated local design

Scope: one connection-consent page, not a new dashboard or human-approved OAuth artwork. Revision is bound to baseline 8b245880d006334e3f6d18464ee81d6208151fbd and the source references in design-contract.md.

## 1. Visual Theme & Atmosphere
Reuse the current cream Allura operator surface. One quiet review task, not a marketing or sign-in page.
## 2. Color
Consume existing foundation/ui/style.css variables: --allura-cream, --allura-ink, --allura-blue, --allura-orange, --surface, --muted, --border. No new palette, gradients or success-green before a verified result.
## 3. Typography
Existing IBM Plex Sans imports remain; IBM Plex Mono only for application ID, callback, workspace and exact action names. Preserve readable wrapping of long strings.
## 4. Spacing & Grid
Use current four-pixel spacing rhythm, rounded controls and 44px minimum targets. Existing responsive shell rules govern; no fixed-width consent card overflowing a phone.
## 5. Layout & Composition
Official AL mark, page title, workspace verification, exact server-returned request, then decision. One column is an adopted local default. No permanent sidebar entry for an expiring transaction. No inventory or app details before authenticated consent display.
## 6. Components
Reuse current semantic forms, notice/status conventions and Base UI Confirm. Confirmation dismissal is distinct from Cancel connection, which submits decision=cancel. Show exact app name/ID, callback, tenant/workspace and every requested action as text. No raw JSON dumps of transaction/nonce.
## 7. Motion & Interaction
No decorative motion. Keyboard-visible focus, cancel-first dialog focus, focus return on dismissal, named controls and live status. Freeze scope after one-use display. Loading disables competing actions. Denial, stale, invalid, expired, unavailable and unknown outcomes clear sensitive state and explain restarting from the client; never auto-retry.
## 8. Voice & Brand
Short plain sentences: this connects an app using your current permitted content access; it does not make the app a human approver or add anyone to a workspace. Do not describe OAuth consent as semantic review. No invented account names or verified-sign-in claims.
## 9. Anti-patterns
No new library, generated logo, unrelated brand, fake workspace picker, pasted token form, permission elevation, hidden callback, untrusted HTML, persistent consent state, optimistic success or global dashboard redesign.
