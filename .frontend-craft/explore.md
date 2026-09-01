# Explore

- Brain assets found: Not available; the Allura Brain connector is not exposed in this runtime.
- Existing tokens: Yes, `src/app/globals.css`.
- Existing brand asset: `public/brand/allura-lettermark-al-figma.png`.
- Existing governed reads: `/api/curator/proposals` and the server-issued curator module registry.
- Existing governed mutations: `/api/curator/approve` for approve, reject, and request-evidence.
- Starting assumptions:
  - The approved brand-locked specimen is the visual and interaction direction.
  - The proposal route is the canonical queue/evidence/receipt read boundary.
  - Only curator and admin roles receive decision controls.
  - A decision is not successful until the endpoint returns a durable receipt.
- Rejection candidates:
  - Synthetic case data in production.
  - A second client-side permission model.
  - Raw colors or an imported dashboard template.
  - Decorative stages that are not connected to real workflow state.

