# Allura Deployment Guide

Step-by-step guide for deploying Allura to development, staging, and production environments.

---

## Table of Contents

- [Quick Start (Local)](#quick-start-local)
- [Docker Compose (Recommended for Small Deployments)](#docker-compose)
- [Kubernetes (Production)](#kubernetes)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Monitoring & Observability](#monitoring--observability)
- [Backup & Disaster Recovery](#backup--disaster-recovery)
- [Security](#security)

---

## Quick Start (Local)

For development and testing on your machine.

### Prerequisites

- Docker Desktop (includes docker-compose)
- Bun 1.0+
- 4GB RAM available
- Ports 5432, 3000 available

### Setup

```bash
# Clone repository
git clone https://github.com/yourorg/allura.git
cd allura

# Install dependencies
bun install

# Create environment file
cp .env.example .env

# Edit .env (optional for local dev, defaults are safe)
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/allura

# Start infrastructure
docker compose up -d

# Verify health
curl http://localhost:3000/api/health

# Start development server
bun next dev

# Connect MCP (optional)
# In another terminal:
bun run mcp
```

Visit:
- **Consumer Memory Viewer:** http://localhost:3000/memory
- **Admin Dashboard:** http://localhost:3000/admin

---

## Docker Compose

Recommended for small teams and on-premise deployments (< 1M memories/month).

### File: `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16  # PostgreSQL 16 + RuVector (pgvector)
    environment:
      POSTGRES_DB: allura
      POSTGRES_USER: allura
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres-init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U allura"]
      interval: 10s
      timeout: 5s
      retries: 5

  allura-app:
    build: .
    environment:
      DATABASE_URL: postgresql://allura:${POSTGRES_PASSWORD}@postgres:5432/allura
      PROMOTION_MODE: ${PROMOTION_MODE:-soc2}
      AUTO_APPROVAL_THRESHOLD: ${AUTO_APPROVAL_THRESHOLD:-0.85}
      SOFT_DELETE_RETENTION_DAYS: ${SOFT_DELETE_RETENTION_DAYS:-30}
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./src:/app/src

volumes:
  postgres_data:
```

### Setup

```bash
# Create .env file
cat > .env <<EOF
POSTGRES_PASSWORD=your-secure-postgres-password
PROMOTION_MODE=soc2
AUTO_APPROVAL_THRESHOLD=0.85
JWT_SECRET=your-jwt-secret-key
ENCRYPTION_KEY=your-encryption-key
EOF

# Start services
docker compose up -d

# Check logs
docker compose logs -f allura-app

# Stop services
docker compose down

# Clean up volumes (WARNING: deletes data)
docker compose down -v
```

### Health Checks

```bash
# API health
curl http://localhost:3000/api/health

# PostgreSQL
docker compose exec postgres psql -U allura -d allura -c "SELECT 1"
```

---

## Kubernetes

For production deployments. Uses Helm for configuration management.

### Prerequisites

- Kubernetes 1.24+
- Helm 3.0+
- kubectl configured
- Persistent volume provisioner (e.g., EBS, NFS)

### File: `helm/values.yaml`

```yaml
replicaCount: 3

image:
  repository: your-registry/allura
  tag: 1.0.0
  pullPolicy: IfNotPresent

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: allura.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: allura-tls
      hosts:
        - allura.example.com

postgresql:
  enabled: true
  auth:
    username: allura
    password: your-secure-postgres-password
  primary:
    persistence:
      enabled: true
      size: 100Gi  # Adjust based on expected data volume

allura:
  promotionMode: soc2
  autoApprovalThreshold: 0.85
  softDeleteRetentionDays: 30
  
  # Security
  jwtSecret: ${JWT_SECRET}
  encryptionKey: ${ENCRYPTION_KEY}
  
  # Resource limits
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "2Gi"
      cpu: "1000m"
  
  # Autoscaling
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
```

### Deployment

```bash
# Add Helm repo
helm repo add allura https://charts.example.com
helm repo update

# Create namespace
kubectl create namespace allura
kubectl config set-context --current --namespace=allura

# Install
helm install allura allura/allura \
  --namespace allura \
  --values helm/values.yaml

# Verify
kubectl get pods -n allura
kubectl logs -n allura -f deployment/allura-app

# Check service
kubectl get svc -n allura

# Upgrade
helm upgrade allura allura/allura \
  --namespace allura \
  --values helm/values.yaml

# Uninstall (keeps data if using persistent volumes)
helm uninstall allura --namespace allura
```

### Accessing the Service

```bash
# Port forward for local access
kubectl port-forward -n allura svc/allura 3000:80

# Or use Ingress (requires external IP)
# Get ingress IP
kubectl get ingress -n allura
# Visit https://allura.example.com
```

---

## Environment Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://allura:pass@postgres:5432/allura` |
| `JWT_SECRET` | JWT signing key | (generate with `openssl rand -base64 32`) |
| `ENCRYPTION_KEY` | Data encryption key | (generate with `openssl rand -base64 32`) |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMOTION_MODE` | `soc2` | `soc2` or `auto` |
| `AUTO_APPROVAL_THRESHOLD` | `0.85` | Confidence threshold (0–1) |
| `SOFT_DELETE_RETENTION_DAYS` | `30` | How long to keep deleted memories |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `PORT` | `3000` | HTTP port |
| `SLACK_WEBHOOK_URL` | (none) | For curator notifications |

### Generating Secure Secrets

```bash
# JWT Secret (32 bytes, base64)
openssl rand -base64 32

# Encryption Key (32 bytes, hex)
openssl rand -hex 32

# PostgreSQL Password
openssl rand -base64 16
```

### Loading from .env

```bash
# Development
cat > .env.local <<EOF
DATABASE_URL=postgresql://allura:password@localhost:5432/allura
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF

source .env.local
```

---

## Database Setup

### PostgreSQL Initialization

The `postgres-init/` directory contains SQL scripts executed on first startup:

**File: `postgres-init/01-schema.sql`**

```sql
-- Create extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  group_id VARCHAR(255) NOT NULL CHECK (group_id ~ '^allura-'),
  event_type VARCHAR(100) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  workflow_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_group_created ON events(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_metadata ON events USING GIN(metadata);

-- Proposals table
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id VARCHAR(255) NOT NULL CHECK (group_id ~ '^allura-'),
  event_id BIGINT NOT NULL REFERENCES events(id),
  memory_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  curator_id VARCHAR(255),
  notes TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_group ON proposals(group_id);
```

### Database Migrations

Allura uses schema versioning. Migrations are applied automatically:

```bash
# Check current schema version
curl http://localhost:3000/api/health | jq .schema_version

# Apply pending migrations (automatic on startup)
# No manual action required
```

---

## Monitoring & Observability

### Logging

Logs are written to stdout (for container environments):

```bash
# Development
LOG_LEVEL=debug bun next dev

# Production (via docker-compose)
docker compose logs -f allura-app

# Kubernetes
kubectl logs -n allura -f deployment/allura-app
```

### Metrics

Prometheus metrics available at `http://localhost:3000/metrics`:

```
# Memory operations
allura_memory_add_total
allura_memory_search_total
allura_memory_delete_total

# Promotion queue
allura_pending_reviews_total
allura_memory_promoted_total

# Database
allura_postgres_query_duration_seconds

# System
process_cpu_seconds_total
process_resident_memory_bytes
```

### Alerting

Example Prometheus rules:

```yaml
groups:
  - name: allura
    rules:
      - alert: HighPendingReviews
        expr: allura_pending_reviews_total > 100
        for: 1h
        annotations:
          summary: "Curator queue has {{ $value }} pending reviews"

      - alert: DatabaseLatency
        expr: histogram_quantile(0.95, allura_postgres_query_duration_seconds) > 1
        for: 5m
        annotations:
          summary: "P95 database latency is {{ $value }}s"

      - alert: PromotionFailures
        expr: rate(allura_promotion_failed_total[5m]) > 0.01
        for: 5m
        annotations:
          summary: "Promotion error rate is {{ $value }}/s"
```

---

## Backup & Disaster Recovery

### PostgreSQL Backups

```bash
# Manual backup
docker compose exec postgres pg_dump -U allura allura > backup-$(date +%Y%m%d-%H%M%S).sql

# Automated backup (via cron)
0 2 * * * docker compose exec postgres pg_dump -U allura allura | gzip > /backups/allura-$(date +\%Y\%m\%d).sql.gz

# Restore from backup
cat backup-20260407.sql | docker compose exec -T postgres psql -U allura allura
```

### Kubernetes Backup Strategy

Use persistent volume snapshots:

```bash
# Create snapshot (AWS EBS example)
aws ec2 create-snapshot \
  --volume-id <vol-id> \
  --description "Allura backup $(date +%Y%m%d)"

# Restore from snapshot
aws ec2 create-volume \
  --snapshot-id <snap-id> \
  --availability-zone <az>
```

---

## Security

### Network Security

```yaml
# Kubernetes NetworkPolicy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allura-network
spec:
  podSelector:
    matchLabels:
      app: allura
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
```

### TLS/SSL

```bash
# Generate self-signed cert (local dev)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Production: Use Let's Encrypt via cert-manager
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: allura-cert
  namespace: allura
spec:
  secretName: allura-tls
  issuerRef:
    name: letsencrypt-prod
  dnsNames:
    - allura.example.com
EOF
```

### Secret Management

```bash
# Kubernetes Secrets
kubectl create secret generic allura-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -base64 32) \
  --from-literal=ENCRYPTION_KEY=$(openssl rand -hex 32) \
  --from-literal=POSTGRES_PASSWORD=$(openssl rand -base64 16)

# Reference in pod
env:
  - name: JWT_SECRET
    valueFrom:
      secretKeyRef:
        name: allura-secrets
        key: JWT_SECRET
```

### Data Encryption

Allura supports BYOK (Bring Your Own Key) encryption:

```bash
# Enable encryption
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENCRYPTION_ENABLED=true bun next start
```

All sensitive metadata is encrypted at rest in PostgreSQL.

---

## Troubleshooting

### PostgreSQL Connection Failed

```bash
# Check connectivity
docker compose exec allura-app nc -zv postgres 5432

# Check logs
docker compose logs postgres

# Verify credentials
docker compose exec postgres psql -U allura -d allura -c "SELECT 1"
```

### High Memory Usage

```bash
# Check allocation
docker compose stats

# Increase limits
# Raise the allura-app / postgres resource limits in docker-compose.yml, then:
docker compose up -d
```

### Slow Queries

```bash
# Enable query logging
docker compose exec postgres psql -U allura -d allura -c \
  "ALTER SYSTEM SET log_statement = 'all';"

# Analyze slow query
docker compose exec postgres psql -U allura -d allura -c \
  "EXPLAIN ANALYZE SELECT ... FROM events WHERE ..."
```

---

## Scaling Considerations

| Component | Recommendation |
|-----------|-----------------|
| PostgreSQL | Vertical scaling (CPU + RAM); replicas for HA |
| RuVector (pgvector) | Runs inside PostgreSQL; scale with the PostgreSQL instance (CPU + RAM, replicas for reads) |
| App servers | Horizontal autoscaling (CPU/memory based) |
| Load balancer | Round-robin or least-connections |

For >1M memories/month, consider dedicated PostgreSQL managed service (AWS RDS, Google Cloud SQL) with the pgvector extension enabled.

---

## Maintenance

### Regular Tasks

| Task | Frequency | Command |
|------|-----------|---------|
| Database vacuum | Weekly | `docker compose exec postgres vacuumdb -U allura allura` |
| Index analysis | Monthly | `docker compose exec postgres analyze` |
| Log rotation | Daily | Handled by Docker daemon |
| Backup verification | Monthly | Restore and validate |

### Upgrades

```bash
# Pull latest image
docker compose pull

# Stop old containers
docker compose down

# Start new containers
docker compose up -d

# Verify health
curl http://localhost:3000/api/health
```

---

## Reference

- **Docker Compose Docs:** https://docs.docker.com/compose/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/16/
- **pgvector Docs:** https://github.com/pgvector/pgvector
- **Kubernetes Docs:** https://kubernetes.io/docs/
