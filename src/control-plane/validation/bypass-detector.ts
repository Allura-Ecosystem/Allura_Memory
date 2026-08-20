/**
 * RuVix ControlPlane Phase 3 - Bypass Detector
 *
 * Monitors for common bypass patterns and detects legacy imports.
 * Alerts on policy violations and provides migration guidance.
 *
 * DETECTION TARGETS:
 * 1. Legacy imports (@/lib/mcp/enforced-client)
 * 2. Direct module loading of database clients
 * 3. Policy violations in runtime
 * 4. Circumvention attempts
 */

import { ViolationRecord } from "../gate";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bypass attempt details
 */
export interface BypassAttempt {
  /** Timestamp of detection */
  timestamp: number;

  /** Type of bypass attempted */
  type: BypassType;

  /** Detection method used */
  detectionMethod: string;

  /** Module or file where detected */
  location: string;

  /** Specific pattern matched */
  pattern: string;

  /** Severity level */
  severity: "critical" | "high" | "medium" | "low";

  /** Suggested fix */
  suggestion: string;

  /** Whether violation was blocked */
  blocked: boolean;
}

/**
 * Types of bypass attempts
 */
export type BypassType =
  | "legacy_import"
  | "direct_client_instantiation"
  | "policy_circumvention"
  | "module_tampering"
  | "environment_manipulation"
  | "debugger_attachment";

/**
 * Detector configuration
 */
export interface DetectorConfig {
  /** Enable detection (default: true) */
  enabled: boolean;

  /** Log detections (default: true) */
  logDetections: boolean;

  /** Block on critical violations (default: true) */
  blockCritical: boolean;

  /** Alert threshold - violations before alert */
  alertThreshold: number;

  /** Allowlisted paths */
  allowlist: string[];
}

/**
 * Detection result
 */
export interface DetectionResult {
  /** Whether violation was detected */
  detected: boolean;

  /** Bypass details (if detected) */
  bypass?: BypassAttempt;

