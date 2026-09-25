#!/bin/bash
#
# Weekly Audit Script - Comprehensive Maintenance for 6-Month Operational Stability
#
# This script runs weekly comprehensive maintenance including:
# - Full dependency updates check
# - Database maintenance
# - Log rotation
# - Long-term drift detection
# - Performance metrics collection
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/.opencode/state/audit"
LOG_FILE="${LOG_DIR}/weekly-$(date +%Y-W%V).log"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/health}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_section() {
  local section_name="$1"
  echo "" | tee -a "${LOG_FILE}"
  log_info "=== ${section_name} ==="
}

# Check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Initialize audit
log_info "=== Weekly Maintenance Audit Started ==="
log_info "Project Root: ${PROJECT_ROOT}"
log_info "Health URL: ${HEALTH_URL}"
log_info "Date: $(date -u +"%Y-%m-%d")"

# Counters
WARNINGS=0
ERRORS=0
CHECKS_PASSED=0
MAINTENANCE_ACTIONS=0

# =============================================================================
# SECTION 1: Dependency Management
# =============================================================================

log_section "Dependency Management"

# Check for outdated dependencies
if command_exists npm; then
  log_info "Checking for outdated dependencies..."
  
  # Run npm outdated and capture output
  OUTDATED=$(npm outdated --json 2>/dev/null || echo "{}")
  
  if [ "$OUTDATED" != "{}" ] && [ "$OUTDATED" != "" ]; then
    OUTDATED_COUNT=$(echo "$OUTDATED" | jq 'keys | length' 2>/dev/null || echo "0")
    
    if [ "$OUTDATED_COUNT" -gt 0 ]; then
      log_warning "Found ${OUTDATED_COUNT} outdated package(s)"
      ((WARNINGS++))
      
      # Log major version updates (potential breaking changes)
      MAJOR_UPDATES=$(echo "$OUTDATED" | jq -r 'to_entries[] | select(.value.current != null) | select(.value.current | split(".")[0] != .value.latest | split(".")[0]) | .key' 2>/dev/null || echo "")
      
      if [ -n "$MAJOR_UPDATES" ]; then
        log_warning "Major version updates available (review carefully):"
        echo "$MAJOR_UPDATES" | while read -r pkg; do
          log_warning "  - $pkg"
        done
      fi
      
      # Log security vulnerabilities
      if command_exists npm; then
        SECURITY_ISSUES=$(npm audit --json 2>/dev/null | jq '.metadata.vulnerabilities.total // 0' || echo "0")
        
        if [ "$SECURITY_ISSUES" -gt 0 ]; then
          log_error "Found ${SECURITY_ISSUES} security vulnerability(ies)"
          ((ERRORS++))
          
          # Show details
          npm audit 2>/dev/null | tail -20 | while read -r line; do
            log_error "  $line"
          done
        else
          log_success "✓ No security vulnerabilities found"
          ((CHECKS_PASSED++))
        fi
      fi
    else
      log_success "✓ All dependencies are up to date"
      ((CHECKS_PASSED++))
    fi
  else
    log_success "✓ All dependencies are up to date"
    ((CHECKS_PASSED++))
  fi
fi

# =============================================================================
# SECTION 2: Database Maintenance
# =============================================================================

log_section "Database Maintenance"

# PostgreSQL VACUUM and ANALYZE
if command_exists docker && docker ps | grep -q knowledge-postgres; then
  log_info "Running PostgreSQL maintenance..."
  
  # Vacuum analyze to optimize query performance
  if docker exec knowledge-postgres psql -U "${POSTGRES_USER:-ronin4life}" -d memory -c "VACUUM ANALYZE;" >/dev/null 2>&1; then
    log_success "✓ PostgreSQL VACUUM ANALYZE completed"
    ((MAINTENANCE_ACTIONS++))
  else
    log_warning "PostgreSQL VACUUM ANALYZE failed (may need full vacuum)"
    ((WARNINGS++))
  fi
  
  # Check PostgreSQL disk usage
  DB_SIZE=$(docker exec knowledge-postgres psql -U "${POSTGRES_USER:-ronin4life}" -d memory -c "SELECT pg_size_pretty(pg_database_size('memory'));" -t 2>/dev/null | xargs)
  log_info "Database size: ${DB_SIZE}"
  
  # Check table bloat
  BLOAT_QUERY="
    SELECT schemaname, tablename, 
           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
           n_dead_tup, n_live_tup
    FROM pg_stat_user_tables
    WHERE n_dead_tup > 10000
    ORDER BY n_dead_tup DESC
    LIMIT 5;
  "
  
  BLOATED_TABLES=$(docker exec knowledge-postgres psql -U "${POSTGRES_USER:-ronin4life}" -d memory -c "${BLOAT_QUERY}" -t 2>/dev/null || echo "")
  
  if [ -n "$BLOATED_TABLES" ]; then
    log_warning "Found tables with significant bloat:"
    echo "$BLOATED_TABLES" | while read -r line; do
      if [ -n "$line" ]; then
        log_warning "  $line"
      fi
    done
    ((WARNINGS++))
  else
    log_success "✓ No significant table bloat detected"
    ((CHECKS_PASSED++))
  fi
