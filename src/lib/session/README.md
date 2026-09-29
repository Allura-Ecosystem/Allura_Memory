# Session Stability System

> **6-Month Operational Stability for Long-Running Agent Sessions**

**Purpose:** Ensures AI agents maintain state, recover from crashes, and stay within budget across extended operational periods (6+ months).

**The Problem:** Agents lose context on crashes, exceed budgets silently, and drift from planned work without detection.

**The Solution:** A comprehensive stability layer with encoding validation, state hydration, checkpoint recovery, budget enforcement, and drift detection.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Components](#components)
- [4-Layer Encoding Priority](#4-layer-encoding-priority)
- [Alert Severity Levels](#alert-severity-levels)
- [Checkpoint & Recovery Flow](#checkpoint--recovery-flow)
- [Integration Points](#integration-points)
- [Usage Examples](#usage-examples)
- [Monitoring & Auditing](#monitoring--auditing)
- [Next Steps](#next-steps)

---

## Quick Start

```typescript
import { SessionBootstrap } from '@/lib/session/session-bootstrap';

// Initialize session with full stability checks
const bootstrap = new SessionBootstrap({
  groupId: 'allura-project-1',
  enableEncodingValidation: true,
  enableCheckpoints: true,
  enableBudget: true,
  enableDriftDetection: true,
});

const result = await bootstrap.bootstrap();

if (!result.success) {
  // Handle FATAL alerts - attempt recovery
  const checkpoint = await bootstrap.recover();
  if (checkpoint) {
    console.log('Recovered from checkpoint:', checkpoint.phase);
  }
}

console.log('Session ready:', result.sessionId);
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT EXECUTION LAYER                     │
│              (OpenClaw / Claude Code / OpenCode)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  SESSION BOOTSTRAP                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Phase 1    │  │   Phase 2    │  │     Phase 3      │  │
│  │   Encoding   │──▶│   State      │──▶│   Checkpoint     │  │
│  │ Validation   │  │ Hydration    │  │   Initialize     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │   Phase 4    │  │   Phase 5    │                          │
│  │   Budget     │──▶│   Drift      │                          │
│  │ Enforcement  │  │ Detection    │                          │
│  └──────────────┘  └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER                         │
│                                                              │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐     │
│   │ PostgreSQL  │   │  RuVector   │   │    Files    │     │
│   │ (Database)  │   │(Knowledge)  │   │(.opencode)  │     │
│   └─────────────┘   └─────────────┘   └─────────────┘     │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐  │
│   │              Memory Bank (Fallback)                  │  │
│   │         (memory-bank/*.md files)                     │  │
│   └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Session Bootstrap (`session-bootstrap.ts`)

The entry point that orchestrates the complete session initialization flow.

**Key Features:**
- 5-phase initialization (encoding → hydration → checkpoint → budget → drift)
- Automatic phase transitions with checkpoints
- Crash recovery support
- Graceful shutdown handling

**Phases:**
| Phase | Purpose | Status |
|-------|---------|--------|
| `WAITING` | Initial state, not yet active | Standby |
| `DEV` | Active development work | In Progress |
| `CODE_REVIEW` | Code review in progress | Reviewing |
| `CORRECT_COURSE` | Adjusting based on feedback | Correcting |
| `BLOOD_LOOP` | Running tests/validation | Validating |
| `RETROSPECTIVE` | Epic-level review | Reviewing |

```typescript
// Update phase with automatic checkpoint
await bootstrap.updatePhase('CODE_REVIEW', {
  story: 'story-1.1',
  completedTests: ['test1', 'test2'],
});
```

### 2. Checkpoint Manager (`checkpoint-manager.ts`)

Provides 5-minute automatic checkpoints with integrity verification.

**Features:**
- Automatic checkpoints every 5 minutes
- PostgreSQL persistence for durability
- File backups for fast recovery
- SHA-256 checksums for integrity
- Automatic cleanup (max 10 checkpoints retained)

```typescript
import { CheckpointManager } from '@/lib/session/checkpoint-manager';

const manager = new CheckpointManager({
  checkpointDir: '.opencode/state/checkpoints',
  checkpointInterval: 5 * 60 * 1000, // 5 minutes
  maxCheckpoints: 10,
  enableDbPersistence: true,
});

// Create manual checkpoint
const checkpointId = await manager.createCheckpoint(
  sessionId,
  groupId,
  'BLOOD_LOOP',
  { testResults: ['pass'], coverage: 95.5 }
);

// Load latest for recovery
const checkpoint = await manager.loadLatestCheckpoint(sessionId);
```

### 3. State Hydrator (`state-hydrator.ts`)

Implements the 4-layer encoding priority for state recovery.

**Hydration Order:**
1. PostgreSQL (most durable, primary source)
2. RuVector semantic layer (curated knowledge, versioned)
3. Files (`.opencode/state`, fast recovery)
4. Memory Bank (fallback documentation)

```typescript
import { StateHydrator } from '@/lib/session/state-hydrator';

const hydrator = new StateHydrator();

// Hydrate from all sources
const state = await hydrator.hydrate(sessionId, groupId);
console.log('Loaded from:', state.loadedFrom); // 'database' | 'serialization' | 'files' | 'memory-bank'
```

### 4. Encoding Validator (`../validation/encoding-validator.ts`)

Validates UTF-8 integrity across all project files.

**Checks:**
- BOM (Byte Order Mark) detection
- Null byte detection (corruption indicator)
- Control character validation
- UTF-8 round-trip verification
- YAML/JSON/TypeScript structure validation

```typescript
import { EncodingValidator } from '@/lib/validation/encoding-validator';

const validator = new EncodingValidator();

// Validate single file
const result = validator.validateUtf8File(filePath, content);
if (!result.valid) {
  console.error(result.error); // "BOM detected..." or "Null byte detected..."
}

// Validate memory bank
const validation = await validator.validateMemoryBank('memory-bank');
```

### 5. Planning Drift Analyzer (`../validation/planning-drift-analyzer.ts`)

Detects when implementation drifts from planned work.

**Drift Types:**
| Type | Description |
|------|-------------|
| `story_vs_ac` | Story implementation doesn't match acceptance criteria |
| `story_vs_epic` | Story timeline doesn't match epic timeline |
| `subagent_vs_plan` | Subagent behavior doesn't match planned workflow |
| `code_vs_spec` | Code implementation doesn't match specification |

```typescript
import { PlanningDriftAnalyzer } from '@/lib/validation/planning-drift-analyzer';

const analyzer = new PlanningDriftAnalyzer();
await analyzer.loadPlanningArtifacts();

// Check for drift
const drift = analyzer.analyzeStoryVsAc('story-1.1', [
  'Implemented encoding validator',
  'Added UTF-8 validation',
]);

if (drift?.hasDrift) {
  console.log('Severity:', drift.severity); // 'FATAL' | 'WARNING' | 'INFO'
  console.log('Remediation:', drift.remediation);
}
```

### 6. Alert Manager (`../monitoring/alert-manager.ts`)

Centralized FATAL/WARNING/INFO alert handling.

**Categories:**
- `encoding` - UTF-8 validation errors
- `budget` - Budget enforcement issues
- `checkpoint` - Checkpoint persistence issues
- `hydration` - State hydration failures
- `drift` - Planning drift detection
- `database` - PostgreSQL errors
- `subagent` - Subagent coordination errors

```typescript
import { getAlertManager } from '@/lib/monitoring/alert-manager';

const alerts = getAlertManager();

// Create alerts
alerts.fatal('budget', 'Budget Exhausted', 'Token budget exceeded 100k limit');
alerts.warning('drift', 'Story Drift Detected', 'Story 1.1 implementation diverges');
alerts.info('checkpoint', 'Checkpoint Created', 'Automatic checkpoint saved');

// Get statistics
const stats = alerts.getStats();
console.log('Fatal:', stats.fatal, 'Warning:', stats.warning);
```

### 7. Budget Enforcer (`../budget/enforcer.ts`)

Hard limit enforcement for tokens, tool calls, time, cost, and steps.

**Default Budgets:**
| Resource | Default | Story Budget |
|----------|---------|--------------|
| Tokens | 100k | 20k |
| Tool Calls | 100 | 20 |
| Time | 5 min | 2 min |
| Cost | $10 | $2 |
| Steps | 50 | 20 |

```typescript
import { BudgetEnforcer } from '@/lib/budget/enforcer';

const enforcer = new BudgetEnforcer();

// Check before execution
const result = await enforcer.checkBeforeExecution(sessionId);
if (!result.allowed) {
  console.error('Halted:', result.haltReason);
}

// Quick check
if (enforcer.canContinue(sessionId)) {
  // Proceed with execution
}
```

---

## 4-Layer Encoding Priority

When hydrating state, the system tries each layer in order:

```
Priority 1: PostgreSQL (Database)
           ├── Most durable
           ├── Transaction-safe
           └── Primary source of truth
           
Priority 2: Serialization
           ├── Curated knowledge
           ├── Versioned with SUPERSEDES
           └── Knowledge graph structure
           
Priority 3: Files (.opencode/state)
           ├── Fast recovery
           ├── Local filesystem
           └── JSON format
           
Priority 4: Memory Bank
           ├── Fallback documentation
           ├── Markdown files
           └── Human-readable
```

**When Creating Checkpoints:** Write to ALL layers for maximum durability.

**When Hydrating:** Try each layer until successful.

---

## Alert Severity Levels

### FATAL (Halt Execution)

**Triggers:**
- Budget exceeded (tokens, tool calls, time, cost, steps)
- Database connection failure
- Checkpoint persistence failure
- Encoding validation failure (null bytes, corruption)
- State hydration failure (all layers unavailable)

**Action:**
1. Create forensic snapshot
2. Log to PostgreSQL
3. **HALT** and wait for human diagnosis
4. Never auto-recover from FATAL

```typescript
// FATAL alert example
alertManager.fatal(
  'budget',
  'Token Budget Exceeded',
  'Session consumed 102,456 tokens (limit: 100,000)',
  { sessionId, tokensConsumed, tokensLimit }
);
// Execution halts here
```

### WARNING (Log and Continue)

**Triggers:**
- Encoding warnings (BOM, UTF-8 issues in non-critical files)
- Drift detected (story vs AC, story vs epic)
- Checkpoint directory issues (created automatically)
- Subagent workflow deviation

**Action:**
1. Log warning
2. Continue execution
3. Notify if warning persists > 3 occurrences

```typescript
// WARNING alert example
alertManager.warning(
  'drift',
  'Story Drift Detected',
  'Story 1.1 missing 2 acceptance criteria',
  { storyId: 'story-1.1', missingAc: ['AC-3', 'AC-5'] }
);
// Execution continues
```

### INFO (Log Only)

**Triggers:**
- Checkpoint created
- Phase transition
- State hydrated from X
- Component health check passed

**Action:**
1. Log to file
2. No notification
3. No execution impact

```typescript
// INFO alert example
alertManager.info(
  'checkpoint',
  'Automatic Checkpoint Created',
  'Checkpoint saved to PostgreSQL and files',
  { checkpointId, phase: 'DEV' }
);
```

---

## Checkpoint & Recovery Flow

### Normal Operation

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Start     │────▶│  Bootstrap  │────▶│    DEV      │
│   Session   │     │  Session    │     │   Phase     │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                       ┌────────────────────────┘
                       │ (Every 5 min)
                       ▼
              ┌─────────────┐
              │  Automatic  │
              │ Checkpoint  │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │ PostgreSQL  │
              │   + Files   │
              └─────────────┘
```

### Recovery Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Crash    │────▶│   Detect    │────▶│   Load      │
│   Detected  │     │  Recovery   │     │ Checkpoint  │
└─────────────┘     │   Needed    │     └──────┬──────┘
                    └─────────────┘            │
                                               ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Resume    │◀────│   Hydrate   │
                    │   Session   │     │    State    │
                    └─────────────┘     └─────────────┘
```

### Code Example

```typescript
// Initialize with recovery support
const bootstrap = new SessionBootstrap({
  groupId: 'allura-project-1',
  enableCheckpoints: true,
});

// Attempt bootstrap
const result = await bootstrap.bootstrap();

if (!result.success) {
  // Check if we can recover
  const hasFatal = result.errors.some(e => e.includes('FATAL'));
  
  if (hasFatal) {
    console.log('Attempting recovery...');
    const recovered = await bootstrap.recover();
    
    if (recovered) {
      console.log(`Recovered to phase: ${recovered.phase}`);
      console.log(`Last checkpoint: ${recovered.checkpointId}`);
      // Continue from recovered state
    } else {
      console.error('Recovery failed - manual intervention required');
      process.exit(1);
    }
  }
}

// Graceful shutdown when done
await bootstrap.shutdown();
```

---

## Integration Points

### With BMad Workflow

```
bmad-dev-story          → Bootstrap session, enable budget
    ↓
bmad-code-review        → Checkpoint before review, detect drift
    ↓
bmad-correct-course     → Analyze drift, update state
    ↓
[ Blood Loop ]          → Run tests, validate encoding, enforce budget
    ↓
bmad-retrospective      → Analyze epic-level drift, create snapshot
```

### With Trace Recording (Story 1.1)

The Session Stability system provides the foundation for Story 1.1 (Record Raw Execution Traces):

```typescript
// Session bootstrap initializes trace recording
const bootstrap = new SessionBootstrap({
  groupId: 'allura-project-1',
  enableCheckpoints: true,
});

// After bootstrap, trace recording is active
// Traces include:
// - Session lifecycle events
// - Checkpoint creations
// - Alert generations
// - Phase transitions
// - Budget status changes
```

**Integration Points:**
1. **Session Start** → Log session initialization trace
2. **Phase Transition** → Log phase change with context
3. **Checkpoint Created** → Log checkpoint persistence
4. **Alert Generated** → Log alert with severity and category
5. **Budget Check** → Log consumption metrics
6. **Recovery** → Log recovery attempt and result

### With Memory Bank

The Memory Bank serves as the fallback (Layer 4) for state hydration:

```typescript
// If all other sources fail, hydrate from Memory Bank
const state = await hydrator.hydrate(sessionId, groupId);
// state.loadedFrom === 'memory-bank'

// Memory Bank files consulted:
// - activeContext.md (current focus)
// - progress.md (completed work)
// - systemPatterns.md (architecture patterns)
// - techContext.md (tech stack details)
// - projectbrief.md (project scope)
```

---

## Usage Examples

### Complete Session Lifecycle

```typescript
import { SessionBootstrap } from '@/lib/session/session-bootstrap';
import { getAlertManager } from '@/lib/monitoring/alert-manager';

async function runAgentSession() {
  // 1. Initialize
  const bootstrap = new SessionBootstrap({
    groupId: 'allura-epic-1',
    enableEncodingValidation: true,
    enableCheckpoints: true,
    enableBudget: true,
    enableDriftDetection: true,
  });

  // 2. Bootstrap with recovery
  let result = await bootstrap.bootstrap();
  
  if (!result.success) {
    const recovered = await bootstrap.recover();
    if (!recovered) {
      throw new Error('Session initialization failed');
    }
    result = { ...result, state: recovered };
  }

  const sessionId = result.sessionId;
  console.log(`Session ${sessionId} ready`);

  // 3. Transition to DEV phase
  await bootstrap.updatePhase('DEV', { story: 'story-1.1' });

  // 4. Do work with budget checks
  const enforcer = bootstrap['budgetEnforcer']; // Access internal
  
  while (enforcer?.canContinue({ groupId: 'allura-epic-1', agentId: 'builder', sessionId })) {
    // Do work...
    
    // Record step
    await enforcer.recordStep({ groupId: 'allura-epic-1', agentId: 'builder', sessionId });
  }

  // 5. Transition to review
  await bootstrap.updatePhase('CODE_REVIEW');

  // 6. Graceful shutdown
  await bootstrap.shutdown();
}
```

### Custom Alert Handlers

```typescript
import { getAlertManager } from '@/lib/monitoring/alert-manager';

const alerts = getAlertManager();

// Register FATAL handler
alerts.registerHandler('FATAL', async (alert) => {
  // Send to notification service
  await notifyOpsTeam({
    severity: 'CRITICAL',
    title: alert.title,
    description: alert.description,
    sessionId: alert.sessionId,
  });
  
  // Create forensic snapshot
  await createForensicSnapshot(alert.sessionId);
  
  // Halt execution
  process.exit(1);
});

// Register WARNING handler
alerts.registerHandler('WARNING', async (alert) => {
  // Log to monitoring dashboard
  await logToDashboard({
    type: 'warning',
    category: alert.category,
    message: alert.description,
  });
});
```

### Manual Checkpointing

```typescript
import { CheckpointManager } from '@/lib/session/checkpoint-manager';

const manager = new CheckpointManager({
  checkpointDir: '.opencode/state/checkpoints',
  maxCheckpoints: 20,
});

// Before risky operation
const checkpointId = await manager.createCheckpoint(
  sessionId,
  groupId,
  'BEFORE_DATABASE_MIGRATION',
  { migrationVersion: 'v2.1.0', tables: ['users', 'sessions'] }
);

try {
  // Run migration
  await runDatabaseMigration();
  
  // Success - mark checkpoint as complete
  await manager.createCheckpoint(
    sessionId,
    groupId,
    'AFTER_DATABASE_MIGRATION',
    { status: 'success', checkpointId }
  );
} catch (error) {
  // Failure - restore from checkpoint
  const checkpoint = await manager.loadCheckpoint(checkpointId);
  await rollbackToCheckpoint(checkpoint);
  throw error;
}
```

---

## Monitoring & Auditing

### Daily Audit Script

```bash
# Run daily via cron or CI
./scripts/audit/daily-audit.sh
```

**Checks:**
- Encoding validation
- Database health
- State directory health
- Budget enforcement
- Health endpoint
- TypeScript/lint
- Git status

### Weekly Audit Script

```bash
# Run weekly via cron or CI
./scripts/audit/weekly-audit.sh
```

**Checks:**
- Dependency updates
- Security vulnerabilities
- Database maintenance (VACUUM, ANALYZE)
- Log rotation
- Long-term drift analysis
- Performance metrics collection
- Trend analysis

### Health API

```bash
# Basic health check
curl http://localhost:3000/api/health

# Detailed health check
curl http://localhost:3000/api/health?detailed=true

# Check specific components
curl http://localhost:3000/api/health?include=postgresql

# Acknowledge alerts
curl -X POST http://localhost:3000/api/health \
  -H "Content-Type: application/json" \
  -d '{"alertId": "...", "acknowledgedBy": "user@example.com"}'
```

---

## Next Steps

### Integration with Story 1.1 (Trace Recording)

The Session Stability system provides the infrastructure for Story 1.1. Next steps:

1. **Trace Schema Definition**
   - Define trace event types (session_start, checkpoint, alert, phase_transition)
   - Design PostgreSQL schema for raw traces
   - Implement append-only write pattern

2. **Trace Integration Points**
   - Hook into SessionBootstrap lifecycle events
   - Capture checkpoint creation events
   - Log all alert generations
   - Record phase transitions

3. **Trace Query Interface**
   - Build query API for trace retrieval
   - Implement time-range queries
   - Support filtering by event type
   - Enable trace reconstruction

4. **Story 1.1 Implementation**
   - Create story file with AC and tasks
   - Implement trace recording in PostgreSQL
   - Add trace validation and integrity checks
   - Build trace query tools

### Related Files

| File | Purpose |
|------|---------|
| `checkpoint-manager.ts` | Checkpoint persistence |
| `state-hydrator.ts` | State recovery |
| `session-bootstrap.ts` | Entry point |
| `../validation/encoding-validator.ts` | UTF-8 validation |
| `../validation/planning-drift-analyzer.ts` | Drift detection |
| `../monitoring/alert-manager.ts` | Alert handling |
| `../budget/enforcer.ts` | Budget enforcement |
| `../../../scripts/audit/daily-audit.sh` | Daily checks |
| `../../../scripts/audit/weekly-audit.sh` | Weekly checks |

### Documentation

- **Skill Reference:** `.opencode/skills/session-stability/SKILL.md`
- **Memory Bank:** `memory-bank/systemPatterns.md`
- **Project Brief:** `docs/roninmemory/PROJECT.md`

---

## License

MIT © [ronin4life](https://github.com/Charitablebusinessronin)
