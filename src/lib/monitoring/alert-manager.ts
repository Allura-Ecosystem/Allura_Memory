/**
 * Alert Manager - FATAL/WARNING/INFO Alert Handling
 *
 * Manages alerts across the 6-month operational stability plan:
 * - FATAL: Halt execution, require human intervention
 * - WARNING: Log and continue, notify if persistent
 * - INFO: Log only
 *
 * This ensures errors are handled consistently and don't cascade.
 */

import { z } from 'zod';

/**
 * Alert severity levels
 */
export type AlertSeverity = 'FATAL' | 'WARNING' | 'INFO';

/**
 * Alert category
 */
export type AlertCategory = 
  | 'encoding'           // UTF-8 validation errors
  | 'budget'            // Budget enforcement issues
  | 'checkpoint'        // Checkpoint persistence issues
  | 'hydration'         // State hydration failures
  | 'drift'             // Planning drift detection
  | 'database'          // PostgreSQL connection/query errors
  | 'subagent'          // Subagent coordination errors
  | 'validation'        // Data validation errors
  | 'recovery'          // Recovery mechanism failures
  | 'security';         // Security-related alerts

/**
 * Alert definition
 */
export const AlertDefinitionSchema = z.object({
  /** Unique alert ID */
  id: z.string().uuid(),
  /** Severity level */
  severity: z.enum(['FATAL', 'WARNING', 'INFO']),
  /** Category of alert */
  category: z.enum([
    'encoding',
    'budget',
    'checkpoint',
    'hydration',
    'drift',
    'database',
    'subagent',
    'validation',
    'recovery',
    'security',
  ] as const),
  /** Alert title */
  title: z.string(),
  /** Detailed description */
  description: z.string(),
  /** Error stack trace if applicable */
  stackTrace: z.string().optional(),
  /** Related context */
  context: z.record(z.string(), z.unknown()).optional(),
  /** Session ID if applicable */
  sessionId: z.string().uuid().optional(),
  /** Group ID for tenant isolation */
  groupId: z.string().optional(),
  /** Timestamp of alert */
  timestamp: z.string().datetime(),
  /** Whether alert has been acknowledged */
  acknowledged: z.boolean(),
  /** User who acknowledged (if applicable) */
  acknowledgedBy: z.string().optional(),
  /** Timestamp of acknowledgment */
  acknowledgedAt: z.string().datetime().optional(),
  /** Remediation suggestion */
  remediation: z.string().optional(),
});

export type AlertDefinition = z.infer<typeof AlertDefinitionSchema>;

/**
 * Alert handler callback
 */
export type AlertHandler = (alert: AlertDefinition) => Promise<void> | void;

/**
 * Alert manager configuration
 */
export interface AlertManagerConfig {
  /** Maximum alerts to retain in memory */
  maxAlertsInMemory: number;
  /** Enable console logging */
  enableConsoleLogging: boolean;
  /** Enable file logging */
  enableFileLogging: boolean;
  /** File log path */
  logFilePath: string;
  /** Enable database logging */
  enableDatabaseLogging: boolean;
  /** Custom alert handlers */
  handlers: {
    FATAL: AlertHandler[];
    WARNING: AlertHandler[];
    INFO: AlertHandler[];
  };
}

const DEFAULT_CONFIG: AlertManagerConfig = {
  maxAlertsInMemory: 100,
  enableConsoleLogging: true,
  enableFileLogging: false,
  logFilePath: '.opencode/state/alerts.log',
  enableDatabaseLogging: false,
  handlers: {
    FATAL: [],
    WARNING: [],
    INFO: [],
  },
};

/**
 * Alert Manager
 *
 * Centralizes alert handling for operational stability.
 */
export class AlertManager {
  private config: AlertManagerConfig;
  private alerts: Map<string, AlertDefinition> = new Map();
  private alertCount: number = 0;