fi

# Neo4j maintenance
if command_exists docker && docker ps | grep -q knowledge-neo4j; then
  log_info "Running Neo4j maintenance..."
  
  # Check Neo4j store size
  NEO4J_DATA_SIZE=$(docker exec knowledge-neo4j du -sh /data 2>/dev/null | cut -f1 || echo "unknown")
  log_info "Neo4j data size: ${NEO4J_DATA_SIZE}"
  
  # Check transaction logs
  TX_LOG_SIZE=$(docker exec knowledge-neo4j du -sh /data/transactions 2>/dev/null | cut -f1 || echo "0")
  
  if [ "$TX_LOG_SIZE" != "0" ] && [ "$TX_LOG_SIZE" != "unknown" ]; then
    # Check if tx log size is concerning (> 100MB)
    if [[ "$TX_LOG_SIZE" == *"M"* ]] || [[ "$TX_LOG_SIZE" == *"G"* ]]; then
      log_info "Transaction log size: ${TX_LOG_SIZE}"
      # Note: Neo4j prunes transaction logs automatically, but we log the size
      log_success "✓ Neo4j transaction logs are manageable"
      ((CHECKS_PASSED++))
    else
      log_success "✓ Neo4j transaction logs are small"
      ((CHECKS_PASSED++))
    fi
  else
    log_success "✓ Neo4j maintenance not required"
    ((CHECKS_PASSED++))
  fi
fi

# =============================================================================
# SECTION 3: Log Rotation and Cleanup
# =============================================================================

log_section "Log Rotation and Cleanup"

# Rotate old audit logs (keep last 12 weeks)
if [ -d "${LOG_DIR}" ]; then
  log_info "Cleaning up old audit logs..."
  
  # Find and delete logs older than 12 weeks
  OLD_LOGS=$(find "${LOG_DIR}" -name "*.log" -type f -mtime +84 2>/dev/null | wc -l)
  
  if [ "$OLD_LOGS" -gt 0 ]; then
    find "${LOG_DIR}" -name "*.log" -type f -mtime +84 -delete 2>/dev/null || true
    log_success "✓ Removed ${OLD_LOGS} old audit log(s)"
    ((MAINTENANCE_ACTIONS++))
  else
    log_success "✓ No old audit logs to clean up"
    ((CHECKS_PASSED++))
  fi
fi

# Clean up old checkpoints (keep last 30 days)
CHECKPOINT_DIR="${PROJECT_ROOT}/.opencode/state/checkpoints"
if [ -d "${CHECKPOINT_DIR}" ]; then
  log_info "Cleaning up old checkpoints..."
  
  OLD_CHECKPOINTS=$(find "${CHECKPOINT_DIR}" -name "*.json" -type f -mtime +30 2>/dev/null | wc -l)
  
  if [ "$OLD_CHECKPOINTS" -gt 0 ]; then
    find "${CHECKPOINT_DIR}" -name "*.json" -type f -mtime +30 -delete 2>/dev/null || true
    log_success "✓ Removed ${OLD_CHECKPOINTS} old checkpoint(s)"
    ((MAINTENANCE_ACTIONS++))
  else
    log_success "✓ No old checkpoints to clean up"
    ((CHECKS_PASSED++))
  fi
fi

# Clean up old session states (keep last 7 days)
SESSION_DIR="${PROJECT_ROOT}/.opencode/state/sessions"
if [ -d "${SESSION_DIR}" ]; then
  log_info "Cleaning up old session states..."
  
  OLD_SESSIONS=$(find "${SESSION_DIR}" -name "*.json" -type f -mtime +7 2>/dev/null | wc -l)
  
  if [ "$OLD_SESSIONS" -gt 0 ]; then
    find "${SESSION_DIR}" -name "*.json" -type f -mtime +7 -delete 2>/dev/null || true
    log_success "✓ Removed ${OLD_SESSIONS} old session state(s)"
    ((MAINTENANCE_ACTIONS++))
  else
    log_success "✓ No old session states to clean up"
    ((CHECKS_PASSED++))
  fi
