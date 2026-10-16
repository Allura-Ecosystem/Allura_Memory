// PostgreSQL 16 pg_get_expr output for migrations 36 and 40, over the TEXT
// columns defined in migrations 21/40. Live tests verify this fixture's contract.
export function supportedSemanticCatalog() {
  const tenant = "(group_id = current_setting('app.current_group_id'::text, true))"
  const workspace = "((group_id = current_setting('app.current_group_id'::text, true)) AND (workspace_id = current_setting('app.current_workspace_id'::text, true)) AND (workspace_scope_state = 'workspace_scoped'::text))"
  return ["graph_memories", "graph_supersedes"].map((table_name) => ({
    table_name, schema_verified: true, can_select: true, can_insert: true,
    can_update: table_name === "graph_memories", can_delete: false,
    policies: [
      { name: "tenant_isolation_policy", permissive: true, command: "*", roles: ["allura_app"], applicable: true, using_expression: tenant, check_expression: tenant },
      { name: "workspace_scope_restrictive_policy", permissive: false, command: "*", roles: ["allura_app"], applicable: true, using_expression: workspace, check_expression: workspace },
    ],
  }))
}
