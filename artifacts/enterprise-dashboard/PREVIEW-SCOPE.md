# Allura HTML design preview

Allura is a portfolio project. It aims toward SOC 2 readiness; it does not claim SOC 2 compliance, a completed examination or an issued SOC 2 report. Security and trust examples communicate design intent only.

Current user clarification (2026-10-19): this delivery is an HTML design preview. No login is required.

The preview uses local synthetic records, identities, workspaces, permissions, embedding metadata and review receipts. Controls demonstrate a proposed experience only. They do not change live memberships, grants, policies, memories, devices or approvals. No confidential HR records or live tenant data are included.

Shared Allura palette: Cream #F7F3EE, Ink #0F1720, Blue #0D47A1, Green #148A4B, Orange #FF4D1F. The runtime wordmark is the previously documented approved Figma derivative; source and proportions are preserved.

Measured foreground/background contrast: Ink/Cream16.34:1, Blue/Cream7.81:1, muted text/Cream5.68:1; final preview control borders #81796E/Cream3.88:1. Orange is selection emphasis with Ink outline, not normal text. Green is not proof of a verified live state.

Graph UI offers selection, pan, zoom, relationship filter, inspector and list alternative. Dense compact layouts default to List. A zoomed-out dense canvas can have overlapping touch targets; use zoom or List. A drawn relationship in this preview is a synthetic example, not a live stored edge. No embedding distance is inferred from graph layout.

The six engineering documents retain the intended full enterprise requirements and unreleased source work. This preview does not certify implementation, security, compliance, live RLS isolation or production readiness. No deployment or promotion is part of this delivery.

Security & Trust presents fictional control ownership, implementation status and evidence state separately. Access reviews, policies, incidents and recovery link to local work tasks. Evidence questions reset when leaving the screen. Nothing verifies a real control.

Work Board supports task creation, title/owner/due-date editing, workspace/assignee filtering, checklists and stage changes. Required-review tasks need an independent fictional reviewer before Done; later material edits clear that review. Tasks survive navigation in browser memory and reset on reload or Reset work board. No data is sent or persisted.

The refreshed shared shell uses rounded forms, generous spacing and welcoming copy, with Cream dominant. Desktop, tablet and phone captures for this revision are in screenshots/portfolio-refresh; earlier screenshots describe older iterations.

2026-10-19 compact identity update: user selected the approved AL lettermark for desktop and phone navigation. The preview uses public/brand/allura-lettermark-al-figma.png unchanged, with original square proportions. The portable HTML embeds this asset.

Everyday-user UX update: main navigation is Home, Company Knowledge, Work Board, Review changes, Security & Trust and Administration. Home searches local document titles/text, not an AI answer service. Team selection filters knowledge. Graph remains available contextually as related information. Search settings, connected tools and activity are under Administration; embedding details are collapsed under Advanced details for IT.

Apps preview: Mortgage and Bumblebee are local modules with independent sample state and versions. Administration → Manage apps demonstrates compatible/incompatible/failed updates, restore and disable/re-enable. App review tasks capture a versioned snapshot; edits require a new task. Mortgage tasks use a dedicated fictional Mortgage area. No runtime plugin loading, installation, authorization, scanning or migration is implemented by this HTML.

2026-10-19 organization extension: My profile, People, Teams, Roles & access, Files and Connections reuse Studio Admin UI components under Allura's shared brand tokens. The copied MIT components, upstream revision and adaptation hashes are in visual-fixture/studio-ui/provenance.json; the portable HTML retains their license notice. Profile preferences, example invitations/status, membership and role assignments stay in shared browser memory. Names are fixed for existing people and duplicate sample names are rejected because this bounded preview's task identity still uses names.

Work owners come from active sample people. Fictional task reviewers need the appropriate sample role, explicit team membership, and independence from the author/assignee. File links are bidirectional and carry a source version; changing an attachment resets a prior sample review. Board reset clears custom attachments before task identifiers are reused. Team filters and these interaction checks are design behavior, not authenticated content access or server enforcement.

Connections includes an administrator-only simulated Shopify journey: fictional store address, read Products/Inventory selection, access review, sample import, pause/disconnect and sync-failure examples. Imports create fictional Sales files that can become review tasks. Deduplication is per normalized sample store and information type. No real store, account, OAuth flow, token, customer/order/payment data, upload or API is connected. Real connector implementation remains separately specified and unverified.


## Studio Base UI source reuse — 2026-10-19