  /** Suggested action */
  action?: "block" | "warn" | "ignore";
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: DetectorConfig = {
  enabled: true,
  logDetections: true,
  blockCritical: true,
  alertThreshold: 1,
  allowlist: ["/test", "/spec", "/__tests__/", ".test.", ".spec."],
};

// Legacy imports that should be migrated
const LEGACY_IMPORTS = {
  critical: [
    /@\/lib\/mcp\/enforced-client/,
    /@\/lib\/db\/direct/,
    /@\/integrations\/mcp\.client/,
  ],
  high: [
    /from\s+["'][^"']*postgres[^"']*["']/i,
    /from\s+["'][^"']*neo4j-driver[^"']*["']/i,
    /require\s*\(\s*["'][^"']*pg["']\s*\)/i,
  ],
  medium: [
    /new\s+Pool\s*\(/i,
    /createConnection\s*\(/i,
    /driver\s*\(\s*['"]bolt/i,
  ],
};

// Bypass patterns to detect
const BYPASS_PATTERNS = {
  policy_circumvention: [
    /enforcementGate\s*\.\s*disable\s*\(\s*\)/i,
    /config\.enabled\s*=\s*false/i,
    /delete\s+require\.cache/i,
    /Object\.defineProperty.*config/i,
  ],
  module_tampering: [
    /Module\.prototype/i,
    /require\.extensions/i,
    /globalThis\[.*\]\s*=\s*/i,
  ],
  environment_manipulation: [
    /process\.env\.RUVIX_CONTROL_PLANE_SECRET\s*=/i,
    /process\.env\[.*SECRET.*\]\s*=/i,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR STATE
// ─────────────────────────────────────────────────────────────────────────────

export class BypassDetector {
  private config: DetectorConfig;
  private detections: BypassAttempt[] = [];
  private initialized: boolean = false;
  private alertCount: Map<BypassType, number> = new Map();

  constructor(config: Partial<DetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the detector
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.installHooks();
    this.initialized = true;

    if (this.config.logDetections) {
      console.log("[BypassDetector] Initialized - monitoring for bypass patterns");
    }
  }

  /**
   * Check if path is allowlisted
   */
  private isAllowlisted(path: string): boolean {
    return this.config.allowlist.some((allowed) => path.includes(allowed));
  }

  /**
   * Install detection hooks
   */
  private installHooks(): void {
    // Hook into module loading (Node.js specific)
    if (typeof require !== "undefined") {
       
      const originalRequire = (globalThis as Record<string, unknown>).require;

      // Monitor for suspicious requires
      // This is a simplified version - production would use more sophisticated hooks
      void originalRequire; // Prevent unused warning
    }

    // Hook into dynamic imports
     
    const originalImport = (globalThis as Record<string, unknown>).import;
    // Monitor for suspicious imports
    void originalImport; // Prevent unused warning
  }

  /**
   * Detect legacy imports in code
   */
  detectLegacyImports(code: string, filePath: string): DetectionResult {
    if (!this.config.enabled) {
      return { detected: false };
    }

    if (this.isAllowlisted(filePath)) {
      return { detected: false };
    }

    // Check critical patterns
    for (const pattern of LEGACY_IMPORTS.critical) {
      if (pattern.test(code)) {
        const bypass: BypassAttempt = {
          timestamp: Date.now(),
          type: "legacy_import",
          detectionMethod: "static_analysis",
          location: filePath,
          pattern: pattern.toString(),
          severity: "critical",
          suggestion: "Migrate to RuVixControlPlane.syscall or RuVixSDK",
          blocked: this.config.blockCritical,
        };

        this.recordDetection(bypass);

        return {
          detected: true,
          bypass,
          action: this.config.blockCritical ? "block" : "warn",
        };
      }
    }

    // Check high severity patterns
    for (const pattern of LEGACY_IMPORTS.high) {
      if (pattern.test(code)) {
        const bypass: BypassAttempt = {
          timestamp: Date.now(),
          type: "direct_client_instantiation",
          detectionMethod: "static_analysis",
          location: filePath,
          pattern: pattern.toString(),
          severity: "high",
          suggestion: "Use controlPlane-backed database access only",
          blocked: false,
        };

        this.recordDetection(bypass);

        return {
          detected: true,
          bypass,
          action: "warn",
        };
      }
    }

    // Check medium severity patterns
    for (const pattern of LEGACY_IMPORTS.medium) {
      if (pattern.test(code)) {
        const bypass: BypassAttempt = {
          timestamp: Date.now(),
          type: "direct_client_instantiation",
          detectionMethod: "static_analysis",
          location: filePath,
          pattern: pattern.toString(),
          severity: "medium",
          suggestion: "Review for potential direct database access",
          blocked: false,
        };

        this.recordDetection(bypass);

        return {
          detected: true,
          bypass,
          action: "warn",
        };
      }
    }

    return { detected: false };
  }

  /**
   * Detect policy circumvention at runtime
   */
  detectPolicyCircumvention(operation: string, context: Record<string, unknown>): DetectionResult {
    if (!this.config.enabled) {
      return { detected: false };
    }

    // Check for enforcement disabling
    for (const pattern of BYPASS_PATTERNS.policy_circumvention) {
      if (pattern.test(operation)) {
        const bypass: BypassAttempt = {
          timestamp: Date.now(),
          type: "policy_circumvention",
          detectionMethod: "runtime_interception",
          location: context.caller as string || "unknown",
          pattern: pattern.toString(),
          severity: "critical",
          suggestion: "Policy enforcement cannot be disabled at runtime",
          blocked: this.config.blockCritical,
        };

        this.recordDetection(bypass);

        return {
          detected: true,
          bypass,
          action: this.config.blockCritical ? "block" : "warn",
        };
      }
    }

    return { detected: false };
  }

  /**
   * Detect module tampering
   */
  detectModuleTampering(code: string, filePath: string): DetectionResult {
    if (!this.config.enabled) {
      return { detected: false };
    }

    for (const pattern of BYPASS_PATTERNS.module_tampering) {
      if (pattern.test(code)) {
        const bypass: BypassAttempt = {
          timestamp: Date.now(),
          type: "module_tampering",
          detectionMethod: "static_analysis",
          location: filePath,
          pattern: pattern.toString(),
          severity: "critical",
          suggestion: "Module system tampering detected - security violation",
          blocked: this.config.blockCritical,
        };

        this.recordDetection(bypass);

        return {
          detected: true,
          bypass,
          action: this.config.blockCritical ? "block" : "warn",
        };
      }
    }

    return { detected: false };
  }

  /**
   * Detect environment manipulation
   */
  detectEnvironmentManipulation(operation: string): DetectionResult {
    if (!this.config.enabled) {
      return { detected: false };
    }

    for (const pattern of BYPASS_PATTERNS.environment_manipulation) {
      if (pattern.test(operation)) {
        const bypass: BypassAttempt = {
          timestamp: Date.now(),
          type: "environment_manipulation",
          detectionMethod: "runtime_interception",
          location: "process.env",
          pattern: pattern.toString(),
          severity: "critical",
          suggestion: "ControlPlane secret manipulation detected - security violation",
          blocked: true,
        };

        this.recordDetection(bypass);

        return {
          detected: true,
          bypass,
          action: "block",
        };
      }
    }

    return { detected: false };
  }

  /**
   * Record a detection
   */
  private recordDetection(detection: BypassAttempt): void {
    this.detections.push(detection);

    // Update alert count
    const current = this.alertCount.get(detection.type) || 0;
    this.alertCount.set(detection.type, current + 1);

    // Check if we should alert
    const totalAlerts = Array.from(this.alertCount.values()).reduce((a, b) => a + b, 0);
    const shouldAlert = totalAlerts >= this.config.alertThreshold;

    if (this.config.logDetections || shouldAlert) {
      const level = detection.severity === "critical" ? "error" : "warn";
      console[level](
        `[BypassDetector] ${detection.severity.toUpperCase()}: ${detection.type}`,
        {
          location: detection.location,
          pattern: detection.pattern,
          suggestion: detection.suggestion,
          blocked: detection.blocked,
        }
      );
    }

    // Throw for critical blocked violations
    if (detection.blocked && detection.severity === "critical") {
      throw new BypassDetectedError(
        `Critical bypass detected: ${detection.type}`,
        detection
      );
    }
  }

  /**
   * Scan code for all bypass patterns
   */
  scanCode(code: string, filePath: string): BypassAttempt[] {
    const findings: BypassAttempt[] = [];

    // Check all detection methods
    const detectors = [
      () => this.detectLegacyImports(code, filePath),
      () => this.detectModuleTampering(code, filePath),
      () => this.detectPolicyCircumvention(code, { caller: filePath }),
      () => this.detectEnvironmentManipulation(code),
    ];

    for (const detector of detectors) {
      const result = detector();
      if (result.detected && result.bypass) {
        findings.push(result.bypass);
      }
    }

    return findings;
  }

  /**
   * Get all detections
   */
  getDetections(): BypassAttempt[] {
    return [...this.detections];
  }

  /**
   * Get detections by type
   */
  getDetectionsByType(type: BypassType): BypassAttempt[] {
    return this.detections.filter((d) => d.type === type);
  }

  /**
   * Get critical detections
   */
  getCriticalDetections(): BypassAttempt[] {
    return this.detections.filter((d) => d.severity === "critical");
  }

  /**
   * Get detection count
   */
  getDetectionCount(): number {
    return this.detections.length;
  }

  /**
   * Get detection count by type
   */
  getDetectionCountByType(type: BypassType): number {
    return this.detections.filter((d) => d.type === type).length;
  }

  /**
   * Clear detection history
   */
  clearHistory(): void {
    this.detections = [];
    this.alertCount.clear();
  }

  /**
   * Check if detector is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }

  /**
   * Get configuration
   */
  getConfig(): DetectorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Generate migration report
   */
  generateMigrationReport(): {
    critical: BypassAttempt[];
    high: BypassAttempt[];
    medium: BypassAttempt[];
    low: BypassAttempt[];
    suggestions: string[];
  } {
    const critical = this.detections.filter((d) => d.severity === "critical");
    const high = this.detections.filter((d) => d.severity === "high");
    const medium = this.detections.filter((d) => d.severity === "medium");
    const low = this.detections.filter((d) => d.severity === "low");

    const suggestions = [
      "Replace @/lib/mcp/enforced-client with RuVixSDK",
      "Use RuVixControlPlane.syscall for all database operations",
      "Remove direct pg/neo4j imports",
      "Update tests to use controlPlane-backed mocks",
    ];

    return { critical, high, medium, low, suggestions };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error thrown when bypass is detected
 */
export class BypassDetectedError extends Error {
  readonly detection: BypassAttempt;
  readonly code = "BYPASS_DETECTED";

  constructor(message: string, detection: BypassAttempt) {
    super(message);
    this.name = "BypassDetectedError";
    this.detection = detection;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global bypass detector instance
 */
export const bypassDetector = new BypassDetector();

/**
 * Initialize and enable bypass detection
 */
export function enableBypassDetector(config?: Partial<DetectorConfig>): void {
  if (config) {
    bypassDetector.updateConfig(config);
  }
  bypassDetector.initialize();
}

/**
   * Disable bypass detection
   */
export function disableBypassDetector(): void {
  bypassDetector.updateConfig({ enabled: false });
}

/**
 * Detect legacy imports in code
 */
export function detectLegacyImports(code: string, filePath: string): DetectionResult {
  return bypassDetector.detectLegacyImports(code, filePath);
}

/**
 * Detect policy circumvention
 */
export function detectPolicyCircumvention(operation: string, context: Record<string, unknown>): DetectionResult {
  return bypassDetector.detectPolicyCircumvention(operation, context);
}

/**
 * Detect module tampering
 */
export function detectModuleTampering(code: string, filePath: string): DetectionResult {
  return bypassDetector.detectModuleTampering(code, filePath);
}

/**
 * Detect environment manipulation
 */
export function detectEnvironmentManipulation(operation: string): DetectionResult {
  return bypassDetector.detectEnvironmentManipulation(operation);
}

/**
 * Scan code for all bypass patterns
 */
export function scanCodeForBypasses(code: string, filePath: string): BypassAttempt[] {
  return bypassDetector.scanCode(code, filePath);
}

/**
 * Get all detections
 */
export function getBypassDetections(): BypassAttempt[] {
  return bypassDetector.getDetections();
}

/**
 * Get critical detections
 */
export function getCriticalBypassDetections(): BypassAttempt[] {
  return bypassDetector.getCriticalDetections();
}

/**
 * Clear detection history
 */
export function clearBypassDetectionHistory(): void {
  bypassDetector.clearHistory();
}

/**
 * Generate migration report
 */
export function generateBypassMigrationReport(): {
  critical: BypassAttempt[];
  high: BypassAttempt[];
  medium: BypassAttempt[];
  low: BypassAttempt[];
  suggestions: string[];
} {
  return bypassDetector.generateMigrationReport();
}

/**
 * Check if import is legacy
 */
export function isLegacyImport(importPath: string): boolean {
  const criticalPatterns = LEGACY_IMPORTS.critical;
  return criticalPatterns.some((pattern) => pattern.test(importPath));
}

/**
 * Get migration path for legacy import
 */
export function getMigrationPath(legacyImport: string): string {
  if (legacyImport.includes("enforced-client")) {
    return "RuVixSDK (import { RuVixSDK } from '@/control-plane/sdk')";
  }
  if (legacyImport.includes("direct")) {
    return "RuVixControlPlane.syscall (import { RuVixControlPlane } from '@/control-plane/ruvix')";
  }
  return "Review and migrate to controlPlane-backed access patterns";
}
