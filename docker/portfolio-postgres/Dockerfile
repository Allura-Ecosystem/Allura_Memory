# The portfolio stack must not depend on host bind mounts: restricted Docker
# environments can build images but deny mounts even when they permit volumes.
FROM pgvector/pgvector:pg16

COPY docker/postgres-init/ /docker-entrypoint-initdb.d/
COPY docker/portfolio-postgres/99-portfolio-demo-workspace.sql /docker-entrypoint-initdb.d/99-portfolio-demo-workspace.sql