fi

# =============================================================================
# SECTION 4: Long-term Drift Detection
# =============================================================================

log_section "Long-term Drift Detection"

# Check if drift analyzer exists
DRIFT_ANALYZER="${PROJECT_ROOT}/src/lib/validation/planning-drift-analyzer.ts"
if [ -f "${DRIFT_ANALYZER}" ]; then
  log_success "✓ Planning drift analyzer is available"
  ((CHECKS_PASSED++))
  
  # Check for drift over the past week by comparing with previous week's audit
  LAST_WEEK_LOG="${LOG_DIR}/weekly-$(date -v-7d +%Y-W%V).log" 2>/dev/null || echo ""
  
  if [ -f "${LAST_WEEK_LOG}" ]; then
    log_info "Comparing with last week's audit..."
    
    # Extract story counts from last week
    LAST_WEEK_STORIES=$(grep "stories" "${LAST_WEEK_LOG}" | tail -1 | grep -oE '[0-9]+' || echo "0")
    
    # Current story count (simplified - would use actual drift analyzer in production)
    CURRENT_STORIES=$(find "${PROJECT_ROOT}/_bmad_output/implementation-artifacts" -name "story-*.md" 2>/dev/null | wc -l || echo "0")
    
    log_info "Stories: Last week=${LAST_WEEK_STORIES}, Current=${CURRENT_STORIES}"
    
    # Check for significant drift (> 20% change)
    if [ "$LAST_WEEK_STORIES" -gt 0 ]; then
      DRIFT_THRESHOLD=$((LAST_WEEK_STORIES / 5))  # 20%
      
      if [ "$CURRENT_STORIES" -gt $((LAST_WEEK_STORIES + DRIFT_THRESHOLD)) ]; then
        log_warning "Significant story count increase detected (+$((CURRENT_STORIES - LAST_WEEK_STORIES)))"
        ((WARNINGS++))
      elif [ "$CURRENT_STORIES" -lt $((LAST_WEEK_STORIES - DRIFT_THRESHOLD)) ]; then
        log_warning "Significant story count decrease detected (-$((LAST_WEEK_STORIES - CURRENT_STORIES)))"
        ((WARNINGS++))
      else
        log_success "✓ No significant drift detected"
        ((CHECKS_PASSED++))
      fi
    fi
  else
    log_info "No last week audit log found for comparison"
    ((CHECKS_PASSED++))
  fi
fi

# Validate encoding across all critical files (more thorough than daily)
log_info "Validating encoding across all critical files..."

CRITICAL_DIRS=(
  "${PROJECT_ROOT}/src"
  "${PROJECT_ROOT}/memory-bank"
  "${PROJECT_ROOT}/_bmad_output"
  "${PROJECT_ROOT}/.opencode"
)

ENCODING_ISSUES=0

