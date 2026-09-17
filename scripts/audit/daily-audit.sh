#!/bin/bash
#
# Daily Audit Script - Health Checks for 6-Month Operational Stability
#
# This script runs daily health checks and logs results to the audit log.
# It is designed to catch issues early and maintain operational stability.
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/.opencode/state/audit"
LOG_FILE="${LOG_DIR}/daily-$(date +%Y-%m-%d).log"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/health}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create log directory if it doesn't exist
mkdir -p "${LOG_DIR}"

# Logging function
log() {
  local level="$1"
  local message="$2"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

log_info() {
  log "INFO" "$1"
}

log_warning() {
  log "WARNING" "$1"
}

log_error() {
  log "ERROR" "$1"
}

log_success() {
  log "SUCCESS" "$1"
}

# Check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Initialize audit
log_info "=== Daily Health Audit Started ==="
log_info "Project Root: ${PROJECT_ROOT}"
log_info "Health URL: ${HEALTH_URL}"

# Counters
WARNINGS=0
ERRORS=0
CHECKS_PASSED=0

# Helper to check exit status
check_status() {
  local check_name="$1"
  local status="$2"
  
  if [ "$status" -eq 0 ]; then
    log_success "✓ ${check_name}"
    ((CHECKS_PASSED++))
  else
    log_error "✗ ${check_name}"
    ((ERRORS++))
  fi
}

# =============================================================================
# SECTION 1: Encoding Validation
# =============================================================================

log_info "=== Section 1: Encoding Validation ==="

# Check memory-bank files for encoding issues
if [ -d "${PROJECT_ROOT}/memory-bank" ]; then
  ENCODING_ISSUES=0
  
  for file in "${PROJECT_ROOT}/memory-bank"/*.md; do
    if [ -f "$file" ]; then
      # Check for null bytes (corruption indicator)
      if grep -q $'\x00' "$file" 2>/dev/null; then
        log_warning "Encoding issue in: $file (null bytes detected)"
        ((ENCODING_ISSUES++))
      elif ! file "$file" | grep -q "UTF-8\|ASCII"; then
        log_warning "Encoding issue in: $file (not UTF-8 or ASCII)"
        ((ENCODING_ISSUES++))
      fi
    fi
  done
  
  if [ "$ENCODING_ISSUES" -eq 0 ]; then
    log_success "✓ All memory-bank files have valid encoding"
    ((CHECKS_PASSED++))
  else
    log_error "✗ ${ENCODING_ISSUES} memory-bank files have encoding issues"
    ((ERRORS++))
  fi
else
  log_warning "memory-bank directory not found"
  ((WARNINGS++))
fi

# Check story files for encoding issues
if [ -d "${PROJECT_ROOT}/_bmad_output/implementation-artifacts" ]; then
  ENCODING_ISSUES=0
  
  for file in "${PROJECT_ROOT}/_bmad_output/implementation-artifacts"/*.md; do
    if [ -f "$file" ]; then
      if grep -q $'\x00' "$file" 2>/dev/null; then
        log_warning "Encoding issue in: $file (null bytes detected)"
        ((ENCODING_ISSUES++))
      fi
    fi
  done
  
  if [ "$ENCODING_ISSUES" -eq 0 ]; then
    log_success "✓ All implementation artifacts have valid encoding"
    ((CHECKS_PASSED++))
  else
    log_error "✗ ${ENCODING_ISSUES} implementation artifacts have encoding issues"
    ((ERRORS++))
  fi
fi

# =============================================================================
# SECTION 2: Database Health
# =============================================================================

log_info "=== Section 2: Database Health ==="

# Check PostgreSQL status
if command_exists docker && docker ps | grep -q knowledge-postgres; then
  log_success "✓ PostgreSQL container is running"
  ((CHECKS_PASSED++))
  
  # Check PostgreSQL connection
  if docker exec knowledge-postgres pg_isready -U "${POSTGRES_USER:-ronin4life}" -d memory >/dev/null 2>&1; then
    log_success "✓ PostgreSQL is accepting connections"
    ((CHECKS_PASSED++))
  else
    log_error "✗ PostgreSQL is not accepting connections"
    ((ERRORS++))
  fi
else
  log_warning "PostgreSQL container not found (may be intentional in dev)"
  ((WARNINGS++))
fi

# Check Neo4j status
if command_exists docker && docker ps | grep -q knowledge-neo4j; then
  log_success "✓ Neo4j container is running"
  ((CHECKS_PASSED++))
  
  # Check Neo4j HTTP endpoint
  if command_exists curl && curl -s "http://localhost:7474" >/dev/null 2>&1; then
    log_success "✓ Neo4j HTTP endpoint is accessible"
    ((CHECKS_PASSED++))
  else
    log_warning "Neo4j HTTP endpoint not accessible (may not be critical)"
    ((WARNINGS++))
  fi
else
  log_warning "Neo4j container not found (may be intentional in dev)"
  ((WARNINGS++))
fi

# =============================================================================
# SECTION 3: State Directory Health
# =============================================================================

log_info "=== Section 3: State Directory Health ==="

# Check state directory exists and has proper structure
STATE_DIR="${PROJECT_ROOT}/.opencode/state"

if [ -d "${STATE_DIR}" ]; then
  log_success "✓ State directory exists"
  ((CHECKS_PASSED++))
  
  # Check checkpoints directory
  if [ -d "${STATE_DIR}/checkpoints" ]; then
    CHECKPOINT_COUNT=$(find "${STATE_DIR}/checkpoints" -name "*.json" 2>/dev/null | wc -l)
    log_info "Found ${CHECKPOINT_COUNT} checkpoint(s)"
    
    if [ "$CHECKPOINT_COUNT" -gt 100 ]; then
      log_warning "More than 100 checkpoints found, consider cleanup"
      ((WARNINGS++))
    else
      log_success "✓ Checkpoint count is healthy"
      ((CHECKS_PASSED++))
    fi
  else
    log_warning "Checkpoints directory not found"
    ((WARNINGS++))
  fi
  
  # Check sessions directory
  if [ -d "${STATE_DIR}/sessions" ]; then
    SESSION_COUNT=$(find "${STATE_DIR}/sessions" -name "*.json" 2>/dev/null | wc -l)
    log_info "Found ${SESSION_COUNT} session state file(s)"
    log_success "✓ Sessions directory exists"
    ((CHECKS_PASSED++))
  else
    log_warning "Sessions directory not found"
    ((WARNINGS++))
  fi
else
  log_warning "State directory not found, will be created on first use"
  ((WARNINGS++))
  
  # Create state directory structure
  mkdir -p "${STATE_DIR}/checkpoints"
  mkdir -p "${STATE_DIR}/sessions"
  log_info "Created state directory structure"
fi

# =============================================================================
# SECTION 4: Budget Enforcement
# =============================================================================

log_info "=== Section 4: Budget Enforcement ==="

# Check if budget limits are configured
BUDGET_CONFIG="${PROJECT_ROOT}/src/lib/budget/types.ts"

if [ -f "${BUDGET_CONFIG}" ]; then
  # Check for default budget limits
  if grep -q "DEFAULT_BUDGET_LIMITS" "${BUDGET_CONFIG}"; then
    log_success "✓ Budget limits are configured"
    ((CHECKS_PASSED++))
  else
    log_warning "Budget limits configuration may be incomplete"
    ((WARNINGS++))
  fi
else
  log_error "✗ Budget configuration not found"
  ((ERRORS++))
fi

# =============================================================================
# SECTION 5: Health Check Endpoint
# =============================================================================

log_info "=== Section 5: Health Check Endpoint ==="

# Check if the application is running and health endpoint is accessible
if command_exists curl; then
  response=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}?detailed=true" 2>/dev/null || echo "000")
  
  if [ "$response" -eq 200 ]; then
    log_success "✓ Health check endpoint returned 200 OK"
    ((CHECKS_PASSED++))
  elif [ "$response" -eq 503 ]; then
    log_warning "Health check endpoint returned 503 Service Unavailable"
    ((WARNINGS++))
    
    # Get detailed health status
    detailed_response=$(curl -s "${HEALTH_URL}?detailed=true" 2>/dev/null || echo "{}")
    log_info "Health details: ${detailed_response}"
  else
    log_error "✗ Health check endpoint returned ${response}"
    ((ERRORS++))
  fi
else
  log_warning "curl not available, skipping health endpoint check"
  ((WARNINGS++))
fi

# =============================================================================
# SECTION 6: TypeScript and Build
# =============================================================================

log_info "=== Section 6: TypeScript and Build ==="

# Run TypeScript type check
if command_exists npm; then
  log_info "Running TypeScript type check..."
  
  if npm run typecheck >/dev/null 2>&1; then
    log_success "✓ TypeScript types are valid"
    ((CHECKS_PASSED++))
  else
    log_error "✗ TypeScript type check failed"
    ((ERRORS++))
  fi
  
  # Run lint check
  log_info "Running lint check..."
  
  if npm run lint >/dev/null 2>&1; then
    log_success "✓ Lint check passed"
    ((CHECKS_PASSED++))
  else
    log_warning "Lint check found issues (may not be critical)"
    ((WARNINGS++))
  fi
else
  log_warning "npm not available, skipping TypeScript checks"
  ((WARNINGS++))
fi

# =============================================================================
# SECTION 7: Git Status
# =============================================================================

log_info "=== Section 7: Git Status ==="

if command_exists git && [ -d "${PROJECT_ROOT}/.git" ]; then
  # Check for uncommitted changes
  UNCOMMITTED=$(git status --porcelain | wc -l)
  
  if [ "$UNCOMMITTED" -eq 0 ]; then
    log_success "✓ No uncommitted changes"
    ((CHECKS_PASSED++))
  else
    log_warning "Found ${UNCOMMITTED} uncommitted file(s)"
    ((WARNINGS++))
  fi
  
  # Check current branch
  CURRENT_BRANCH=$(git branch --show-current)
  log_info "Current branch: ${CURRENT_BRANCH}"
  
  # Check for stashed changes
  STASH_COUNT=$(git stash list | wc -l)
  if [ "$STASH_COUNT" -gt 0 ]; then
    log_warning "Found ${STASH_COUNT} stashed change(s)"
    ((WARNINGS++))
  fi
else
  log_warning "Not a git repository or git not available"
  ((WARNINGS++))
fi

# =============================================================================
# SECTION 8: Final Summary
# =============================================================================

log_info "=== Audit Summary ==="
log_info "Checks Passed: ${CHECKS_PASSED}"
log_info "Warnings: ${WARNINGS}"
log_info "Errors: ${ERRORS}"

if [ "$ERRORS" -gt 0 ]; then
  log_error "AUDIT FAILED: ${ERRORS} error(s) detected"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  log_warning "AUDIT PASSED WITH WARNINGS: ${WARNINGS} warning(s)"
  exit 0
else
  log_success "AUDIT PASSED: All checks successful"
  exit 0
fi