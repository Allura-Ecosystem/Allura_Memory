import { describe, expect, it } from "vitest";
import {
  assertValidGroupId,
  GROUP_ID_RULES,
  GroupIdValidationError,
  isGlobalGroupId,
  isReservedGroupId,
  isValidGroupId,
  normalizeGroupId,
  RESERVED_GROUP_IDS,
  validateGroupId,
  validateGroupIds,
  validateGroupIdWithRules,
  ValidGroupId,
} from "./group-id";

// Pre-Phase-4 baseline — tracked in docs/deferred/pre-existing-failures.md
// Reason: tests use generic group IDs like "my-project" but implementation now requires
// allura-* format; RESERVED_GROUP_IDS constant changed; tests need data updates
const shouldRunGroupIdStrict = process.env.RUN_GROUP_ID_STRICT === "true";

describe("group-id validation", () => {
  // =========================================================================
  // validateGroupId Tests
  // =========================================================================

  describe("validateGroupId", () => {
    it("should accept valid allura-* group_id", () => {
      expect(validateGroupId("allura-my-project")).toBe("allura-my-project");
      expect(validateGroupId("allura-project123")).toBe("allura-project123");
      expect(validateGroupId("allura-my-project")).toBe("allura-my-project");
      expect(validateGroupId("allura-ab")).toBe("allura-ab"); // Minimum meaningful allura- ID
    });

    // Story 24.10 AC-7 controlled-red fixture: this assertion is deliberately
    // wrong and exists only on the disposable ci/controlled-red-24-10 branch.
    it("deliberately fails to prove branch protection blocks merge", () => {
      expect(validateGroupId("allura-controlled-red")).toBe("blocked-by-required-check");
    });

    it("should reject null or undefined", () => {
      expect(() => validateGroupId(null)).toThrow(GroupIdValidationError);
      expect(() => validateGroupId(null)).toThrow("group_id is required");
      expect(() => validateGroupId(undefined)).toThrow("group_id is required");
    });

    it("should reject non-string values", () => {
      expect(() => validateGroupId(123)).toThrow(GroupIdValidationError);
      expect(() => validateGroupId(123)).toThrow("must be a string");
      expect(() => validateGroupId({})).toThrow("must be a string");
      expect(() => validateGroupId([])).toThrow("must be a string");
    });

    it("should reject empty string", () => {
      expect(() => validateGroupId("")).toThrow("cannot be empty");
      expect(() => validateGroupId("   ")).toThrow("cannot be empty");
      expect(() => validateGroupId("\t\n")).toThrow("cannot be empty");
    });

    it("should reject uppercase characters (NFR11)", () => {
      expect(() => validateGroupId("allura-My-Project")).toThrow("must be lowercase only");
      expect(() => validateGroupId("ALLURA-PROJECT")).toThrow("must be lowercase only");
      expect(() => validateGroupId("allura-myProject")).toThrow("must be lowercase only");
    });

    it("should reject group_id without allura prefix (ARCH-001)", () => {
      expect(() => validateGroupId("my-project")).toThrow("must match pattern allura-*");
      expect(() => validateGroupId("project123")).toThrow("must match pattern allura-*");
      expect(() => validateGroupId("global")).toThrow("must match pattern allura-*");
      expect(() => validateGroupId("system")).toThrow("must match pattern allura-*");
    });

    it("should reject group_id ending with hyphen", () => {
      expect(() => validateGroupId("allura-project-")).toThrow("must match pattern allura-*");
    });

    it("should reject too long group_id", () => {
      const longId = "allura-" + "a".repeat(100);
      expect(() => validateGroupId(longId)).toThrow("at most");
    });

    it("should reject invalid characters", () => {
      expect(() => validateGroupId("allura-my project")).toThrow("must match pattern allura-*");
      expect(() => validateGroupId("allura-my.project")).toThrow("must match pattern allura-*");
      expect(() => validateGroupId("allura-my@project")).toThrow("must match pattern allura-*");
      expect(() => validateGroupId("allura-my_project")).toThrow("must match pattern allura-*");
    });

    it("should trim whitespace from group_id", () => {
      expect(validateGroupId("  allura-default  ")).toBe("allura-default");
      expect(validateGroupId("\tallura-default\n")).toBe("allura-default");
    });

    it("should reject just 'allura-' with no suffix", () => {
      expect(() => validateGroupId("allura-")).toThrow("must match pattern allura-*");
    });
  });

  // =========================================================================
  // normalizeGroupId Tests
  // =========================================================================

  describe("normalizeGroupId", () => {
    it("should convert to lowercase and trim", () => {
      expect(normalizeGroupId("Allura-Project")).toBe("allura-project");
      expect(normalizeGroupId("  ALLURA-PROJECT  ")).toBe("allura-project");
      expect(normalizeGroupId("ALLURA-PROJECT")).toBe("allura-project");
    });

    it("should not validate the result", () => {
      // normalizeGroupId doesn't validate, just normalizes
      expect(normalizeGroupId("")).toBe("");
      expect(normalizeGroupId("  ")).toBe("");
    });
  });

  // =========================================================================
  // isValidGroupId Tests
  // =========================================================================

  describe("isValidGroupId", () => {
    it("should return true for valid allura-* group_ids", () => {
      expect(isValidGroupId("allura-my-project")).toBe(true);
      expect(isValidGroupId("allura-project123")).toBe(true);
    });

    it("should return false for invalid group_ids", () => {
      expect(isValidGroupId("")).toBe(false);
      expect(isValidGroupId("Allura-Project")).toBe(false);
      expect(isValidGroupId("my project")).toBe(false);
      expect(isValidGroupId("my-project")).toBe(false); // Missing allura- prefix
      expect(isValidGroupId(null)).toBe(false);
      expect(isValidGroupId(undefined)).toBe(false);
      expect(isValidGroupId(123)).toBe(false);
    });
  });

  // =========================================================================
  // isReservedGroupId Tests
  // =========================================================================

  describe("isReservedGroupId", () => {
    it("should identify reserved IDs", () => {
      expect(isReservedGroupId("allura-global")).toBe(true);
      expect(isReservedGroupId("allura-system")).toBe(true);
      expect(isReservedGroupId("allura-admin")).toBe(true);
      expect(isReservedGroupId("allura-public")).toBe(true);
    });

    it("should return false for non-reserved IDs", () => {
      expect(isReservedGroupId("allura-my-project")).toBe(false);
      expect(isReservedGroupId("allura-user123")).toBe(false);
    });

    it("should normalize before checking", () => {
      expect(isReservedGroupId("ALLURA-GLOBAL")).toBe(true);
      expect(isReservedGroupId("  Allura-Global  ")).toBe(true);
    });
  });

  // =========================================================================
  // isGlobalGroupId Tests
  // =========================================================================

  describe("isGlobalGroupId", () => {
    it("should identify global ID", () => {
      expect(isGlobalGroupId("allura-global")).toBe(true);
      expect(isGlobalGroupId("ALLURA-GLOBAL")).toBe(true);
      expect(isGlobalGroupId("  allura-global  ")).toBe(true);
    });

    it("should return false for non-global IDs", () => {
      expect(isGlobalGroupId("allura-my-project")).toBe(false);
      expect(isGlobalGroupId("allura-system")).toBe(false);
    });
  });

  // =========================================================================
  // validateGroupIds Tests
  // =========================================================================

  describe("validateGroupIds", () => {
    it("should return valid group_ids", () => {
      const result = validateGroupIds(["allura-project1", "allura-project2", "allura-project3"]);
      expect(result.valid).toEqual(["allura-project1", "allura-project2", "allura-project3"]);
      expect(result.errors).toHaveLength(0);
    });

    it("should separate invalid group_ids", () => {
      const result = validateGroupIds(["allura-project1", "Invalid", "", "allura-project2"]);
      expect(result.valid).toEqual(["allura-project1", "allura-project2"]);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].value).toBe("Invalid");
      expect(result.errors[1].value).toBe("");
    });

    it("should handle mixed valid and invalid", () => {
      const result = validateGroupIds([
        "allura-valid-project",
        "UPPERCASE",
        "allura-another-valid",
        null,
        "has space",
      ]);
      expect(result.valid).toEqual(["allura-valid-project", "allura-another-valid"]);
      expect(result.errors).toHaveLength(3);
    });
  });

  // =========================================================================
  // assertValidGroupId Tests
  // =========================================================================

  describe("assertValidGroupId", () => {
    it("should not throw for valid allura-* group_id", () => {
      expect(() => assertValidGroupId("allura-my-project")).not.toThrow();
      expect(() => assertValidGroupId("allura-project123")).not.toThrow();
    });

    it("should throw for invalid group_id", () => {
      expect(() => assertValidGroupId("")).toThrow();
      expect(() => assertValidGroupId("UPPERCASE")).toThrow();
      expect(() => assertValidGroupId(null)).toThrow();
      expect(() => assertValidGroupId("my-project")).toThrow(); // Missing allura- prefix
    });

    it("should narrow type to string", () => {
      const unknown: unknown = "allura-my-project";
      assertValidGroupId(unknown);
      // TypeScript should now know unknown is string
      expect(typeof unknown).toBe("string");
    });
  });

  // =========================================================================
  // ValidGroupId Class Tests
  // =========================================================================

  describe("ValidGroupId", () => {
    it("should create instance for valid allura-* group_id", () => {
      const id = new ValidGroupId("allura-my-project");
      expect(id.value).toBe("allura-my-project");
      expect(id.toString()).toBe("allura-my-project");
    });

    it("should throw for invalid group_id", () => {
      expect(() => new ValidGroupId("")).toThrow();
      expect(() => new ValidGroupId("UPPERCASE")).toThrow();
    });

    it("should throw for group_id without allura prefix", () => {
      expect(() => new ValidGroupId("my-project")).toThrow();
    });

    it("should normalize input (trim whitespace)", () => {
      const id = new ValidGroupId("  allura-my-project  ");
      expect(id.value).toBe("allura-my-project");
    });

    it("should throw for uppercase (NFR11 compliance)", () => {
      // validateGroupId rejects uppercase, so ValidGroupId must too
      expect(() => new ValidGroupId("ALLURA-MY-PROJECT")).toThrow("must be lowercase");
    });

    it("should compare with equals", () => {
      const id1 = new ValidGroupId("allura-my-project");
      const id2 = new ValidGroupId("allura-my-project");
      const id3 = new ValidGroupId("allura-other-project");

      expect(id1.equals(id2)).toBe(true);
      expect(id1.equals("allura-my-project")).toBe(true);
      expect(id1.equals(id3)).toBe(false);
      expect(id1.equals("allura-other-project")).toBe(false);
    });

    it("should detect global ID", () => {
      const globalId = new ValidGroupId("allura-global");
      const projectId = new ValidGroupId("allura-my-project");

      expect(globalId.isGlobal()).toBe(true);
      expect(projectId.isGlobal()).toBe(false);
    });

    it("should detect reserved ID", () => {
      const reserved = new ValidGroupId("allura-system");
      const projectId = new ValidGroupId("allura-my-project");

      expect(reserved.isReserved()).toBe(true);
      expect(projectId.isReserved()).toBe(false);
    });
  });

  // =========================================================================
  // validateGroupIdWithRules Tests
  // =========================================================================

  describe("validateGroupIdWithRules", () => {
    it("should enforce allura- prefix by default", () => {
      expect(validateGroupIdWithRules("allura-my-project", {})).toBe("allura-my-project");
      expect(() => validateGroupIdWithRules("my-project", {})).toThrow();
    });

    it("should allow uppercase when specified (ARCH-001 still enforces pattern)", () => {
      // When allowUppercase is true, format validation is relaxed but pattern still enforced
      // Use allowUppercase with customPattern for legacy format support
      expect(validateGroupIdWithRules("ALLURA-MY-PROJECT", { allowUppercase: true })).toBe(
        "ALLURA-MY-PROJECT"
      );
    });

    it("should reject reserved IDs by default", () => {
      expect(() => validateGroupIdWithRules("allura-global", {})).toThrow("reserved");
      expect(() => validateGroupIdWithRules("allura-system", {})).toThrow("reserved");
    });

    it("should allow reserved IDs when specified", () => {
      expect(validateGroupIdWithRules("allura-global", { allowReserved: true })).toBe("allura-global");
      expect(validateGroupIdWithRules("allura-system", { allowReserved: true })).toBe("allura-system");
    });

    it("should validate against custom pattern", () => {
      const customPattern = /^allura-team-[a-z]+$/;
      expect(validateGroupIdWithRules("allura-team-alpha", { customPattern })).toBe("allura-team-alpha");
      expect(() => validateGroupIdWithRules("allura-alpha", { customPattern })).toThrow(
        "does not match required pattern"
      );
    });

    it("should combine multiple options", () => {
      expect(
        validateGroupIdWithRules("ALLURA-GLOBAL", { allowUppercase: true, allowReserved: true })
      ).toBe("ALLURA-GLOBAL");
    });
  });

  // =========================================================================
  // Constants Tests
  // =========================================================================

  describe("constants", () => {
    it("should have correct reserved IDs", () => {
      expect(RESERVED_GROUP_IDS).toEqual(["allura-global", "allura-system", "allura-admin", "allura-public"]);
    });

    it("should have correct length rules", () => {
      expect(GROUP_ID_RULES.MIN_LENGTH).toBe(2);
      expect(GROUP_ID_RULES.MAX_LENGTH).toBe(64);
    });

    it("should have correct pattern (ARCH-001: enforces allura- prefix)", () => {
      expect(GROUP_ID_RULES.PATTERN.test("allura-my-project")).toBe(true);
      expect(GROUP_ID_RULES.PATTERN.test("allura-project123")).toBe(true);
      expect(GROUP_ID_RULES.PATTERN.test("allura-default")).toBe(true);
      expect(GROUP_ID_RULES.PATTERN.test("my-project")).toBe(false); // Missing allura- prefix
      expect(GROUP_ID_RULES.PATTERN.test("allura-")).toBe(false); // No suffix
      expect(GROUP_ID_RULES.PATTERN.test("Allura-Project")).toBe(false); // Uppercase
      expect(GROUP_ID_RULES.PATTERN.test("allura-my_project")).toBe(false); // Underscore
    });

    it("should have correct legacy pattern", () => {
      expect(GROUP_ID_RULES.LEGACY_PATTERN.test("my-project")).toBe(true);
      expect(GROUP_ID_RULES.LEGACY_PATTERN.test("project123")).toBe(true);
      expect(GROUP_ID_RULES.LEGACY_PATTERN.test("-project")).toBe(false);
    });
  });
});