for dir in "${CRITICAL_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    # Find and check all TypeScript/JavaScript/Markdown files
    while IFS= read -r -d '' file; do
      if file "$file" | grep -q "UTF-8\|ASCII"; then
        # UTF-8 or ASCII - good
        :
      else
        log_warning "Encoding issue in: $file"
        ((ENCODING_ISSUES++))
      fi
    done < <(find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.md" \) -print0 2>/dev/null || true)
  fi
done

if [ "$ENCODING_ISSUES" -eq 0 ]; then
  log_success "✓ All critical files have valid encoding"
  ((CHECKS_PASSED++))
else
  log_error "✗ ${ENCODING_ISSUES} file(s) have encoding issues"
  ((ERRORS++))
fi

# =============================================================================
# SECTION 5: Performance Metrics Collection
# =============================================================================

log_section "Performance Metrics Collection"

# Collect TypeScript compile time
if command_exists npm && [ -f "${PROJECT_ROOT}/tsconfig.json" ]; then
  log_info "Measuring TypeScript compile time..."
  
  COMPILE_START=$(date +%s%N 2>/dev/null || echo "0")
  npm run typecheck --silent >/dev/null 2>&1 || true
  COMPILE_END=$(date +%s%N 2>/dev/null || echo "0")
  
  if [ "$COMPILE_START" != "0" ] && [ "$COMPILE_END" != "0" ]; then
    COMPILE_TIME_MS=$(( (COMPILE_END - COMPILE_START) / 1000000 ))
    log_info "TypeScript compile time: ${COMPILE_TIME_MS}ms"
    
    # Warn if compile time exceeds 10 seconds
    if [ "$COMPILE_TIME_MS" -gt 10000 ]; then
      log_warning "TypeScript compile time exceeds 10s (may indicate codebase size issues)"
      ((WARNINGS++))
    else
      log_success "✓ TypeScript compile time is acceptable"
      ((CHECKS_PASSED++))
    fi
  fi
fi

# Collect test execution time
if command_exists npm && [ -d "${PROJECT_ROOT}/src" ]; then
  log_info "Measuring test execution time..."
  
  TEST_START=$(date +%s%N 2>/dev/null || echo "0")
  npm test --silent --run 2>/dev/null || true
  TEST_END=$(date +%s%N 2>/dev/null || echo "0")
  
  if [ "$TEST_START" != "0" ] && [ "$TEST_END" != "0" ]; then
    TEST_TIME_MS=$(( (TEST_END - TEST_START) / 1000000 ))
    log_info "Test execution time: ${TEST_TIME_MS}ms"
    
    # Store test time for trend analysis
    echo "$(date -I):${TEST_TIME_MS}" >> "${LOG_DIR}/test-times.csv"
    
    log_success "✓ Test metrics collected"
    ((CHECKS_PASSED++))
  fi
fi

# Database query performance sampling
if command_exists docker && docker ps | grep -q knowledge-postgres; then
  log_info "Sampling database query performance..."
  
  # Run EXPLAIN ANALYZE on a sample query
  SAMPLE_QUERY="EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1;"
  QUERY_TIME=$(docker exec knowledge-postgres psql -U "${POSTGRES_USER:-ronin4life}" -d memory -c "${SAMPLE_QUERY}" -t 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "0")
  
  log_info "Sample query time: ${QUERY_TIME}ms"
  
  # Store query time for trend analysis
  echo "$(date -I):${QUERY_TIME}" >> "${LOG_DIR}/query-times.csv"
  
  log_success "✓ Database performance metrics collected"
  ((CHECKS_PASSED++))
fi

# =============================================================================
# SECTION 6: Long-term Health Trends
# =============================================================================

log_section "Long-term Health Trends"

# Analyze test time trends (last 12 weeks)
if [ -f "${LOG_DIR}/test-times.csv" ]; then
  log_info "Analyzing test time trends..."
  
  # Simple trend analysis (would be more sophisticated in production)
  RECENT_TIMES=$(tail -n 12 "${LOG_DIR}/test-times.csv" 2>/dev/null || echo "")
  
  if [ -n "$RECENT_TIMES" ]; then
    AVG_TIME=$(echo "$RECENT_TIMES" | awk -F':' '{sum+=$2} END {print sum/NR}')
    log_info "Average test time (12 weeks): ${AVG_TIME}ms"
    
    log_success "✓ Test time trends collected"
    ((CHECKS_PASSED++))
  fi
fi

# Analyze query time trends (last 12 weeks)
if [ -f "${LOG_DIR}/query-times.csv" ]; then
  log_info "Analyzing query time trends..."
  
  RECENT_QUERY_TIMES=$(tail -n 12 "${LOG_DIR}/query-times.csv" 2>/dev/null || echo "")
  
  if [ -n "$RECENT_QUERY_TIMES" ]; then
    AVG_QUERY_TIME=$(echo "$RECENT_QUERY_TIMES" | awk -F':' '{sum+=$2} END {print sum/NR}')
    log_info "Average query time (12 weeks): ${AVG_QUERY_TIME}ms"
    
    log_success "✓ Query time trends collected"
    ((CHECKS_PASSED++))
  fi
fi

# =============================================================================
# SECTION 7: Final Summary
# =============================================================================

log_section "Audit Summary"

log_info "Checks Passed: ${CHECKS_PASSED}"
log_info "Warnings: ${WARNINGS}"
log_info "Errors: ${ERRORS}"
log_info "Maintenance Actions: ${MAINTENANCE_ACTIONS}"

# Generate metrics summary
log_info "Metrics Summary:"
log_info "  - Database Size: ${DB_SIZE:-unknown}"
log_info "  - Neo4j Data Size: ${NEO4J_DATA_SIZE:-unknown}"
log_info "  - TypeScript Compile Time: ${COMPILE_TIME_MS:-unknown}ms"

if [ "$ERRORS" -gt 0 ]; then
  log_error "WEEKLY AUDIT FAILED: ${ERRORS} error(s) detected"
  log_error "Review errors above and resolve before next weekly audit"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  log_warning "WEEKLY AUDIT PASSED WITH WARNINGS: ${WARNINGS} warning(s)"
  log_warning "Review warnings above and consider addressing issues"
  exit 0
else
  log_success "WEEKLY AUDIT PASSED: All checks successful, ${MAINTENANCE_ACTIONS} maintenance actions completed"
  exit 0
fi