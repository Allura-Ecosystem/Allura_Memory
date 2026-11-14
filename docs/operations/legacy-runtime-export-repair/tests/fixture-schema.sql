-- Authored MINIMAL test schema, not a reproduction of the production migrations.
-- Only in an in-memory PGlite engine. No production connections or credentials.
CREATE TABLE graph_memories (
 id uuid PRIMARY KEY, group_id text NOT NULL, workspace_id text,
 workspace_scope_state text NOT NULL DEFAULT 'workspace_scoped',
 user_id text, content text NOT NULL, score double precision NOT NULL DEFAULT 0.9,
 provenance text NOT NULL DEFAULT 'manual', created_at timestamptz NOT NULL DEFAULT '2026-01-01',
 version integer NOT NULL DEFAULT 1, tags jsonb NOT NULL DEFAULT '[]',
 deprecated boolean NOT NULL DEFAULT false, deleted_at timestamptz
);
CREATE TABLE graph_supersedes (
 id bigserial PRIMARY KEY, group_id text NOT NULL, workspace_id text,
 workspace_scope_state text NOT NULL DEFAULT 'workspace_scoped',
 newer_id uuid NOT NULL, superseded_id uuid NOT NULL
);
CREATE TABLE events (
 id bigserial PRIMARY KEY, group_id text NOT NULL, workspace_id text,
 event_type text NOT NULL, metadata jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT '2026-01-01'
);
CREATE ROLE export_fixture_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE export_fixture_no_graph NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO export_fixture_app, export_fixture_no_graph;
GRANT SELECT ON graph_memories, graph_supersedes, events TO export_fixture_app;
GRANT SELECT ON events TO export_fixture_no_graph;
ALTER TABLE graph_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_memories FORCE ROW LEVEL SECURITY;
ALTER TABLE graph_supersedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_supersedes FORCE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
CREATE POLICY fixture_scope ON graph_memories USING (
 group_id=current_setting('app.current_group_id',true)
 AND workspace_id=current_setting('app.current_workspace_id',true)
 AND NULLIF(current_setting('app.current_principal',true),'') IS NOT NULL
);
CREATE POLICY fixture_scope ON graph_supersedes USING (
 group_id=current_setting('app.current_group_id',true)
 AND workspace_id=current_setting('app.current_workspace_id',true)
 AND NULLIF(current_setting('app.current_principal',true),'') IS NOT NULL
);
CREATE POLICY fixture_scope ON events USING (
 group_id=current_setting('app.current_group_id',true)
 AND workspace_id=current_setting('app.current_workspace_id',true)
 AND NULLIF(current_setting('app.current_principal',true),'') IS NOT NULL
);