  constructor(config?: Partial<AlertManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create an alert
   */
  createAlert(
    severity: AlertSeverity,
    category: AlertCategory,
    title: string,
    description: string,
    context?: Record<string, unknown>
  ): AlertDefinition {
    const alert: AlertDefinition = {
      id: crypto.randomUUID(),
      severity,
      category,
      title,
      description,
      context,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };

    // Track in memory
    this.trackAlert(alert);

    // Log alert
    this.logAlert(alert);

    // Execute handlers
    this.executeHandlers(alert);

    // Return alert for further processing
    return alert;
  }

  /**
   * Create a FATAL alert
   */
  fatal(
    category: AlertCategory,
    title: string,
    description: string,
    context?: Record<string, unknown>
  ): AlertDefinition {
    const alert = this.createAlert('FATAL', category, title, description, context);

    // FATAL alerts should halt execution in production
    // In tests or development, this might be configurable
    console.error(`[FATAL] ${title}: ${description}`);
    
    return alert;
  }

  /**
   * Create a WARNING alert
   */
  warning(
    category: AlertCategory,
    title: string,
    description: string,
    context?: Record<string, unknown>
  ): AlertDefinition {
    return this.createAlert('WARNING', category, title, description, context);
  }

  /**
   * Create an INFO alert
   */
  info(
    category: AlertCategory,
    title: string,
    description: string,
    context?: Record<string, unknown>
  ): AlertDefinition {
    return this.createAlert('INFO', category, title, description, context);
  }

  /**
   * Track alert in memory
   */
  private trackAlert(alert: AlertDefinition): void {
    this.alerts.set(alert.id, alert);
    this.alertCount++;

    // Enforce max alerts limit
    if (this.alerts.size > this.config.maxAlertsInMemory) {
      // Remove oldest alert
      const oldestKey = this.alerts.keys().next().value;
      if (oldestKey) {
        this.alerts.delete(oldestKey);
      }
    }
  }

  /**
   * Log alert to configured destinations
   */
  private logAlert(alert: AlertDefinition): void {
    // Console logging
    if (this.config.enableConsoleLogging) {
      const logMessage = `[${alert.severity}] [${alert.category}] ${alert.title}: ${alert.description}`;
      
      switch (alert.severity) {
        case 'FATAL':
          console.error(logMessage);
          break;
        case 'WARNING':
          console.warn(logMessage);
          break;
        case 'INFO':
          console.info(logMessage);
          break;
      }
    }

    // File logging (async, fire-and-forget)
    if (this.config.enableFileLogging) {
      this.logToFile(alert).catch(err => {
        console.error('[AlertManager] Failed to log to file:', err);
      });
    }

    // Database logging (async, fire-and-forget)
    if (this.config.enableDatabaseLogging) {
      this.logToDatabase(alert).catch(err => {
        console.error('[AlertManager] Failed to log to database:', err);
      });
    }
  }

  /**
   * Log alert to file
   */
  private async logToFile(alert: AlertDefinition): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Ensure log directory exists
    const logDir = path.dirname(this.config.logFilePath);
    await fs.mkdir(logDir, { recursive: true });

    // Append to log file
    const logLine = JSON.stringify(alert) + '\n';
    await fs.appendFile(this.config.logFilePath, logLine, 'utf8');
  }

  /**
   * Log alert to database
   */
  private async logToDatabase(alert: AlertDefinition): Promise<void> {
    // TODO: Implement database logging when PostgreSQL client is available
    console.log(`[AlertManager] Would log alert to database: ${alert.id}`);
  }

  /**
   * Execute registered handlers
   */
  private executeHandlers(alert: AlertDefinition): void {
    const handlers = this.config.handlers[alert.severity];
    
    for (const handler of handlers) {
      try {
        const result = handler(alert);
        if (result instanceof Promise) {
          result.catch(err => {
            console.error('[AlertManager] Handler failed:', err);
          });
        }
      } catch (error) {
        console.error('[AlertManager] Handler error:', error);
      }
    }
  }

  /**
   * Register a custom handler
   */
  registerHandler(severity: AlertSeverity, handler: AlertHandler): void {
    this.config.handlers[severity].push(handler);
  }

  /**
   * Acknowledge an alert
   */
  acknowledge(alertId: string, acknowledgedBy?: string): void {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      console.warn(`[AlertManager] Alert ${alertId} not found`);
      return;
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date().toISOString();

    console.log(`[AlertManager] Alert ${alertId} acknowledged by ${acknowledgedBy || 'system'}`);
  }

  /**
   * Get alert by ID
   */
  getAlert(alertId: string): AlertDefinition | undefined {
    return this.alerts.get(alertId);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): AlertDefinition[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: AlertSeverity): AlertDefinition[] {
    return this.getAllAlerts().filter(alert => alert.severity === severity);
  }

  /**
   * Get alerts by category
   */
  getAlertsByCategory(category: AlertCategory): AlertDefinition[] {
    return this.getAllAlerts().filter(alert => alert.category === category);
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledgedAlerts(): AlertDefinition[] {
    return this.getAllAlerts().filter(alert => !alert.acknowledged);
  }

  /**
   * Check for FATAL alerts (should halt execution)
   */
  hasFatalAlerts(): boolean {
    return this.getAlertsBySeverity('FATAL').length > 0;
  }

  /**
   * Get alert statistics
   */
  getStats(): {
    total: number;
    fatal: number;
    warning: number;
    info: number;
    unacknowledged: number;
    byCategory: Record<AlertCategory, number>;
  } {
    const alerts = this.getAllAlerts();
    
    return {
      total: alerts.length,
      fatal: alerts.filter(a => a.severity === 'FATAL').length,
      warning: alerts.filter(a => a.severity === 'WARNING').length,
      info: alerts.filter(a => a.severity === 'INFO').length,
      unacknowledged: alerts.filter(a => !a.acknowledged).length,
      byCategory: alerts.reduce((acc, alert) => {
        acc[alert.category] = (acc[alert.category] || 0) + 1;
        return acc;
      }, {} as Record<AlertCategory, number>),
    };
  }

  /**
   * Clear all alerts (use with caution)
   */
  clearAll(): void {
    this.alerts.clear();
    console.log('[AlertManager] All alerts cleared');
  }

  /**
   * Export alerts for debugging
   */
  exportAlerts(): string {
    const alerts = this.getAllAlerts();
    return JSON.stringify(alerts, null, 2);
  }
}

/**
 * Create alert manager singleton
 */
let alertManagerInstance: AlertManager | null = null;

export function createAlertManager(
  config?: Partial<AlertManagerConfig>
): AlertManager {
  return new AlertManager(config);
}

export function getAlertManager(
  config?: Partial<AlertManagerConfig>
): AlertManager {
  if (!alertManagerInstance) {
    alertManagerInstance = createAlertManager(config);
  }
  return alertManagerInstance;
}

/**
 * Default export
 */
export default AlertManager;