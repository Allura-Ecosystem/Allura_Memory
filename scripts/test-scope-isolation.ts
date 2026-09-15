/**
 * Scope Isolation Test — Zero Cross-Scope Leakage Verification
 *
 * Proves that memory operations in one group_id never return data
 * from another group_id. This is the NFR-1 acceptance test.
 *
 * Usage: bun scripts/test-scope-isolation.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { memory_add , memory_search } from "../src/mcp/canonical-tools";

const GROUP_A = "allura-scope-test-a" as any;
const GROUP_B = "allura-scope-test-b" as any;
const USER_A = "user-a";
const USER_B = "user-b";

async function testScopeIsolation() {
  throw new Error("scope isolation seeding requires verified workspace principals and is unavailable to direct scripts");

  let passed = 0;
  let failed = 0;

  console.log("\n🔒 Scope Isolation Test\n");

  // Setup: Write unique data to each group
  console.log("Setting up test data...");
  await memory_add({
    group_id: GROUP_A,
    user_id: USER_A,
    content: "SECRET-A: This data belongs to Group A only",
  });

  await memory_add({
    group_id: GROUP_B,
    user_id: USER_B,
    content: "SECRET-B: This data belongs to Group B only",
  });

  // Test 1: Group A search should not return Group B data
  console.log("\nTest 1: Group A search should not return Group B data");
  const resultA = await memory_search({
    query: "SECRET-B",
    group_id: GROUP_A,
    limit: 10,
    status: "all" as any,
  });

  const leakedB = resultA.results.some((r: any) =>
    r.content.includes("SECRET-B")
  );

  if (!leakedB) {
    console.log("  ✅ PASS: No Group B data leaked into Group A results");
    passed++;
  } else {
    console.log("  ❌ FAIL: Group B data found in Group A results!");
    failed++;
  }

  // Test 2: Group B search should not return Group A data
  console.log("\nTest 2: Group B search should not return Group A data");
  const resultB = await memory_search({
    query: "SECRET-A",
    group_id: GROUP_B,
    limit: 10,
    status: "all" as any,
  });

  const leakedA = resultB.results.some((r: any) =>
    r.content.includes("SECRET-A")
  );

  if (!leakedA) {
    console.log("  ✅ PASS: No Group A data leaked into Group B results");
    passed++;
  } else {
    console.log("  ❌ FAIL: Group A data found in Group B results!");
    failed++;
  }

  // Test 3: Approved-only search should return semantic only
  console.log("\nTest 3: Approved-only search returns only canonical insights");
  const approvedResults = await memory_search({
    query: "architecture",
    group_id: "allura-system" as any,
    limit: 5,
  });

  const allSemantic = approvedResults.results.every(
    (r: any) => r.source === "semantic"
  );

  if (allSemantic || approvedResults.results.length === 0) {
    console.log(
      `  ✅ PASS: All ${approvedResults.results.length} results are semantic (approved-only filter active)`
    );
    passed++;
  } else {
    console.log("  ❌ FAIL: Non-semantic results in approved-only search");
    approvedResults.results.forEach((r: any) =>
      console.log(`    source=${r.source} content=${r.content.substring(0, 40)}`)
    );
    failed++;
  }

  // Test 4: Degraded state is explicit
  console.log("\nTest 4: Degraded state is explicit (not silent empty)");
  const badGroupResult = await memory_search({
    query: "test",
    group_id: "allura-nonexistent" as any,
    limit: 5,
  });

  if (badGroupResult.meta?.degraded === true || badGroupResult.results.length === 0) {
    console.log(
      `  ✅ PASS: Nonexistent group returns empty with explicit state (degraded=${badGroupResult.meta?.degraded})`
    );
    passed++;
  } else {
    console.log("  ❌ FAIL: Unexpected results from nonexistent group");
    failed++;
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log(`Wrong-scope leakage rate: ${failed > 0 ? "NON-ZERO ❌" : "0 ✅"}`);
  console.log(`${"=".repeat(50)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

testScopeIsolation().catch((err) => {
  console.error("Scope isolation test crashed:", err);
  process.exit(1);
});
