/** Reusable permission requests, not identities, saved secrets or authority grants. */
export const CONNECTION_PROFILES = [
  { id: "read-only", name: "Read only", description: "Look up memory without changing it. A safe starting point for a new client.", scopes: ["memory:read"] },
  { id: "read-write", name: "Read & write", description: "Read and contribute memory. No delete, review or administrative permissions.", scopes: ["memory:read", "memory:write"] },
] as const;
export type ConnectionProfile = typeof CONNECTION_PROFILES[number];