The user selected `arhamkhnz/next-shadcn-admin-dashboard-baseui`. The preview now reuses actual File Manager folder/grid/list compositions, Kanban card/column/toolbar compositions, and four e-commerce widgets from revision `62b1b3e3c4af7a1abf055298b01b4af020bd0f8b`. Source is pinned under `visual-fixture/studio-baseui`, with MIT notice and import/compatibility hashes. Controlled adapters under `studio-adapters` connect Files and Kanban to existing shared local providers. The e-commerce chart values are fixed fictional samples, independent of the separate simulated Shopify import. People/Profile/Teams/Roles remain existing preview components; this is not a claim that the entire template or backend was adopted.

Allura theme uses scoped utilities and shared semantic tokens. Existing production packages were not upgraded. Chart compatibility is type-only for installed Recharts 2; adapters remove decorative glow and unsupported interactions. Receipt: `studio-baseui-preview-receipt.json`.


## Modern React and 3D Connections — 2026-10-20

Current navigation includes Connections alongside Company Knowledge, Files, Apps and Work Board. Connections now offers a real WebGL 3D scene, Flat SVG and accessible List over the same shared records. The approved two-lobe layout is a visual metaphor; proximity does not imply a relationship. Nineteen fictional records and sixteen explicit links include Gabriel (COO business title), a sample vendor and a sample contact. Missing phone details remain “Not provided.” Selection opens factual scorecards, not invented ratings. Reduced-motion defaults paused; phone defaults List. Real access, live contacts, performance at scale and SOC 2 claims remain outside this portfolio scope. Validation and limitations: `connections-3d-preview-receipt.json`.


## Graph engine reuse — 2026-10-20

The 3D implementation now uses pinned `react-force-graph-3d@1.29.2` from vasturiano/react-force-graph. This replaces the preceding procedural two-lobe renderer. Layout settles before display; optional camera rotation is separate. Direct connections and One step further expose exact recorded neighborhoods. Gabriel → Northstar Supply → Morgan Ellis remains a three-record, two-link chain; no shortcut relationship is implied. The engine receives mutable copies, not provider records. Preview-local package/lock and exact upstream MIT provenance are under `visual-fixture`; the portable output retains dependency notices. Validation, screenshots and limitations: `react-force-graph-preview-receipt.json`.

## Studio commerce interaction pass — 2026-10-20

Store overview remains a React/Vite page inside the portable HTML. It now adapts five actual Studio Base UI widgets from the existing pinned revision, adding Recent Orders to the prior four-widget composition. Search, status filters, numeric/date sorting, pagination and order details work on 34 fictional source records; these are an illustrative subset, not the complete 379-order monthly summary. Product selection reveals only known sample facts. Missing item details, contacts and individual product stock are explicitly absent. No new connection or backend was introduced.

The sales comparison now derives from September and October chart values (+6.1%), and readable Ink profit bars have a labeled monthly-table alternative. Product shares remain rounded percentages derived from numeric sample values. Keyboard opening/closing retains or restores focus. Build, strict TypeScript, three data-integrity tests, desktop/tablet/phone interactions and reduced-motion details were checked. Evidence and remaining limits are in `studio-commerce-preview-receipt.json`; source hashes and MIT reuse are in `visual-fixture/studio-adapters/ecommerce/provenance.json`.

Final visual review found and corrected conflicting tablet grid utility classes. The corrected React build is served at `http://127.0.0.1:4008/index.html#ecommerce`. Regenerating the portable `Allura-dashboard-preview.html` after this correction is blocked by a missing Team RAM governance-preflight hook file. The portable artifact therefore contains the new interactions but still predates that tablet correction. No hook bypass or configuration change was attempted.

## Guided review walkthrough — 2026-10-22

The React preview's Review changes screen (`#review`) now guides a handbook example through source, proposal, independent fictional review and outcome. The source facts come from the existing Company Knowledge fixture. Submission freezes the source version and proposal for review; the reviewer must choose a decision and supply a reason. Approval, requests for evidence and rejection have distinct explanations. Revision clears the previous decision and rationale; Restart walkthrough restores the initial example. The controller lives above the routed screens, so navigation preserves progress while reloading clears it.

The outcome is a local illustrative record, not a server-issued receipt or authenticated approval. It does not edit the source, publish knowledge, create tasks or attachments, or contact a service. Links to Work Board, Files, Connections and Store overview open their separate sample areas. This update applies to the React source; the portable single-file HTML has not been regenerated. Component tests and a production build can validate behavior and integration, but current browser visual and responsive verification remains unconfirmed because the browser tool denied access to the local page.
